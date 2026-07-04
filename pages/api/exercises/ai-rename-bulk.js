// pages/api/exercises/ai-rename-bulk.js
// POST {} → { renames: [{ canonicalId, oldTitle, newTitle }] }
// Sends all Russian-named library cards to AI → gets professional English S&C names
// → updates title + registers English alias (images/videos preserved via same canonicalId).
import { getAllCards, normalize } from '../../../lib/exerciseLibrary';
import { isAuthorized } from '../../../lib/auth';
import { redis } from '../../../lib/redis';

const OPENAI_MODEL = 'gpt-5.5';

function extractText(data) {
  if (data?.output_text) return data.output_text;
  const chunks = [];
  const stack = Array.isArray(data?.output) ? [...data.output] : [];
  while (stack.length) {
    const item = stack.shift();
    if (!item || typeof item !== 'object') continue;
    if (item.type === 'output_text' && item.text) chunks.push(item.text);
    if (item.type === 'text' && item.text) chunks.push(item.text);
    if (Array.isArray(item.content)) stack.push(...item.content);
    if (Array.isArray(item.output)) stack.push(...item.output);
  }
  return chunks.join('').trim();
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const cards = await getAllCards();
  if (!cards.length) return res.status(200).json({ renames: [], skipped: 0 });

  const toRename = cards.filter(c => /[а-яёА-ЯЁ]/.test(c.title || c.canonicalId));
  if (!toRename.length) return res.status(200).json({ renames: [], skipped: cards.length });

  const list = toRename.map((c, i) => `${i + 1}. ${c.title || c.canonicalId}`).join('\n');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'OPENAI_API_KEY не настроен' });

  const apiResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_output_tokens: 3500,
      store: false,
      input: `You are an elite S&C coach. Translate each Russian exercise name to professional English S&C terminology.
Use standard nomenclature: modifier + equipment + movement + qualifier.
Examples: "Bulgarian Split Squat", "Trap Bar Romanian Deadlift", "Single-Leg Hip Thrust (DB)",
"Copenhagen Adductor Plank", "Pallof Press (Band)", "SL Eccentric Step-Down",
"Dead Bug", "Bird-Dog", "Slider Hamstring Curl", "KB Swing (Two-Hand)",
"Goblet Squat (KB)", "Box Jump (Bilateral)", "Countermovement Jump (CMJ)",
"Plyo Push-Up", "Inverted Row (TRX)", "Landmine Press", "DB Incline Press",
"MB Rotational Throw", "Y-T-W (Band)", "Band Pull-Apart", "Face Pull (Band)",
"RKC Plank", "Hollow Body Hold", "Suitcase Carry (DB)".
Return ONLY a JSON array, no explanation.

Russian names:
${list}

Return: [{"i":1,"name":"English Name"},{"i":2,"name":"English Name"},...]`,
    }),
  });

  if (!apiResponse.ok) {
    const err = await apiResponse.text().catch(() => '');
    return res.status(500).json({ error: 'OpenAI API error', raw: err.slice(0, 200) });
  }

  const aiData = await apiResponse.json();
  const text = extractText(aiData);
  const renames = [];

  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return res.status(500).json({ error: 'AI parse error', raw: text.slice(0, 300) });

    const parsed = JSON.parse(match[0]);
    for (const item of parsed) {
      const card = toRename[item.i - 1];
      if (!card || !item.name?.trim()) continue;

      const clean = item.name.trim();
      const { normName } = normalize(clean);
      const ts = String(Date.now());

      await redis('hset', `ex:lib:${card.canonicalId}`, 'title', clean, 'updatedAt', ts);
      await redis('hset', 'ex:alias', normName, card.canonicalId);

      renames.push({ canonicalId: card.canonicalId, oldTitle: card.title || card.canonicalId, newTitle: clean });
    }
  } catch (e) {
    return res.status(500).json({ error: 'AI parse error', raw: text.slice(0, 300) });
  }

  return res.status(200).json({ renames, skipped: cards.length - toRename.length });
}
