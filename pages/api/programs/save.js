// pages/api/programs/save.js
// POST { playerId, date, session, player, dataSummary, dayGoal } → persists a session.
// Also maintains a sorted set coach:sessions:{playerId} (score = YYYYMMDD integer) so
// getRecentSessionSummaries() can fetch the N most recent dates in one ZRANGE call.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { playerId, date, session, player, dataSummary, dayGoal } = req.body || {};
  if (!playerId || !date || !session) {
    return res.status(400).json({ error: 'playerId, date and session are required' });
  }

  const record = {
    session,
    player: player || null,
    dataSummary: dataSummary || '',
    dayGoal: dayGoal || '',
    date,
    savedAt: new Date().toISOString(),
  };

  // Score is the date as a plain integer (20260618) — sorts chronologically.
  const dateScore = parseInt(date.replace(/-/g, ''), 10);

  try {
    await Promise.all([
      redis('set', `coach:session:${playerId}:${date}`, JSON.stringify(record)),
      redis('zadd', `coach:sessions:${playerId}`, dateScore, date),
    ]);
    return res.status(200).json({ status: 'ok' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
