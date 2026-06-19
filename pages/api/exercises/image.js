// pages/api/exercises/image.js
// POST { name } → DALL-E 3 exercise illustration, cached in Redis by slug.
// Returns data:image/png;base64,... URL.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}

function buildPrompt(name) {
  return (
    `Professional black and white fitness textbook illustration of the exercise "${name}". ` +
    `Style: classic sports science anatomical line art, like a 1990s strength training manual. ` +
    `Shows a male athlete in the correct mid-movement position of the exercise. ` +
    `Clear body posture, proper joint angles, equipment visible if required (barbell, dumbbell, bench, cable, box). ` +
    `Black ink lines on pure white background. No color, no shading, no background elements, no text, no labels. ` +
    `Side or 3/4 view. Full body visible.`
  );
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });

  const slug = slugify(name);
  const cacheKey = `exercise:dalle3:${slug}`;

  try {
    const cached = await redis('get', cacheKey);
    if (cached) return res.status(200).json({ image: cached, cached: true });
  } catch (_) {}

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'OPENAI_API_KEY не настроен в Vercel' });

  try {
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: buildPrompt(name),
        n: 1,
        size: '1024x1024',
        quality: 'medium',
      }),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(502).json({ error: err.error?.message || `OpenAI error ${r.status}` });
    }

    const data = await r.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) return res.status(502).json({ error: 'OpenAI не вернул изображение' });

    const dataUrl = `data:image/png;base64,${b64}`;
    redis('set', cacheKey, dataUrl).catch(() => {});

    return res.status(200).json({ image: dataUrl, cached: false });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
