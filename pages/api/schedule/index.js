// pages/api/schedule/index.js
// GET  → returns current team schedule events (game/travel dates)
// POST { events: [{date, type}] } → replaces full schedule
import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { scheduleKey } from '../../../lib/workspacePrefix';

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const { workspace = 'zarechie' } = req.query || {};
    try {
      const raw = await redis('get', scheduleKey(workspace));
      const events = raw ? JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw)) : [];
      return res.status(200).json({ events });
    } catch (_) {
      return res.status(200).json({ events: [] });
    }
  }

  if (req.method === 'POST') {
    const { events, workspace = 'zarechie' } = req.body || {};
    if (!Array.isArray(events)) return res.status(400).json({ error: 'events array required' });
    await redis('set', scheduleKey(workspace), JSON.stringify(events));
    return res.status(200).json({ status: 'ok', events });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
