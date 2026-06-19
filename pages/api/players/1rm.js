// pages/api/players/1rm.js
// GET ?playerId=X → fetch stored 1RM values
// POST { playerId, values } → save 1RM values

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';

const ALLOWED_FIELDS = ['squat', 'rdl', 'deadlift', 'bench', 'ohp', 'pullup'];

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const { playerId } = req.query;
    if (!playerId) return res.status(400).json({ error: 'playerId required' });
    const raw = await redis('get', `coach:1rm:${playerId}`).catch(() => null);
    const values = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
    return res.status(200).json({ values });
  }

  if (req.method === 'POST') {
    const { playerId, values } = req.body || {};
    if (!playerId) return res.status(400).json({ error: 'playerId required' });
    if (!values || typeof values !== 'object') return res.status(400).json({ error: 'values required' });
    const clean = {};
    for (const field of ALLOWED_FIELDS) {
      const v = parseFloat(values[field]);
      if (!Number.isNaN(v) && v > 0) clean[field] = v;
    }
    await redis('set', `coach:1rm:${playerId}`, JSON.stringify(clean));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
