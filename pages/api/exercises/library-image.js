// pages/api/exercises/library-image.js
// Works directly with canonicalId — no name resolution, no fuzzy matching.
//
// GET    ?id=canonicalId              → stream image bytes
// POST   { id, imageData (base64) }  → save/replace image on card
// DELETE ?id=canonicalId             → remove image field from card

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';

export const config = { api: { bodyParser: { sizeLimit: '4mb' } }, maxDuration: 15 };

function streamDataUrl(res, dataUrl) {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!m) return false;
  const buf = Buffer.from(m[2], 'base64');
  res.setHeader('Content-Type', m[1]);
  res.setHeader('Cache-Control', 'private, no-cache');
  res.send(buf);
  return true;
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  const id = (req.query.id || req.body?.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id required' });

  // ── SERVE ─────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const image = await redis('hget', `ex:lib:${id}`, 'image').catch(() => null);
    if (image && streamDataUrl(res, image)) return;
    return res.status(404).end();
  }

  // ── DELETE IMAGE ──────────────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    await redis('hdel', `ex:lib:${id}`, 'image').catch(() => {});
    return res.status(200).json({ ok: true });
  }

  // ── UPLOAD / REPLACE ──────────────────────────────────────────────────────
  if (req.method !== 'POST') return res.status(405).end();

  const { imageData } = req.body || {};
  if (!imageData) return res.status(400).json({ error: 'imageData required' });

  try {
    const ts = String(Date.now());
    const existing = await redis('hgetall', `ex:lib:${id}`).catch(() => null);
    const createdAt = (existing?.createdAt) || ts;
    await redis('hset', `ex:lib:${id}`, 'image', imageData, 'updatedAt', ts, 'createdAt', createdAt);
    await redis('sadd', 'ex:index', id).catch(() => {});
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
