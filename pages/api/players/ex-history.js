// pages/api/players/ex-history.js
// POST { playerId, names: string[] }
// Returns { histories: { name: [{date, kg}] } } sorted oldest→newest.
// History stored as HASH coach:exhist:{playerId}:{normName} field=date value=kg.

import { redisPipeline } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { normExName } from './progression';
import { exhistKey } from '../../../lib/workspacePrefix';

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();

  const { playerId, names, workspace = 'zarechie' } = req.body || {};
  if (!playerId || !Array.isArray(names) || !names.length)
    return res.status(400).json({ error: 'playerId and names[] required' });

  const unique = [...new Set(names.filter(Boolean))];
  const results = await redisPipeline(
    unique.map(n => ['HGETALL', exhistKey(workspace, playerId, normExName(n))])
  ).catch(() => []);

  const histories = {};
  unique.forEach((name, i) => {
    const raw = results[i];
    if (!raw) return;

    let record = {};
    if (Array.isArray(raw)) {
      for (let j = 0; j < raw.length - 1; j += 2) record[raw[j]] = raw[j + 1];
    } else if (raw && typeof raw === 'object') {
      record = raw;
    }

    const entries = Object.entries(record)
      .map(([date, kg]) => ({ date, kg: parseFloat(kg) }))
      .filter(e => e.kg > 0 && e.date)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (entries.length > 0) histories[name] = entries;
  });

  return res.status(200).json({ histories });
}
