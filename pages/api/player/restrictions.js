// pages/api/player/restrictions.js
// GET  ?playerId=xxx                    → { restrictions: [] }
// POST { playerId, restrictions: [] }   → { ok }
// Coach-facing: auth via isAuthorized.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { RESTRICTIONS } from '../../../lib/exerciseRestrictions';
import { restrictionsKey } from '../../../lib/workspacePrefix';

const VALID = new Set(RESTRICTIONS.map(r => r.id));

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const { playerId, workspace = 'zarechie' } = req.query;
    if (!playerId) return res.status(400).json({ error: 'playerId required' });
    const raw = await redis('get', restrictionsKey(workspace, playerId)).catch(() => null);
    const restrictions = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
    return res.status(200).json({ restrictions: Array.isArray(restrictions) ? restrictions : [] });
  }

  if (req.method === 'POST') {
    const { playerId, restrictions, workspace = 'zarechie' } = req.body || {};
    if (!playerId) return res.status(400).json({ error: 'playerId required' });
    const clean = Array.isArray(restrictions) ? restrictions.filter(r => VALID.has(r)) : [];
    await redis('set', restrictionsKey(workspace, playerId), JSON.stringify(clean));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
