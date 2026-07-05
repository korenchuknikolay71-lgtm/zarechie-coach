// pages/api/programs/team-status.js
// POST { playerIds, date } → gym session status for each player on that date.
// Returns: hasSession, savedAt, feedback (RPE/feel from player self-report).
// Auth: trainer API key. Does NOT duplicate HRV/recovery — that's in the main dashboard.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { feedbackKey, sessionKey } from '../../../lib/workspacePrefix';

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();

  const { playerIds, date, workspace = 'zarechie' } = req.body || {};
  if (!Array.isArray(playerIds) || !date) return res.status(400).json({ error: 'playerIds and date required' });

  const status = {};

  await Promise.all(playerIds.map(async id => {
    const sid = String(id);
    const [rawSession, rawFeedback] = await Promise.all([
      redis('get', sessionKey(workspace, sid, date)).catch(() => null),
      redis('get', feedbackKey(workspace, sid, date)).catch(() => null),
    ]);

    let hasSession = false;
    let savedAt = null;
    if (rawSession) {
      try {
        const rec = typeof rawSession === 'string' ? JSON.parse(rawSession) : rawSession;
        hasSession = true;
        savedAt = rec.savedAt || null;
      } catch (_) {}
    }

    let feedback = null;
    if (rawFeedback) {
      try {
        feedback = typeof rawFeedback === 'string' ? JSON.parse(rawFeedback) : rawFeedback;
      } catch (_) {}
    }

    status[id] = { hasSession, savedAt, feedback };
  }));

  return res.status(200).json({ status });
}
