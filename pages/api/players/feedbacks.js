// pages/api/players/feedbacks.js
// POST { playerIds, date } → returns today's feedback for multiple players in one call.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { feedbackKey } from '../../../lib/workspacePrefix';

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();
  const { playerIds, date, workspace = 'zarechie' } = req.body || {};
  if (!Array.isArray(playerIds) || !date) return res.status(400).json({ error: 'playerIds and date required' });

  const feedbacks = {};
  await Promise.all(playerIds.map(async id => {
    const raw = await redis('get', feedbackKey(workspace, id, date)).catch(() => null);
    if (raw) {
      try {
        feedbacks[id] = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (_) {}
    }
  }));

  return res.status(200).json({ feedbacks });
}
