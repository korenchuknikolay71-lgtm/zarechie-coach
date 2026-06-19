// pages/api/schedule/index.js
// GET  → returns current team schedule events (game/travel dates)
// POST { events: [{date, type}] } → replaces full schedule
import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';

const KEY = 'schedule:team';

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    try {
      const raw = await redis('get', KEY);
      const events = raw ? JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw)) : [];
      return res.status(200).json({ events });
    } catch (_) {
      return res.status(200).json({ events: [] });
    }
  }

  if (req.method === 'POST') {
    const { events } = req.body || {};
    if (!Array.isArray(events)) return res.status(400).json({ error: 'events array required' });
    await redis('set', KEY, JSON.stringify(events));
    return res.status(200).json({ status: 'ok', events });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
