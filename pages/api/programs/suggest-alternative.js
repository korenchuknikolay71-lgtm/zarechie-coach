// pages/api/programs/suggest-alternative.js
// POST { exerciseName, restrictions, position, focus }
// → { alternative: "Название упражнения — краткое обоснование" }
// One concrete free-weight alternative for a restricted exercise, preserving the same movement vector.

import { isAuthorized } from '../../../lib/auth';
import { restrictionsToPrompt } from '../../../lib/exerciseRestrictions';

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
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { exerciseName, restrictions, position, focus } = req.body || {};
  if (!exerciseName) {
    return res.status(400).json({ error: 'exerciseName is required' });
  }

  const restrictionsText = Array.isArray(restrictions)
    ? restrictionsToPrompt(restrictions)
    : (restrictions || 'ограничения не указаны');

  const prompt = `Упражнение "${exerciseName}" запрещено из-за: ${restrictionsText}.
Позиция игрока: ${position || 'не указана'}. Фаза тренировки: ${focus || 'не указана'}.
Предложи одно конкретное альтернативное упражнение на свободных весах (без тренажёров) для того же вектора движения.
Ответ: одна строка — "Название упражнения — краткое обоснование". Без предисловий.`;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'OPENAI_API_KEY не настроен' });

  try {
    const apiResp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: prompt,
        max_output_tokens: 160,
        store: false,
      }),
    });

    if (!apiResp.ok) {
      const err = await apiResp.text().catch(() => '');
      return res.status(502).json({ error: 'OpenAI API error', raw: err.slice(0, 300) });
    }

    const aiData = await apiResp.json();
    const text = extractText(aiData);
    if (!text) return res.status(502).json({ error: 'Пустой ответ' });

    return res.status(200).json({ alternative: text });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
