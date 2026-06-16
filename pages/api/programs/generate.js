// pages/api/programs/generate.js
// POST { playerId, date, dayGoal, focus, notes, days=7 } → AI-generated gym session for one specific day,
// returned as structured JSON (blocks of circuit-style exercises) instead of free text — the web app
// renders it as printable exercise cards, matching the trainer's own paper session sheets.

import { getPlayerSnapshot, todayISO } from '../../../lib/playerData';
import { isAuthorized } from '../../../lib/auth';

const FOCUS_LABELS = {
  preseason: 'предсезонная подготовка — база силы и объёма',
  inseason: 'игровой период — поддержание формы, минимизация утомления',
  power: 'развитие взрывной силы и прыжка',
  strength: 'максимальная силовая база',
  rehab: 'возврат после травмы / разгрузка',
};

// Claude returns the session through this tool call instead of free text — guarantees
// valid, predictable structure (blocks → circuit exercises → sets) we can render as cards.
const SESSION_TOOL = {
  name: 'build_session',
  description:
    'Структурированная тренировка в зале на один конкретный день, разбитая на блоки (круги/суперсеты).',
  input_schema: {
    type: 'object',
    required: ['assessment', 'blocks', 'warnings'],
    properties: {
      assessment: {
        type: 'string',
        description: 'Краткая оценка состояния игрока на сегодня, 2-3 предложения. Упомяни, если каких-то данных за этот день не было.',
      },
      blocks: {
        type: 'array',
        description:
          'Блоки тренировки по порядку выполнения. Каждый блок — это круг/суперсет из 1-4 упражнений, выполняемых поочерёдно по подходам (A1→A2→A3→пауза→повтор круга). Обычно 3-5 блоков на сессию.',
        items: {
          type: 'object',
          required: ['label', 'exercises'],
          properties: {
            label: { type: 'string', description: 'Буква блока по порядку: A, B, C, D...' },
            exercises: {
              type: 'array',
              items: {
                type: 'object',
                required: ['code', 'name', 'targetSets', 'cue'],
                properties: {
                  code: { type: 'string', description: 'Код упражнения внутри блока: A1, A2, A3...' },
                  name: { type: 'string', description: 'Название упражнения на русском, коротко (как на табличке в зале)' },
                  targetSets: {
                    type: 'array',
                    description:
                      'Целевые повторения по рабочим подходам, например ["5","5","5"] или ["8+8","8+8"] для односторонних. 3-4 элемента.',
                    items: { type: 'string' },
                  },
                  weightNote: {
                    type: 'string',
                    description:
                      'Рекомендация по нагрузке. Если точный рабочий вес игрока неизвестен (а обычно неизвестен) — дай относительную интенсивность (RPE 6-8, %1ПМ или качественное "лёгкое/среднее/тяжёлое отягощение"), НЕ выдумывай конкретные кг. Используй конкретные кг только если тренер сам указал вес в комментариях.',
                  },
                  cue: {
                    type: 'string',
                    description: 'Одна короткая техническая подсказка по выполнению — императивная, по делу, как реальная пометка тренера (например "Максимально мощно вверх, минимальный контакт с полом").',
                  },
                },
              },
            },
          },
        },
      },
      warnings: {
        type: 'string',
        description: 'Ключевые предостережения/на что обратить внимание тренеру в зале сегодня.',
      },
    },
  },
};

function avg(arr) {
  const vals = arr.filter(v => v != null && !Number.isNaN(v));
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

function onDay(arr, date) {
  return arr.find(r => r.date === date) || null;
}

function fmt(field, value, suffix = '') {
  return `• ${field}: ${value != null ? value + suffix : 'нет данных'}`;
}

function summarizeSnapshot(snap) {
  const { player, whoop, surveys, morning, neuro, periodDays, targetDate } = snap;

  const todayWhoop = onDay(whoop, targetDate);
  const todayMorning = onDay(morning, targetDate);
  const lastSurvey = [...surveys].filter(d => d.date <= targetDate).pop() || null;
  const recentInjury = [...surveys].filter(d => d.date <= targetDate).reverse().find(d => d.hasInjury) || null;

  const trendRecovery = avg(whoop.map(d => d.recovery));
  const trendHrv = avg(whoop.map(d => d.hrv));
  const trendStrain = avg(whoop.map(d => d.strain));
  const trendSrpe = avg(surveys.map(d => d.srpe));
  const trendFatigue = avg(surveys.map(d => d.fatigue));
  const trendMws = avg(morning.map(d => d.mws));

  const lines = [
    `Игрок: ${player.name}, позиция: ${player.position || 'не указана'}`,
    `Дата тренировки: ${targetDate}`,
    '',
    `Состояние на ${targetDate} (точечные данные за этот день):`,
    todayWhoop
      ? [
          fmt('Recovery', todayWhoop.recovery, '%'),
          fmt('ВСР (HRV)', todayWhoop.hrv, ' мс'),
          fmt('Пульс покоя', todayWhoop.rhr, ' уд/мин'),
          fmt('Сон', todayWhoop.sleep_hours, ' ч'),
          fmt('Strain (накопленный, если уже была активность)', todayWhoop.strain),
        ].join('\n')
      : '• WHOOP за этот день не записан — нет точных данных, ниже только тренд.',
    todayMorning
      ? [
          fmt('MWS (Morning Wellness Score)', todayMorning.mws, '%'),
          fmt('Качество сна', todayMorning.sleep, '/5'),
          fmt('Стресс вне зала', todayMorning.stress, '/5'),
          fmt('Крепатура утром', todayMorning.doms, '/5'),
        ].join('\n')
      : '• Утренний чек-ин за этот день не заполнен.',
    lastSurvey
      ? `• Последний вечерний опросник (${lastSurvey.date}): sRPE ${lastSurvey.srpe ?? '—'}/10, усталость ${lastSurvey.fatigue ?? '—'}/5, крепатура ${lastSurvey.soreness ?? '—'}/5`
      : '• Вечерних опросников в доступном окне нет.',
    recentInjury
      ? `• ⚠ Зафиксирована травма ${recentInjury.date}: область ${(recentInjury.injuryAreas || []).join(', ') || '—'}, боль ${recentInjury.pain_level}/10. ${recentInjury.injuryText || ''}`
      : '• Активных травм не зафиксировано.',
    '',
    `Тренд за предыдущие ${periodDays} дней (для контекста накопленного утомления, не путать с точными данными на сегодня):`,
    `• Recovery (средн.): ${trendRecovery != null ? trendRecovery + '%' : 'нет данных'}`,
    `• ВСР (средн.): ${trendHrv != null ? trendHrv + ' мс' : 'нет данных'}`,
    `• Strain (средн.): ${trendStrain != null ? trendStrain : 'нет данных'}`,
    `• sRPE (средн.): ${trendSrpe != null ? trendSrpe + '/10' : 'нет данных'}`,
    `• Усталость (средн.): ${trendFatigue != null ? trendFatigue + '/5' : 'нет данных'}`,
    `• MWS (средн.): ${trendMws != null ? trendMws + '%' : 'нет данных'}`,
  ];

  if (neuro) {
    lines.push('', 'Нейромышечное тестирование (последние замеры):', JSON.stringify(neuro, null, 2));
  }

  return lines.join('\n');
}

const SYSTEM_PROMPT = `Ты — элитный тренер по силовой и кондиционной подготовке (S&C) мирового уровня, специализирующийся на волейболе.
Составляешь ОДНУ тренировку в зале на конкретный день — на основе объективных данных (WHOOP) и субъективных опросников игрока именно за этот день, плюс тренда последних дней для контекста.

Формат, который ты обязан соблюдать (он скопирован со стиля реальных карточек тренера команды):
- Тренировка разбита на блоки A, B, C... — каждый блок это круг/суперсет из 1-4 упражнений (A1, A2, A3...), выполняемых по очереди, затем круг повторяется на следующий подход.
- Обычно первый блок(и) — взрывная/плиометрическая работа или олимпийские/баллистические движения (прыжки, броски набивного мяча, рывки, толчки) низким числом повторений (3-6) с максимальным качеством движения.
- Дальше блоки силовой работы нижней/верхней части тела парами антагонистов (например присед + жим, тяга + выпад) и блоки кора/стабильности/профилактики (планка, мёртвый жук, пауловские движения, стабилизация плеча).
- На каждое упражнение — короткая императивная техническая подсказка в стиле реальной пометки тренера (например "Максимально мощно вверх, минимальный контакт с полом", "Опускаться вниз 5 секунд", "Максимально резко вверх").
- Вес — НЕ выдумывай конкретные кг, если тренер их не дал в комментариях. Используй RPE / %1ПМ / "лёгкое-среднее-тяжёлое отягощение".

Принципы:
- Волейбол — взрывной вид спорта: приоритет на силу ног, прыжок, плиометрику, стабильность плеча и кора, профилактику травм колена/плеча/спины.
- Приоритет — точечные данные на сегодня (Recovery, MWS, последний sRPE/усталость). Тренд используй только как фон, если точечных данных за день нет — явно скажи об этом в оценке, не выдавай тренд за факт.
- Если Recovery/MWS на сегодня низкие или есть признаки накопленного утомления — снижай объём и интенсивность сессии, не добавляй максимальные усилия.
- Если зафиксирована активная травма — сессия должна её учитывать (избегать пострадавшей зоны, добавлять реабилитационные элементы).
- Учитывай фазу подготовки (in-season — поддержание, не наращивание) vs межсезонье (можно строить объём/силу), но в первую очередь — заявленную цель именно этой тренировки и комментарии тренера.
- Пиши на русском языке, профессиональным языком тренера, без избыточных вступлений.

Заполни структуру через инструмент build_session.`;

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY не настроен в переменных среды Vercel' });
  }

  const { playerId, date, dayGoal = '', days = 7, focus = 'inseason', notes = '' } = req.body || {};
  if (!playerId) return res.status(400).json({ error: 'playerId required' });

  const today = todayISO();
  const targetDate = date || today;
  if (targetDate > today) {
    return res.status(400).json({ error: 'Дата не может быть в будущем — на эту дату ещё нет данных игрока' });
  }

  const snapshot = await getPlayerSnapshot(String(playerId), Number(days) || 7, targetDate);
  if (!snapshot) return res.status(404).json({ error: 'Player not found' });

  const dataSummary = summarizeSnapshot(snapshot);
  const focusLabel = FOCUS_LABELS[focus] || focus;

  const userPrompt = `${dataSummary}

Фаза подготовки: ${focusLabel}
Цель именно этой тренировки: ${dayGoal || 'не указана отдельно — ориентируйся на фазу подготовки выше'}
${notes ? `Комментарии тренера: ${notes}` : ''}

Составь ОДНУ тренировку в тренажёрном зале на ${targetDate} — не микроцикл, не неделю, а конкретно эту сессию.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
        tools: [SESSION_TOOL],
        tool_choice: { type: 'tool', name: 'build_session' },
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(502).json({ error: err.error?.message || `API error ${response.status}` });
    }

    const data = await response.json();
    const toolUse = data.content?.find(c => c.type === 'tool_use' && c.name === 'build_session');
    if (!toolUse) {
      return res.status(502).json({ error: 'Модель не вернула структурированную тренировку' });
    }

    return res.status(200).json({
      session: toolUse.input,
      player: snapshot.player,
      dataSummary,
      date: targetDate,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
