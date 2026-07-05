// pages/api/players/trends.js
// GET ?playerId=X&days=28
// → { cmjHistory, acwrHistory, gymAcwrHistory, tsbHistory }
//
// CMJ: read neuro:history:{playerId} (JSON array), return the last 10 measurements.
// ACWR: read survey:{playerId}:{date} over a 28+28-day window, build a daily sRPE-load
// (srpe × duration, default 60 min) and compute an EWMA-based acute:chronic workload ratio.
// Gym-ACWR: same EWMA math over session tonnage (coach:gym_tonnage:*).
// TSB: Fitness (CTL, 42d EWMA) − Fatigue (ATL, 7d EWMA) = Form, on sRPE load.

import { redis, redisPipeline } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { getPlayerSnapshot } from '../../../lib/playerData';
import { gymTonnageDatesKey, gymTonnageKey } from '../../../lib/workspacePrefix';

function isoDaysBefore(date, n) {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// EWMA-based ACWR over a daily load map. Walks every calendar day from the first
// loaded day to targetDate so gaps decay the averages correctly.
function calcEWMAAcwr(loadMap, firstDate, targetDate, { lambdaAcute = 2 / 8, lambdaChronic = 2 / 29 } = {}) {
  const result = [];
  if (!firstDate) return result;
  let ewmaAcute = 0, ewmaChronic = 0;
  let cur = firstDate;
  while (cur <= targetDate) {
    const load = loadMap[cur] || 0;
    ewmaAcute = lambdaAcute * load + (1 - lambdaAcute) * ewmaAcute;
    ewmaChronic = lambdaChronic * load + (1 - lambdaChronic) * ewmaChronic;
    const acwr = ewmaChronic > 0 ? Math.round((ewmaAcute / ewmaChronic) * 100) / 100 : null;
    result.push({ date: cur, acwr, ewmaAcute: Math.round(ewmaAcute), load: loadMap[cur] != null ? Math.round(loadMap[cur]) : null });
    cur = isoDaysBefore(cur, -1);
  }
  return result;
}

// CTL/ATL/TSB (Banister fitness-fatigue-form) over a daily load map.
function calcTSB(loadMap, firstDate, targetDate) {
  const lambda42 = 2 / 43; // CTL (Fitness)
  const lambda7 = 2 / 8;   // ATL (Fatigue)
  const result = [];
  if (!firstDate) return result;
  let ctl = 0, atl = 0;
  let cur = firstDate;
  while (cur <= targetDate) {
    const load = loadMap[cur] || 0;
    ctl = lambda42 * load + (1 - lambda42) * ctl;
    atl = lambda7 * load + (1 - lambda7) * atl;
    result.push({ date: cur, ctl: Math.round(ctl), atl: Math.round(atl), tsb: Math.round(ctl - atl) });
    cur = isoDaysBefore(cur, -1);
  }
  return result;
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const playerId = String(req.query.playerId || '');
  const days = Math.min(parseInt(req.query.days, 10) || 28, 60);
  const workspace = String(req.query.workspace || 'zarechie');
  if (!playerId) return res.status(400).json({ error: 'playerId required' });

  const targetDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());

  try {
    const totalWindow = days + 42;
    const snapshot = await getPlayerSnapshot(playerId, totalWindow, targetDate, totalWindow, workspace).catch(() => null);

    // ── CMJ history ──────────────────────────────────────────────────────────
    const neuroHistory = Array.isArray(snapshot?.neuro?.history) ? snapshot.neuro.history : [];
    const cmjHistory = neuroHistory
      .filter(e => e && e.date && (e.cmj != null || e.rsi != null))
      .map(e => ({ date: e.date, cmj: e.cmj != null ? Number(e.cmj) : null, rsi: e.rsi != null ? Number(e.rsi) : null }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-10);

    // ── sRPE load map (for ACWR + TSB) ─────────────────────────────────────────
    // TSB needs a long chronic horizon (42-day CTL) so pull an extra buffer.
    const loadMap = {};
    const manualObj = snapshot?.manual || {};
    for (const obj of (snapshot?.chronicSurveys || snapshot?.surveys || [])) {
      if (!obj?.date || obj.srpe == null) continue;
      const dur = obj.duration ?? manualObj?.[obj.date]?.duration ?? 60;
      loadMap[obj.date] = obj.srpe * dur;
    }

    const firstLoadDate = Object.keys(loadMap).sort()[0] || null;
    const cutoffDay = isoDaysBefore(targetDate, days - 1);

    // EWMA ACWR, keep only the last `days`.
    const acwrHistory = calcEWMAAcwr(loadMap, firstLoadDate, targetDate)
      .filter(r => r.date >= cutoffDay)
      .map(r => ({ date: r.date, acwr: r.acwr, srpe: r.load }));

    // TSB — last 42 days.
    const tsbCutoff = isoDaysBefore(targetDate, 41);
    const tsbHistory = calcTSB(loadMap, firstLoadDate, targetDate)
      .filter(r => r.date >= tsbCutoff);

    // ── Gym-ACWR (session tonnage) ─────────────────────────────────────────────
    let gymAcwrHistory = [];
    let tonnageMap = {};
    const gtCutoffScore = parseInt(isoDaysBefore(targetDate, totalWindow - 1).replace(/-/g, ''), 10);
    const gtTargetScore = parseInt(targetDate.replace(/-/g, ''), 10);
    const gtDates = (await redis('zrangebyscore', gymTonnageDatesKey(workspace, playerId), String(gtCutoffScore), String(gtTargetScore)).catch(() => [])) || [];
    if (Array.isArray(gtDates) && gtDates.length) {
      const gtRaws = await redisPipeline(gtDates.map(d => ['get', gymTonnageKey(workspace, playerId, d)])).catch(() => []);
      gtDates.forEach((d, i) => { const v = parseFloat(gtRaws[i]); if (v > 0) tonnageMap[d] = v; });
      const firstGtDate = Object.keys(tonnageMap).sort()[0] || null;
      gymAcwrHistory = calcEWMAAcwr(tonnageMap, firstGtDate, targetDate)
        .filter(r => r.date >= cutoffDay)
        .map(r => ({ date: r.date, acwr: r.acwr, tonnage: r.load }));
    }

    // ── Combined ACWR (volleyball sRPE + gym tonnage) ──────────────────────────
    // Fold gym tonnage into the sRPE load as arbitrary units (1000kg ≈ 80 AU).
    const combinedLoadMap = { ...loadMap };
    for (const [d, tonnage] of Object.entries(tonnageMap)) {
      combinedLoadMap[d] = (combinedLoadMap[d] || 0) + tonnage * 0.08;
    }
    const firstCombinedDate = Object.keys(combinedLoadMap).sort()[0] || null;
    const combinedAcwrHistory = calcEWMAAcwr(combinedLoadMap, firstCombinedDate, targetDate)
      .filter(r => r.date >= cutoffDay)
      .map(r => ({ date: r.date, acwr: r.acwr, load: r.load }));

    return res.status(200).json({ cmjHistory, acwrHistory, gymAcwrHistory, combinedAcwrHistory, tsbHistory });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
