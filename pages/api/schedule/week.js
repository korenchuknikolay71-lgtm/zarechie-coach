// pages/api/schedule/week.js
// GET ?start=YYYY-MM-DD → { players, sessions: {[playerId]: [date,...]}, dates }
// Returns 7 dates starting from `start` and which players have sessions on each day.
import { redis, redisPipeline } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { pfx, rosterKey } from '../../../lib/workspacePrefix';

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).end();

  const { start, workspace = 'zarechie' } = req.query;
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    return res.status(400).json({ error: 'start (YYYY-MM-DD) required' });
  }

  // Build 7-day window
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }

  // Scores stored as YYYYMMDD integers (see programs/save.js)
  const scoreMin = parseInt(dates[0].replace(/-/g, ''));
  const scoreMax = parseInt(dates[6].replace(/-/g, ''));

  // Load roster
  const wp = pfx(workspace);
  const rosterRaw = await redis('get', rosterKey(workspace)).catch(() => null);
  let players = [];
  try {
    const parsed = JSON.parse(rosterRaw);
    if (Array.isArray(parsed)) players = parsed;
  } catch {}

  if (!players.length) return res.status(200).json({ players: [], sessions: {}, dates });

  // Batch: for each player get their session dates in range
  const results = await redisPipeline(
    players.map(p => ['ZRANGEBYSCORE', `${wp}:sessions:${p.id}`, scoreMin, scoreMax])
  ).catch(() => players.map(() => []));

  const sessions = {};
  players.forEach((p, i) => {
    sessions[p.id] = Array.isArray(results[i]) ? results[i] : [];
  });

  return res.status(200).json({
    players: players.map(p => ({ id: p.id, name: p.name, position: p.position || '' })),
    sessions,
    dates,
  });
}
