// pages/api/players/team-tonnage.js
// GET ?days=7 → tonnage per player per day for the last N days.
// Tonnage = sets × reps × weightKg (loaded exercises only).
// Returns { dates, players: [{ id, name, position, byDay: { date: kg } }] }

import { redis, redisPipeline } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { rosterKey, sessionKey } from '../../../lib/workspacePrefix';

// Parse a single set string → total reps for that set entry.
// Handles "3x8" → 24, "8" → 8, "4x5" → 20.
function parseReps(s) {
  const multi = String(s).match(/^(\d+)[x×](\d+)$/i);
  if (multi) return parseInt(multi[1]) * parseInt(multi[2]);
  const simple = String(s).match(/^(\d+)$/);
  if (simple) return parseInt(simple[1]);
  return 0;
}

function calcExTonnage(ex) {
  const kg = parseFloat(ex.weightKg);
  if (!kg || kg <= 0) return 0;
  const reps = (ex.targetSets || []).reduce((sum, s) => sum + parseReps(s), 0);
  return reps * kg;
}

function windowDates(days) {
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).end();

  const days = Math.min(parseInt(req.query.days || '7', 10), 14);
  const workspace = String(req.query.workspace || 'zarechie');
  const dates = windowDates(days);

  // Load all players from roster.
  const rosterRaw = await redis('get', rosterKey(workspace)).catch(() => null);
  let players = [];
  if (rosterRaw) {
    try {
      const all = typeof rosterRaw === 'string' ? JSON.parse(rosterRaw) : rosterRaw;
      players = Array.isArray(all) ? all : [];
    } catch (_) {}
  }
  if (!players.length) return res.status(200).json({ dates, players: [] });

  // Batch-fetch all sessions: players × dates.
  const keys = players.flatMap(p => dates.map(d => sessionKey(workspace, p.id, d)));
  const results = await redisPipeline(keys.map(k => ['GET', k])).catch(() => []);

  const playerRows = players.map((p, pi) => {
    const byDay = {};
    dates.forEach((d, di) => {
      const raw = results[pi * dates.length + di];
      if (!raw) { byDay[d] = 0; return; }
      try {
        const rec = typeof raw === 'string' ? JSON.parse(raw) : raw;
        let tonnage = 0;
        for (const block of rec.session?.blocks || []) {
          for (const ex of block.exercises || []) {
            tonnage += calcExTonnage(ex);
          }
        }
        byDay[d] = Math.round(tonnage);
      } catch (_) { byDay[d] = 0; }
    });
    return {
      id: p.id,
      name: p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
      position: p.position || '',
      byDay,
    };
  });

  return res.status(200).json({ dates, players: playerRows });
}
