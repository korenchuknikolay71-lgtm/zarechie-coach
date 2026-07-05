// lib/teamPlaybook.js
// The Team Playbook aggregates historical session outcomes to find what combinations
// of (focus, position, load) led to the best next-day recovery and CMJ. This is
// "evidence-based on your own team's data" — computed from saved sessions + WHOOP + neuro.

import { redis, redisPipeline } from './redis';
import { pfx, playbookKey } from './workspacePrefix';

function parseJSON(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

// Position label → friendly Russian display (best-effort; falls back to raw value).
function shiftDate(dateStr, n) {
  // Noon-UTC anchor keeps the shift DST/timezone-safe regardless of server locale.
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Detect the periodization focus code from a saved session's free-text fields.
function detectFocus(session) {
  const text = (session.assessment || '') + ' ' + (session.periodization_note || '');
  if (/СИЛОВАЯ|inseason_strength/i.test(text)) return 'inseason_strength';
  if (/МОЩНОСТН|inseason_power/i.test(text)) return 'inseason_power';
  if (/ПРОФИЛАК|восстановл|inseason_prophyl/i.test(text)) return 'inseason_prophylaxis';
  if (/ДЕLOAD|deload/i.test(text)) return 'inseason_deload';
  if (/НАКОПЛ|inseason_accum/i.test(text)) return 'inseason_accumulation';
  if (/КОНВЕРС|inseason_conv/i.test(text)) return 'inseason_conversion';
  if (/АКТИВАЦ|md1_activ/i.test(text)) return 'inseason_md1_activation';
  if (/ТЕЙПЕР|taper/i.test(text)) return 'inseason_taper';
  return null;
}

// Sum(weightKg × sets × reps) across all exercises in a session.
// sets = targetSets.length, reps = parseInt(targetSets[0]).
function computeTonnage(session) {
  let total = 0;
  for (const block of session.blocks || []) {
    for (const ex of block.exercises || []) {
      const weight = Number(ex.weightKg);
      if (!weight || Number.isNaN(weight)) continue;
      const sets = Array.isArray(ex.targetSets) ? ex.targetSets.length : 0;
      if (!sets) continue;
      const reps = parseInt(ex.targetSets[0], 10);
      if (!reps || Number.isNaN(reps)) continue;
      total += weight * sets * reps;
    }
  }
  return total;
}

function avg(arr) {
  const vals = arr.filter(v => v != null && !Number.isNaN(v));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * buildTeamPlaybook(roster)
 * roster: [{ id, name, position }]
 * Reads last 60 sessions per player, cross-references each with next-day WHOOP recovery
 * and next-day CMJ, then groups by (position, focus).
 * Returns { patterns: [{ position, focus, avgRecovery, avgCmj, n, insight }], generatedAt }
 */
export async function buildTeamPlaybook(roster, workspace = 'zarechie') {
  const players = (Array.isArray(roster) ? roster : []).filter(p => p && p.id != null);
  if (!players.length) return { patterns: [], generatedAt: new Date().toISOString() };
  const wp = pfx(workspace);

  // Step 1 — batch all ZREVRANGE calls to grab the last 60 session dates per player.
  const zResults = await redisPipeline(
    players.map(p => ['ZREVRANGE', `${wp}:sessions:${p.id}`, 0, 59])
  );

  // Step 2 — batch all session reads + neuro-history reads.
  // sessionCmds: one GET per (player, date). neuroCmds: one GET per player.
  const sessionCmds = [];
  const sessionIndex = []; // parallel to sessionCmds: { playerIdx, date }
  players.forEach((p, pi) => {
    const dates = Array.isArray(zResults[pi]) ? zResults[pi] : [];
    for (const d of dates) {
      sessionCmds.push(['get', `${wp}:session:${p.id}:${d}`]);
      sessionIndex.push({ playerIdx: pi, date: d });
    }
  });

  const neuroCmds = workspace === 'zarechie'
    ? players.map(p => ['get', `neuro:history:${p.id}`])
    : [];

  const [sessionResults, neuroResults] = await Promise.all([
    sessionCmds.length ? redisPipeline(sessionCmds) : Promise.resolve([]),
    neuroCmds.length ? redisPipeline(neuroCmds) : Promise.resolve([]),
  ]);

  // Parse each player's neuro history once (array of { date, cmj, rsi } newest first).
  const neuroByPlayer = players.map((_, pi) => {
    const arr = parseJSON(neuroResults[pi]);
    return Array.isArray(arr) ? arr : [];
  });

  // Step 3 — parse sessions, collect the next-day WHOOP reads we still need.
  // records: { playerIdx, position, focus, tonnage, nextDate }
  const records = [];
  const nextDayWhoopCmds = [];
  const nextDayWhoopIndex = []; // parallel: record array index

  for (let i = 0; i < sessionCmds.length; i++) {
    const raw = sessionResults[i];
    const parsed = parseJSON(raw);
    if (!parsed) continue;
    const session = parsed.session || parsed;
    if (!session || !Array.isArray(session.blocks)) continue;

    const { playerIdx, date } = sessionIndex[i];
    const focus = detectFocus(session);
    if (!focus) continue; // only classify sessions we can attribute to a focus

    const position = players[playerIdx].position || 'не указана';
    const tonnage = computeTonnage(session);
    const nextDate = shiftDate(date, 1);

    const recIdx = records.length;
    records.push({ playerIdx, position, focus, tonnage, nextDate, nextDayRecovery: null, nextDayCmj: null });

    if (workspace === 'zarechie') {
      nextDayWhoopCmds.push(['get', `whoop:history:${players[playerIdx].id}:${nextDate}`]);
      nextDayWhoopIndex.push(recIdx);
    }
  }

  // Step 4 — batch all next-day WHOOP reads.
  const whoopResults = nextDayWhoopCmds.length ? await redisPipeline(nextDayWhoopCmds) : [];

  for (let i = 0; i < whoopResults.length; i++) {
    const whoop = parseJSON(whoopResults[i]);
    const rec = records[nextDayWhoopIndex[i]];
    if (whoop && whoop.recovery != null) {
      const r = Number(whoop.recovery);
      if (!Number.isNaN(r)) rec.nextDayRecovery = r;
    }
  }

  // Step 5 — resolve next-day CMJ from each player's already-fetched neuro history.
  for (const rec of records) {
    const hist = neuroByPlayer[rec.playerIdx];
    const entry = hist.find(e => e && e.date === rec.nextDate);
    if (entry && entry.cmj != null) {
      const c = Number(entry.cmj);
      if (!Number.isNaN(c)) rec.nextDayCmj = c;
    }
  }

  // Step 6 — group by (position, focus), average recovery and CMJ. Keep n >= 3.
  const groups = {};
  for (const rec of records) {
    // A record contributes only if it has at least one usable next-day outcome.
    if (rec.nextDayRecovery == null && rec.nextDayCmj == null) continue;
    const key = `${rec.position}|||${rec.focus}`;
    if (!groups[key]) groups[key] = { position: rec.position, focus: rec.focus, recoveries: [], cmjs: [], count: 0 };
    groups[key].count += 1;
    if (rec.nextDayRecovery != null) groups[key].recoveries.push(rec.nextDayRecovery);
    if (rec.nextDayCmj != null) groups[key].cmjs.push(rec.nextDayCmj);
  }

  const patterns = [];
  for (const g of Object.values(groups)) {
    if (g.count < 3) continue;
    const avgRecovery = avg(g.recoveries);
    const avgCmj = avg(g.cmjs);
    patterns.push({
      position: g.position,
      focus: g.focus,
      avgRecovery: avgRecovery != null ? Math.round(avgRecovery) : null,
      avgCmj: avgCmj != null ? Math.round(avgCmj * 10) / 10 : null,
      n: g.count,
      insight: buildInsight(g.focus, avgRecovery, avgCmj, g.count),
    });
  }

  // Mark the best-recovery pattern per position.
  const byPosition = {};
  for (const p of patterns) {
    if (p.avgRecovery == null) continue;
    if (!byPosition[p.position] || p.avgRecovery > byPosition[p.position].avgRecovery) {
      byPosition[p.position] = p;
    }
  }
  for (const p of patterns) {
    if (byPosition[p.position] === p) p.best = true;
  }

  return { patterns, generatedAt: new Date().toISOString() };
}

function buildInsight(focus, avgRecovery, avgCmj, n) {
  const parts = [];
  if (avgRecovery != null) parts.push(`Recovery+1 ≈ ${Math.round(avgRecovery)}%`);
  if (avgCmj != null) parts.push(`CMJ+1 ≈ ${Math.round(avgCmj * 10) / 10} см`);
  return `${focus}: ${parts.join(', ')} (n=${n})`;
}

/**
 * getTeamPlaybook()
 * Reads cached workspace playbook. Returns null if not cached.
 */
export async function getTeamPlaybook(workspace = 'zarechie') {
  const raw = await redis('get', playbookKey(workspace)).catch(() => null);
  return parseJSON(raw);
}

/**
 * refreshTeamPlaybook(roster)
 * Rebuilds the playbook and caches it with a 7-day TTL.
 * Returns the freshly built playbook.
 */
export async function refreshTeamPlaybook(roster, workspace = 'zarechie') {
  const playbook = await buildTeamPlaybook(roster, workspace);
  await redis('set', playbookKey(workspace), JSON.stringify(playbook), 'EX', 604800).catch(() => null);
  return playbook;
}

/**
 * formatPlaybookForPrompt(playbook, playerPosition, currentFocus)
 * Filters patterns to the same position, sorts by avgRecovery desc, takes top 3,
 * and returns a compact injectable string. Returns '' if nothing relevant.
 */
export function formatPlaybookForPrompt(playbook, playerPosition, currentFocus) {
  if (!playbook || !Array.isArray(playbook.patterns) || !playbook.patterns.length) return '';

  const pos = (playerPosition || '').trim();
  let relevant = playbook.patterns.filter(p => p.position === pos);
  if (!relevant.length) return '';

  relevant = relevant
    .slice()
    .sort((a, b) => (b.avgRecovery ?? -1) - (a.avgRecovery ?? -1))
    .slice(0, 3);

  const lines = [`📊 Данные команды (позиция: ${pos || 'не указана'}, фокус: ${currentFocus || '—'}):`];
  relevant.forEach((p, i) => {
    const rec = p.avgRecovery != null ? `${p.avgRecovery}%` : 'нет данных';
    const cmj = p.avgCmj != null ? `${p.avgCmj} см` : 'нет данных';
    const best = i === 0 ? ' — лучший паттерн' : '';
    lines.push(` • ${p.focus}: сред. Recovery+1 = ${rec}, CMJ+1 = ${cmj} (n=${p.n})${best}`);
  });

  return lines.join('\n');
}
