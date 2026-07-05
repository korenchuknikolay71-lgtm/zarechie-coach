// pages/api/players/sessions.js
// GET ?playerId&limit=20 — last N saved sessions with tonnage + exercise metadata.

import { redis, redisPipeline } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { sessionKey, sessionsKey } from '../../../lib/workspacePrefix';

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).end();

  const { playerId, limit = '20', workspace = 'zarechie' } = req.query;
  if (!playerId) return res.status(400).json({ error: 'playerId required' });

  const lim = Math.min(parseInt(limit, 10) || 20, 40);
  const dates = await redis('zrange', sessionsKey(workspace, playerId), '-1', `-${lim}`, 'REV').catch(() => []);

  if (!dates || !dates.length) return res.status(200).json({ sessions: [] });

  const records = await redisPipeline(dates.map(d => ['GET', sessionKey(workspace, playerId, d)])).catch(() => []);

  const sessions = [];
  dates.forEach((date, i) => {
    const raw = records[i];
    if (!raw) return;
    try {
      const rec = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const blocks = rec.session?.blocks || [];
      let tonnage = 0;
      const exercises = [];
      for (const block of blocks) {
        for (const ex of block.exercises || []) {
          const kg = parseFloat(ex.weightKg) || 0;
          const sets = ex.targetSets || ex.sets || [];
          let totalReps = 0;
          for (const s of sets) {
            const m = String(s).match(/^(\d+)[x×](\d+)/i);
            if (m) { totalReps += parseInt(m[1]) * parseInt(m[2]); continue; }
            const n = parseInt(s); if (!isNaN(n)) totalReps += n;
          }
          if (kg > 0) tonnage += kg * totalReps;
          if (ex.name) exercises.push({ name: ex.name, kg, blockCode: block.code || '' });
        }
      }
      sessions.push({
        date,
        dayGoal: rec.dayGoal || '',
        tonnage: Math.round(tonnage),
        exerciseCount: exercises.length,
        blockCount: blocks.length,
        exercises,
        assessment: rec.session?.assessment || '',
      });
    } catch (_) {}
  });

  return res.status(200).json({ sessions });
}
