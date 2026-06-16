// pages/api/players/list.js
// Returns every known player (WHOOP-tracked + roster-only) for the program-generator UI.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const [whoopIds, rosterIds] = await Promise.all([
    redis('smembers', 'whoop:players'),
    redis('smembers', 'roster:players'),
  ]);

  const ids = Array.from(new Set([...(whoopIds || []), ...(rosterIds || [])]));
  if (!ids.length) return res.status(200).json({ players: [] });

  const players = (await Promise.all(
    ids.map(async id => {
      const [whoopRaw, rosterRaw] = await Promise.all([
        redis('get', `whoop:player:${id}`),
        redis('get', `roster:player:${id}`),
      ]);
      const raw = whoopRaw || rosterRaw;
      if (!raw) return null;
      const p = JSON.parse(raw);
      return {
        id,
        name: p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
        position: p.position || '',
      };
    })
  )).filter(Boolean);

  // Roster stores each player under multiple id aliases (e.g. numeric WHOOP id
  // and a "whoop_"-prefixed copy) — dedupe by name, preferring the numeric id
  // since that's what whoop:history/survey keys are keyed by.
  const byName = new Map();
  for (const p of players) {
    const existing = byName.get(p.name);
    if (!existing || (existing.id.startsWith('whoop_') && !p.id.startsWith('whoop_'))) {
      byName.set(p.name, p);
    }
  }

  const deduped = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  res.status(200).json({ players: deduped });
}
