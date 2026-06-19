// pages/api/players/volume.js
// GET ?playerId=X&days=7 → set counts per block label for the last N days of saved sessions

import { redis, redisPipeline } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { playerId, days = '7' } = req.query;
  if (!playerId) return res.status(400).json({ error: 'playerId required' });

  const daysNum = Math.min(parseInt(days, 10) || 7, 30);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysNum);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  try {
    const dates = await redis('zrange', `coach:sessions:${playerId}`, -20, -1).catch(() => []);
    if (!dates?.length) return res.status(200).json({ sessions: 0, byBlock: {}, totalSets: 0 });

    const recentDates = dates.filter(d => d >= cutoffStr);
    if (!recentDates.length) return res.status(200).json({ sessions: 0, byBlock: {}, totalSets: 0 });

    const results = await redisPipeline(
      recentDates.map(d => ['get', `coach:session:${playerId}:${d}`])
    ).catch(() => []);

    const byBlock = {};
    let totalSets = 0;
    let sessionCount = 0;

    for (const r of results) {
      const raw = r?.result;
      if (!raw) continue;
      try {
        const record = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!record.session?.blocks) continue;
        sessionCount++;
        for (const block of record.session.blocks) {
          const label = block.label || '?';
          for (const ex of block.exercises || []) {
            const sets = ex.targetSets?.length || 0;
            byBlock[label] = (byBlock[label] || 0) + sets;
            totalSets += sets;
          }
        }
      } catch (_) {}
    }

    return res.status(200).json({ sessions: sessionCount, byBlock, totalSets });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
