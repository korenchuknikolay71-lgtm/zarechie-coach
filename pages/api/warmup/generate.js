// pages/api/warmup/generate.js
// POST { date, phase }
// date: 'YYYY-MM-DD', phase: 1|2|3
// Determines morning focus from day of week, gets first player's saved session,
// generates S&C warmup, saves to Redis, returns plan.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';

const FOCUS_LABELS = {
  anterior: 'передняя цепь',
  posterior: 'задняя цепь',
  fullbody: 'всё тело',
  general: 'общая нагрузка',
};

const PHASE_LABELS = {
  1: 'Фаза 1 (Эксцентрик)',
  2: 'Фаза 2 (Изометрик)',
  3: 'Фаза 3 (Взрыв)',
};

const PHASE_GUIDANCE = {
  1: 'Фаза 1 (Эксцентрик) — больше мобилизации и удержаний, суставная работа с паузами (2-3 сек в крайней точке), активация средняя интенсивность',
  2: 'Фаза 2 (Изометрик) — акцент на мышечную активацию (изометрические удержания в активации), скоростной блок с изометрическими компонентами',
  3: 'Фаза 3 (Взрыв) — меньше статики, больше динамики и скорости. Активация взрывная. Скоростной блок — максимальная интенсивность',
};

const OPENAI_WARMUP_MODEL = 'gpt-5.5';

const TEAM_WARMUP_TOOL = {
  name: 'build_team_warmup',
  description: 'Командная S&C-разминка перед вечерней волейбольной тренировкой.',
  input_schema: {
    type: 'object',
    required: ['date', 'phase', 'morningFocus', 'sections'],
    properties: {
      date: { type: 'string' },
      phase: { type: 'number' },
      morningFocus: { type: 'string' },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'label', 'color', 'exercises'],
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            color: { type: 'string' },
            exercises: {
              type: 'array',
              items: {
                type: 'object',
                required: ['name', 'nameEn', 'reps', 'note'],
                properties: {
                  name: { type: 'string' },
                  nameEn: { type: 'string' },
                  reps: { type: 'string' },
                  note: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  },
};

function toolForOpenAI(tool) {
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
    strict: false,
  };
}

function parseFunctionArguments(args) {
  if (!args) return null;
  if (typeof args === 'object') return args;
  try { return JSON.parse(args); } catch { return null; }
}

function findOpenAIFunctionCall(output, name) {
  const stack = Array.isArray(output) ? [...output] : [];
  while (stack.length) {
    const item = stack.shift();
    if (!item || typeof item !== 'object') continue;
    if (item.type === 'function_call' && item.name === name) return item;
    if (Array.isArray(item.content)) stack.push(...item.content);
    if (Array.isArray(item.output)) stack.push(...item.output);
  }
  return null;
}

function morningFocusFromDate(date) {
  // getUTCDay: 0=Sun,1=Mon,...,5=Fri
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (day === 1) return 'anterior';
  if (day === 2) return 'posterior';
  if (day === 5) return 'fullbody';
  return 'general';
}

// Pull exercise names from blocks A/B/C of a saved session record for prompt context.
function extractMorningContext(record) {
  try {
    const session = record?.session;
    if (!session) return '';
    const names = [];
    const collect = (val) => {
      if (!val) return;
      if (Array.isArray(val)) { val.forEach(collect); return; }
      if (typeof val === 'object') {
        if (typeof val.name === 'string') names.push(val.name);
        else Object.values(val).forEach(collect);
      }
    };
    // Look for blocks A/B/C regardless of exact shape.
    const blocks = session.blocks || session;
    ['A', 'B', 'C', 'a', 'b', 'c'].forEach((k) => {
      if (blocks && blocks[k]) collect(blocks[k]);
    });
    if (!names.length) collect(session);
    return [...new Set(names)].slice(0, 12).join(', ');
  } catch {
    return '';
  }
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date, phase } = req.body || {};
  if (!date) {
    return res.status(400).json({ error: 'date is required' });
  }
  const phaseNum = Number(phase) || 1;
  const morningFocus = morningFocusFromDate(date);
  const morningFocusLabel = FOCUS_LABELS[morningFocus] || FOCUS_LABELS.general;
  const phaseLabel = PHASE_LABELS[phaseNum] || PHASE_LABELS[1];
  const phaseGuidance = PHASE_GUIDANCE[phaseNum] || PHASE_GUIDANCE[1];

  // Try to find a saved session of any player for this date, for prompt context.
  let morningExercisesContext = 'данные о конкретных упражнениях недоступны';
  try {
    const keys = await redis('keys', `coach:session:*:${date}`);
    if (Array.isArray(keys) && keys.length) {
      const raw = await redis('get', keys[0]);
      if (raw) {
        const record = JSON.parse(raw);
        const ctx = extractMorningContext(record);
        if (ctx) morningExercisesContext = ctx;
      }
    }
  } catch {
    // Non-fatal — proceed without context.
  }

  const prompt = `Ты — элитный S&C тренер. Составь командную разминку перед вечерней волейбольной тренировкой.

КОНТЕКСТ:
- Утром была тренировка: ${morningFocusLabel} (${morningExercisesContext})
- Фаза сборов: ${phaseLabel}
- Длительность разминки: 25-30 минут
- Формат: только работа с телом / S&C, БЕЗ волейбольной технической работы

ФАЗА ${phaseNum} — АКЦЕНТ:
${phaseGuidance}

СТРУКТУРА (строго 4 блока):
1. FOAM ROLLING — 4-5 упражнений, ВСЕ основные группы (квадрицепс, IT-band, хамстринги, ягодицы, грудной отдел, широчайшая), с учётом утренней нагрузки
2. СУСТАВНАЯ МОБИЛИЗАЦИЯ — 4-5 упражнений (голеностоп, ТБС, грудной отдел, плечо), динамические
3. ДИНАМИЧЕСКАЯ АКТИВАЦИЯ — 4-5 упражнений (ягодицы, кор, лопатки, ротаторы), активационные
4. СКОРОСТНАЯ ПОДГОТОВКА — 3-4 упражнения (ускорения, COD, боковые движения), БЕЗ лесенки

ПРАВИЛА:
- Формат повторений, НЕ время (например: "8 повт./ногу", "10 пассов", "3×6")
- Поле "name": РУССКОЕ название упражнения (для отображения тренеру). Примеры: "Катание на ролике — квадрицепс", "Вращение ТБС 90/90", "Марш ягодичного моста"
- Поле "nameEn": профессиональный S&C английский (для поиска видео на YouTube). Примеры: "Quad Roll Foam Roller", "Hip 90/90 Rotation", "Glute Bridge March"
- note к каждому упражнению: краткая подсказка на русском (1-2 предложения)
- Учитывай что утром была нагрузка: если передняя цепь → особый акцент rolling на квад/IT-band, mobility на сгибатели бедра/голеностоп
- Скорость блок: БЕЗ прыжков в высоту (команда тренировалась утром). Lateral shuffle, ускорения 5-10м, реактивные движения.

ОТВЕТ — только JSON без markdown:
{"date":"${date}","phase":${phaseNum},"morningFocus":"${morningFocus}","sections":[{"id":"rolling","label":"Foam Rolling","color":"violet","exercises":[{"name":"...","nameEn":"...","reps":"...","note":"..."}]},{"id":"mobility","label":"Суставная мобилизация","color":"sky","exercises":[]},{"id":"activation","label":"Динамическая активация","color":"amber","exercises":[]},{"id":"speed","label":"Скоростная подготовка","color":"cyan","exercises":[]}]}`;

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'OPENAI_API_KEY не настроен' });

    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_WARMUP_MODEL,
        input: prompt,
        max_output_tokens: 3000,
        store: false,
        tools: [toolForOpenAI(TEAM_WARMUP_TOOL)],
        tool_choice: { type: 'function', name: 'build_team_warmup' },
      }),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(502).json({ error: err.error?.message || `API error ${r.status}` });
    }

    const data = await r.json();
    const toolCall = findOpenAIFunctionCall(data.output, 'build_team_warmup');
    const plan = parseFunctionArguments(toolCall?.arguments);
    if (!plan) return res.status(502).json({ error: 'Модель не вернула структуру разминки' });

    // Ensure core fields are consistent with the request.
    plan.date = date;
    plan.phase = phaseNum;
    plan.morningFocus = morningFocus;

    await Promise.all([
      redis('set', `coach:warmup:${date}`, JSON.stringify(plan)),
      redis('sadd', 'coach:warmup:index', date),
    ]);

    return res.status(200).json({ plan });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
