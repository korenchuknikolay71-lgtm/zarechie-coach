// pages/api/exercises/set-category.js
// POST { id, category } — set gym/warmup category for a library card.
// category: 'gym' | 'warmup' | '' (empty = uncategorized)

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();

  const { id, category } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id required' });
  const cat = String(category ?? '');
  if (!['gym', 'warmup', ''].includes(cat)) return res.status(400).json({ error: 'category must be gym|warmup|""' });

  await redis('hset', `ex:lib:${id}`, 'category', cat, 'updatedAt', String(Date.now()));
  return res.status(200).json({ ok: true });
}
