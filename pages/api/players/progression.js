// pages/api/players/progression.js
// POST { playerId, names: string[] }
// Returns per-exercise previous weight + RPE + suggested next weight.
// Data is written by save.js (on session save) and feedback.js (on player RPE submit).

import { redis, redisPipeline } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { exweightKey } from '../../../lib/workspacePrefix';

// Stable short key derived from exercise name.
export function normExName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')       // drop parentheticals: (DB), (Band)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// Suggest next weight based on previous weight + RPE.
export function suggestKg(kg, rpe) {
  const k = parseFloat(kg);
  if (!k || k <= 0) return null;
  const r = parseInt(rpe, 10);
  if (!r || isNaN(r)) return k; // no RPE data → keep same
  if (r <= 7) return Math.round((k + 2.5) / 2.5) * 2.5;  // easy → +2.5
  if (r === 8) return k;                                    // on target → same
  if (r === 9) return Math.max(Math.round((k - 2.5) / 2.5) * 2.5, 2.5); // hard → -2.5
  return Math.max(Math.round((k - 5) / 2.5) * 2.5, 2.5);  // RPE 10 → -5
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();

  const { playerId, names, workspace = 'zarechie' } = req.body || {};
  if (!playerId || !Array.isArray(names) || !names.length) {
    return res.status(400).json({ error: 'playerId and names[] required' });
  }

  // Deduplicate names to avoid redundant Redis calls.
  const unique = [...new Set(names.filter(Boolean))];
  const keys = unique.map(n => normExName(n));

  // Batch-fetch all exercise weight records.
  const results = await redisPipeline(
    keys.map(k => ['HGETALL', exweightKey(workspace, playerId, k)])
  ).catch(() => []);

  const progression = {};
  unique.forEach((name, i) => {
    const raw = results[i];
    if (!raw) return;

    // Upstash returns HGETALL as flat array or object.
    let record = {};
    if (Array.isArray(raw)) {
      for (let j = 0; j < raw.length - 1; j += 2) record[raw[j]] = raw[j + 1];
    } else if (typeof raw === 'object') {
      record = raw;
    }

    const kg = record.kg ? parseFloat(record.kg) : null;
    const rpe = record.rpe ? parseInt(record.rpe, 10) : null;
    if (!kg) return;

    progression[name] = {
      kg,
      rpe: rpe || null,
      date: record.date || null,
      suggestedKg: suggestKg(kg, rpe),
    };
  });

  return res.status(200).json({ progression });
}
