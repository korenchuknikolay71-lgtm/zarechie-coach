// pages/api/team/readiness.js
// GET ?date=YYYY-MM-DD → morning team-readiness snapshot for every rostered player.
//
// Pulls, per player:
//   whoop:history:{id}:{date}   → recovery, hrv, rhr, sleep_hours, strain
//   survey:morning:{id}:{date}  → mws, sleep, mood, stress, doms, readiness
//   neuro:data / neuro:history  → latest cmj/rsi + baseline (avg of last 5, excl. today)
// and derives a red/yellow/green status.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { getPlayerSnapshot } from '../../../lib/playerData';
import { rosterKey } from '../../../lib/workspacePrefix';

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function computeRiskScore({ recovery, hrv, cmjDrop, lsi }) {
  let score = 0;
  if (recovery != null) {
    if (recovery < 20) score += 35;
    else if (recovery < 34) score += 25;
    else if (recovery < 66) score += 12;
  }
  if (hrv != null) {
    if (hrv < 40) score += 15;
    else if (hrv < 50) score += 10;
  }
  if (cmjDrop != null) {
    if (cmjDrop < -15) score += 30;
    else if (cmjDrop < -10) score += 20;
    else if (cmjDrop < -5) score += 10;
  }
  if (lsi != null) {
    if (lsi < 75) score += 20;
    else if (lsi < 80) score += 15;
    else if (lsi < 85) score += 8;
  }
  return Math.min(100, Math.round(score));
}

function parseJSON(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

function latestByDate(items) {
  return (Array.isArray(items) ? items : [])
    .filter(Boolean)
    .slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0] || {};
}

function latestLsiFromNeuro(neuro) {
  const lsiArr = neuro?.latest?.hist?.lsi || neuro?.latest?.lsi;
  if (Array.isArray(lsiArr) && lsiArr.length) {
    const latest = latestByDate(lsiArr);
    const parsed = num(latest.lsi ?? latest.value);
    return { lsi: parsed != null ? Math.round(parsed * 10) / 10 : null, lsiDate: latest.date || null };
  }
  if (typeof lsiArr === 'number') return { lsi: Math.round(lsiArr * 10) / 10, lsiDate: null };
  return { lsi: null, lsiDate: null };
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const date = String(req.query.date || '') ||
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
  const workspace = String(req.query.workspace || 'zarechie');

  try {
    // ── Roster ───────────────────────────────────────────────────────────────
    const rosterRaw = await redis('get', rosterKey(workspace)).catch(() => null);
    let roster = parseJSON(rosterRaw);
    if (!Array.isArray(roster)) roster = [];

    if (!roster.length) return res.status(200).json({ players: [] });

    const snapshots = await Promise.all(
      roster.map(p => getPlayerSnapshot(String(p.id), 7, date, 28, workspace).catch(() => null))
    );

    const players = roster.map((p, idx) => {
      const snapshot = snapshots[idx] || {};
      const whoop = latestByDate(snapshot.whoop);
      const survey = latestByDate(snapshot.morning);
      const neuroHist = Array.isArray(snapshot.neuro?.history) ? snapshot.neuro.history : [];
      const { lsi, lsiDate } = latestLsiFromNeuro(snapshot.neuro);
      const recovery = num(whoop.recovery);
      const hrv = num(whoop.hrv);
      const sleep_hours = num(whoop.sleep_hours);

      const mws = num(survey.mws);
      const doms = num(survey.doms);
      const readiness = num(survey.readiness);

      // CMJ today: prefer the dated history entry, fall back to neuro snapshot.
      const todayEntry = neuroHist.find(e => e && e.date === date);
      const snap = snapshot.neuro?.latest || {};
      const cmj = num(todayEntry?.cmj) ?? num(snap.cmj);
      const rsi = num(todayEntry?.rsi) ?? num(snap.rsi);

      // #10: EWMA baseline for CMJ — slowly adapting reference (λ=0.15, ~6-session half-life).
      // Walk history oldest→newest (excluding today), compute running EWMA.
      const priorHist = neuroHist
        .filter(e => e && e.date !== date && num(e.cmj) != null)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      let ewmaCmj = null;
      for (const e of priorHist) {
        const v = num(e.cmj);
        ewmaCmj = ewmaCmj == null ? v : 0.15 * v + 0.85 * ewmaCmj;
      }
      const cmjBaseline = ewmaCmj != null ? Math.round(ewmaCmj * 10) / 10 : null;
      const cmjDrop = (cmj != null && cmjBaseline)
        ? Math.round(((cmj - cmjBaseline) / cmjBaseline) * 1000) / 10
        : null;

      // ── Signal Confidence: 3-domain convergence ──────────────────────────────
      // Red requires convergence of 2+ independent domains (not one noisy sensor).
      // Domain: autonomic (WHOOP), neuromuscular (CMJ/LSI), subjective (survey).
      const domainAutonomic =
        (recovery != null && recovery < 20) || (hrv != null && hrv < 40) ? 'red'
        : (recovery != null && recovery < 34) || (hrv != null && hrv < 50) ? 'red'
        : (recovery != null && recovery <= 66) ? 'yellow'
        : 'green';

      const domainNeuro =
        (cmjDrop != null && cmjDrop < -15) || (lsi != null && lsi < 75) ? 'red'
        : (cmjDrop != null && cmjDrop < -10) || (lsi != null && lsi < 80) ? 'red'
        : (cmjDrop != null && cmjDrop < -5) || (lsi != null && lsi < 85) ? 'yellow'
        : 'green';

      const domainSubjective =
        (readiness != null && readiness === 1) || (doms != null && doms >= 5) ? 'red'
        : (readiness != null && readiness <= 2) ? 'red'
        : (readiness === 3) || (mws != null && mws < 60) ? 'yellow'
        : 'green';

      const domains = { autonomic: domainAutonomic, neuromuscular: domainNeuro, subjective: domainSubjective };
      const redCount = Object.values(domains).filter(d => d === 'red').length;
      const yellowCount = Object.values(domains).filter(d => d === 'yellow').length;
      const extremeRed =
        (recovery != null && recovery < 20) ||
        (cmjDrop != null && cmjDrop < -15) ||
        (readiness != null && readiness === 1);

      let status = 'green';
      if (redCount >= 2 || extremeRed) status = 'red';
      else if (redCount === 1 || yellowCount >= 2) status = 'yellow';

      const riskScore = computeRiskScore({ recovery, hrv, cmjDrop, lsi });

      // #8: Data quality — which sources contributed data today
      const dataQuality = {
        whoop: recovery != null || hrv != null,
        survey: mws != null || readiness != null,
        neuro: cmj != null,
        lsi: lsi != null,
      };
      const dataCompleteness = Math.round(Object.values(dataQuality).filter(Boolean).length / 4 * 100);

      return {
        id: p.id,
        name: p.name || '',
        position: p.position || '',
        photo: p.photo || null,
        recovery, hrv, sleep_hours,
        mws, doms, readiness,
        cmj, cmjBaseline, cmjDrop, rsi, lsi, lsiDate,
        status, domains, riskScore, dataQuality, dataCompleteness,
      };
    });

    return res.status(200).json({ players });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
