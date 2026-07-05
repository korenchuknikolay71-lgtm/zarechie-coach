// pages/api/programs/regenerate-exercise.js
// POST { playerId, date, blockIndex, exerciseIndex }
// Replaces one exercise in the saved session with a fresh AI-generated alternative.

import { redis } from '../../../lib/redis';
import { isAuthorized } from '../../../lib/auth';
import { sessionKey } from '../../../lib/workspacePrefix';

const BANNED =
  'Присед со штангой на спине (Back Squat) | Жим штанги лёжа (Bench Press barbell) | Nordic Curl | Ab Wheel Rollout / Ab Roller | Broad Jump | DB Floor Press | Band Wrist Stability | Jump Set Drill | KB Press / жим с гирями | Tricep Pushdown с резиновой петлёй / Band Tricep Pushdown';

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

  const { playerId, date, blockIndex, exerciseIndex, workspace = 'zarechie' } = req.body || {};
  if (!playerId || !date || blockIndex == null || exerciseIndex == null) {
    return res.status(400).json({ error: 'playerId, date, blockIndex, exerciseIndex required' });
  }

  // Load saved session
  const raw = await redis('get', sessionKey(workspace, playerId, date)).catch(() => null);
  if (!raw) return res.status(404).json({ error: 'Программа не найдена' });

  let record;
  try { record = typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { return res.status(500).json({ error: 'Ошибка чтения сессии' }); }

  // save.js wraps: { session: {...}, player, dataSummary, dayGoal, date, savedAt }
  const session = record.session ?? record;

  const block = session.blocks?.[blockIndex];
  if (!block) return res.status(400).json({ error: 'Блок не найден' });

  const exercise = block.exercises?.[exerciseIndex];
  if (!exercise) return res.status(400).json({ error: 'Упражнение не найдено' });

  // All other exercises (for dedup)
  const others = (session.blocks || [])
    .flatMap((b, bi) =>
      (b.exercises || []).map((ex, ei) => ({ name: ex.name, skip: bi === blockIndex && ei === exerciseIndex }))
    )
    .filter(e => !e.skip)
    .map(e => e.name)
    .join(', ');

  const blockLabel = block.label || block.code || `Блок ${blockIndex + 1}`;
  const dayGoal = record.dayGoal || session.dayGoal || '—';

  const prompt = `Ты — элитный тренер по силовой подготовке волейболистов. Замени одно упражнение в тренировочной программе на другой вариант.

ПРОГРАММА:
Цель дня: ${dayGoal}
${(session.blocks || []).map((b, i) => `Блок ${i + 1} (${b.label || b.code || ''}): ${(b.exercises || []).map(e => e.name).join(', ')}`).join('\n')}

ЗАМЕНИТЬ:
Блок "${blockLabel}", позиция ${exerciseIndex + 1}: "${exercise.name}"
Тренер хочет другой вариант этого упражнения.

ПРАВИЛА:
• Новое упражнение должно быть из той же категории и вектора нагрузки (блок: ${blockLabel})
• Сохрани: code="${exercise.code}", tempo="${exercise.tempo || ''}"
• НЕ используй упражнения, уже стоящие в программе: ${others}
• ЗАПРЕЩЕНО навсегда: ${BANNED}
• ЯЗЫК: поле name — профессиональный английский S&C ("Bulgarian Split Squat", "Trap Bar Deadlift", "Box Jump (Bilateral)"). Поле cue — одна фраза, максимум 12 слов, РУССКИЙ язык, конкретный паттерн/угол, без воды ("Колено над вторым пальцем.", "Шарнир в бедре — позвоночник нейтрален.", "Нейтраль таза до старта."). Поле autoReg — один критерий остановки, РУССКИЙ язык ("Скорость падает → стоп.", "RPE 9 → снизь 5%.").

ОТВЕТ — только JSON, без markdown, без пояснений:
{"code":"${exercise.code}","name":"...","tempo":"${exercise.tempo || ''}","targetSets":${JSON.stringify(exercise.targetSets || ['3x8'])},"weightNote":"${exercise.weightNote || ''}","cue":"...","autoReg":"${exercise.autoReg || ''}"}`;

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return res.status(503).json({ error: 'OPENAI_API_KEY не настроен' });

  try {
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: prompt,
        max_output_tokens: 700,
        store: false,
      }),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: err.error?.message || `OpenAI error ${r.status}` });
    }

    const msg = await r.json();
    const text = extractText(msg);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(502).json({ error: 'Не удалось распознать ответ', raw: text });

    const newExercise = JSON.parse(match[0]);

    // Persist updated session — preserve the { session, player, ... } wrapper from save.js
    session.blocks[blockIndex].exercises[exerciseIndex] = newExercise;
    const toSave = record.session ? { ...record, session } : session;
    await redis('set', sessionKey(workspace, playerId, date), JSON.stringify(toSave));

    return res.status(200).json({ exercise: newExercise });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
