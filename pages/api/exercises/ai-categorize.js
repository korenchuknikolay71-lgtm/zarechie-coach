// pages/api/exercises/ai-categorize.js
// POST {} — classify all library exercises as gym/warmup using AI.
// Only processes uncategorized cards (category === '' or missing).
// Returns { categorized: [{id, title, category}], skipped }

import { getAllCards } from '../../../lib/exerciseLibrary';
import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';

export const config = { maxDuration: 60 };

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
  if (req.method !== 'POST') return res.status(405).end();

  const cards = await getAllCards();
  if (!cards.length) return res.status(200).json({ categorized: [], skipped: 0 });

  const toClassify = cards.filter(c => !c.category && (c.title || c.canonicalId));
  if (!toClassify.length) return res.status(200).json({ categorized: [], skipped: cards.length });

  const list = toClassify.map((c, i) => `${i + 1}. ${c.title || c.canonicalId}`).join('\n');

  const prompt = `You are an elite S&C coach. Classify each exercise as either "gym" (strength & conditioning main session) or "warmup" (pre-training warmup, mobility, foam rolling, activation).

GYM examples: Trap Bar Deadlift, Bulgarian Split Squat, Box Jump, DB Bench Press, KB Swing, Hip Thrust, SL RDL, Copenhagen Plank (loaded), Nordic Curl, Weighted Step-Up, Plyometric Push-Up, CMJ, Tuck Jump, RDL, Goblet Squat, Inverted Row, Landmine Press, MB Throw, Band Pull-Apart (strength), Pallof Press (loaded)

WARMUP examples: Quad Foam Roll, Hip 90/90 Rotation, World's Greatest Stretch, Glute Bridge March (activation), Hip Flexor Stretch, Thoracic Rotation, Ankle Circles, Cat-Cow, Lateral Shuffle (warmup drill), Lateral Band Walk (activation), Dead Bug (light activation), Bird-Dog (mobility), RKC Plank (if used as activation prep)

Rules:
- If it's a heavy/loaded/plyometric main session exercise → gym
- If it's foam rolling, joint circles, light activation, mobility → warmup
- Copenhagen Plank as a main exercise → gym; as a 30s activation set → warmup; if unclear → gym
- Pallof Press heavy loaded → gym; light band for warmup → warmup; if unclear → gym
- Dead Bug with resistance → gym; bodyweight light → warmup
- RKC Plank as main core work → gym; as warmup activation → warmup; if unclear → gym

Return ONLY a JSON array, no markdown, no explanation:
[{"i":1,"cat":"gym"},{"i":2,"cat":"warmup"},...]

Exercises to classify:
${list}`;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'OPENAI_API_KEY не настроен' });

  const apiResp = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_output_tokens: 4500,
      input: prompt,
      store: false,
    }),
  });

  if (!apiResp.ok) {
    const err = await apiResp.text().catch(() => '');
    return res.status(502).json({ error: 'OpenAI API error', raw: err.slice(0, 300) });
  }

  const aiData = await apiResp.json();
  const text = extractText(aiData);

  let parsed;
  try {
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) return res.status(502).json({ error: 'AI parse error', raw: text.slice(0, 300) });
    parsed = JSON.parse(m[0]);
  } catch (e) {
    return res.status(502).json({ error: 'AI parse error', raw: text.slice(0, 300) });
  }

  const categorized = [];
  const ts = String(Date.now());

  for (const item of parsed) {
    const card = toClassify[item.i - 1];
    if (!card) continue;
    const cat = item.cat === 'warmup' ? 'warmup' : 'gym';
    await redis('hset', `ex:lib:${card.canonicalId}`, 'category', cat, 'updatedAt', ts);
    categorized.push({ id: card.canonicalId, title: card.title || card.canonicalId, category: cat });
  }

  return res.status(200).json({ categorized, skipped: cards.length - toClassify.length });
}
