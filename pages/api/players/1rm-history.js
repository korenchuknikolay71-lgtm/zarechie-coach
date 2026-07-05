// pages/api/players/1rm-history.js
// GET ?playerId=xxx → { history: [{ date, squat, rdl, ... }] }  (last 10 entries)
// Coach-facing: auth via isAuthorized.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { rmHistoryKey } from '../../../lib/workspacePrefix';

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { playerId, workspace = 'zarechie' } = req.query;
  if (!playerId) return res.status(400).json({ error: 'playerId required' });

  const raw = await redis('get', rmHistoryKey(workspace, playerId)).catch(() => null);
  const history = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
  return res.status(200).json({ history: Array.isArray(history) ? history.slice(-10) : [] });
}
