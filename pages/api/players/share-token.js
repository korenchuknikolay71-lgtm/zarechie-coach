// pages/api/players/share-token.js
// POST { playerId } → { token }
// Creates or retrieves a persistent cryptographically-random share token per player.
// The token is used in the player page URL instead of the internal player ID.
// Token → playerId mapping is stored in Redis and never exposed to the client.

import crypto from 'crypto';
import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { playerId } = req.body || {};
  if (!playerId) return res.status(400).json({ error: 'playerId required' });

  // Return existing token if already generated for this player
  const existing = await redis('get', `coach:player_share:${playerId}`).catch(() => null);
  if (existing && typeof existing === 'string' && existing.length > 8) {
    return res.status(200).json({ token: existing });
  }

  // Generate new 40-char hex token (160 bits — cryptographically unguessable)
  const token = crypto.randomBytes(20).toString('hex');

  await Promise.all([
    redis('set', `coach:share_token:${token}`, String(playerId)),
    redis('set', `coach:player_share:${playerId}`, token),
  ]);

  return res.status(200).json({ token });
}
