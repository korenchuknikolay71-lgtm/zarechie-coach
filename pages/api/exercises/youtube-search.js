// pages/api/exercises/youtube-search.js
// GET ?name=... → searches YouTube Data API v3 for an exercise video.
// Before searching, AI translates the Russian exercise name into an optimal
// English S&C search query (YouTube has far more high-quality English tutorials). If the
// English search returns nothing (or translation fails), it falls back to the Russian query.
// Results are cached in Redis for 90 days so each exercise is searched at most once.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { setVideo } from '../../../lib/exerciseLibrary';

export const config = { maxDuration: 10 };

const OPENAI_MODEL = 'gpt-5.5';

function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '');
}

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

// Translate a Russian S&C exercise name into a concise English YouTube search query.
// Returns null on any failure so the caller can fall back to Russian.
async function buildSearchQuery(name, openaiKey) {
  if (!openaiKey) return null;
  try {
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: `Translate this Russian S&C exercise name to a concise English YouTube search query (3-5 words, no punctuation): ${name}. Reply with only the search query.`,
        max_output_tokens: 40,
        store: false,
      }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const text = extractText(data);
    const query = text.trim().replace(/^["']|["']$/g, '').trim();
    return query || null;
  } catch (_) {
    return null;
  }
}

// Run a single YouTube Data API search. Returns the first video URL, or null on a miss.
// Throws on a non-OK response so the handler can surface the API error.
async function youtubeSearch(query, apiKey, relevanceLanguage) {
  const q = encodeURIComponent(query);
  const langParam = relevanceLanguage ? `&relevanceLanguage=${relevanceLanguage}` : '';
  const r = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${q}&type=video&maxResults=3${langParam}&key=${apiKey}`,
  );
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    const e = new Error(err.error?.message || `YouTube API error ${r.status}`);
    e.status = r.status;
    throw e;
  }
  const data = await r.json();
  const videoId = data.items?.[0]?.id?.videoId;
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).end();

  const name = (req.query.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });

  const cacheKey = `exercise:yt:${slugify(name)}`;

  // Cache hit
  try {
    const cached = await redis('get', cacheKey);
    if (cached) {
      const cachedUrl = cached === 'none' ? null : cached;
      // await: persist to library so future lookups find it by canonical ID.
      // overwrite:false → never clobber a trainer's manual link. Serverless is unreliable,
      // so we await rather than fire-and-forget.
      if (cachedUrl) await setVideo(name, cachedUrl, { overwrite: false }).catch(() => {});
      return res.status(200).json({ url: cachedUrl, cached: true });
    }
  } catch (_) {}

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'YOUTUBE_API_KEY не настроен' });

  try {
    let url = null;

    // 1. Try an English search first (better S&C coverage on YouTube).
    const englishQuery = await buildSearchQuery(name, process.env.OPENAI_API_KEY);
    if (englishQuery) {
      try {
        url = await youtubeSearch(`${englishQuery} exercise tutorial technique`, apiKey, null);
      } catch (_) {
        // English search failed — fall through to the Russian fallback below.
      }
    }

    // 2. Fallback: Russian query (also covers the case where translation was skipped).
    if (!url) {
      url = await youtubeSearch(`${name} техника выполнения упражнение`, apiKey, 'ru');
    }

    // Cache result (90 days). Store 'none' for misses so we don't re-search.
    const ttl = 60 * 60 * 24 * 90;
    await redis('set', cacheKey, url || 'none', 'EX', ttl).catch(() => {});

    // await: persist to library so future lookups find it by canonical ID.
    // overwrite:false → never clobber a trainer's manual link.
    if (url && url !== 'none') await setVideo(name, url, { overwrite: false }).catch(() => {});

    return res.status(200).json({ url, cached: false });
  } catch (e) {
    if (e.status) return res.status(502).json({ error: e.message });
    return res.status(500).json({ error: e.message });
  }
}
