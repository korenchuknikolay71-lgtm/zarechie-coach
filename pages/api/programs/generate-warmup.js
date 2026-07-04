// pages/api/programs/generate-warmup.js
// POST { playerId, date, dayGoal, focus, notes, days=7 }
// Generates a volleyball warm-up sequence (15-20 min) adapted to player biometrics and phase.

import { getPlayerSnapshot, todayISO } from '../../../lib/playerData';
import { isAuthorized } from '../../../lib/auth';

const WARMUP_TOOL = {
  name: 'build_warmup',
  description: 'Разминка перед тренировкой или игрой — последовательность блоков на 15–20 минут.',
  input_schema: {
    type: 'object',
    required: ['assessment', 'blocks', 'duration_note'],
    properties: {
      assessment: {
        type: 'string',
        description: 'Краткая оценка состояния игрока сегодня и как это влияет на разминку (2–3 предложения).',
      },
      duration_note: {
        type: 'string',
        description: 'Общая продолжительность разминки и акцент (например: "18 мин, акцент на мобильность бедра и плечо").',
      },
      blocks: {
        type: 'array',
        description: 'Блоки разминки по порядку. Обычно 3–4 блока (ткань → мобильность → активация → праймер).',
        items: {
          type: 'object',
          required: ['label', 'exercises'],
          properties: {
            label: { type: 'string', description: 'Буква блока: A, B, C, D' },
            exercises: {
              type: 'array',
              items: {
                type: 'object',
                required: ['code', 'name', 'targetSets', 'cue'],
                properties: {
                  code: { type: 'string', description: 'A1, A2, ...' },
                  name: { type: 'string', description: 'Название движения на русском' },
                  targetSets: {
                    type: 'array',
                    description: 'Дозировка по подходам: ["10", "10"] или ["45сек"] или ["3/ст.", "3/ст."]',
                    items: { type: 'string' },
                  },
                  weightNote: {
                    type: 'string',
                    description: 'Необязательно: отягощение или уточнение ("лёгкая лента", "без нагрузки")',
                  },
                  cue: {
                    type: 'string',
                    description: 'Ключевая тренерская подсказка по технике или вниманию.',
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

const OPENAI_WARMUP_MODEL = 'gpt-5.5';

function warmupToolForOpenAI(tool) {
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
  const { player, whoop, surveys, morning, periodDays, targetDate } = snap;
  const todayWhoop = onDay(whoop, targetDate);
  const todayMorning = onDay(morning, targetDate);
  const lastSurvey = [...surveys].filter(d => d.date <= targetDate).pop() || null;
  const recentInjury = [...surveys].filter(d => d.date <= targetDate).reverse().find(d => d.hasInjury) || null;

  const lines = [
    `Игрок: ${player.name}, позиция: ${player.position || 'не указана'}`,
    `Дата: ${targetDate}`,
    '',
    todayWhoop
      ? [fmt('Recovery', todayWhoop.recovery, '%'), fmt('HRV', todayWhoop.hrv, ' мс'), fmt('Сон', todayWhoop.sleep_hours, ' ч'), fmt('Strain', todayWhoop.strain)].join('\n')
      : '• WHOOP за этот день не записан.',
    todayMorning
      ? [fmt('MWS', todayMorning.mws, '%'), fmt('Качество сна', todayMorning.sleep, '/5'), fmt('DOMS', todayMorning.doms, '/5')].join('\n')
      : '• Утренний чек-ин не заполнен.',
    lastSurvey
      ? `• Опросник (${lastSurvey.date}): sRPE ${lastSurvey.srpe ?? '—'}/10, усталость ${lastSurvey.fatigue ?? '—'}/5`
      : '• Вечерних опросников нет.',
    recentInjury
      ? `• ⚠ Травма ${recentInjury.date}: ${(recentInjury.injuryAreas || []).join(', ')}, боль ${recentInjury.pain_level}/10. ${recentInjury.injuryText || ''}`
      : '• Активных травм нет.',
    '',
    `Тренд (${periodDays} дн.): Recovery ${avg(whoop.map(d => d.recovery)) ?? '—'}%, HRV ${avg(whoop.map(d => d.hrv)) ?? '—'} мс, sRPE ${avg(surveys.map(d => d.srpe)) ?? '—'}/10`,
  ];
  return lines.join('\n');
}

const SYSTEM_PROMPT = `Ты — элитный S&C-тренер профессиональной волейбольной команды. Составляешь разминку перед тренировочной сессией или игрой.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
СТРУКТУРА РАЗМИНКИ — 4 БЛОКА (15–20 МИН ВСЕГО)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A — ТКАНЕВАЯ РАБОТА (3–5 мин): Миофасциальный релиз роллом.
  Акцент: четырёхглавые, IT-полоса, ягодицы, грудной отдел, икры. По 45–60 сек на зону.
  При усталости/крепатуре — увеличь до 7 мин, добавь Тракцию суставов с резиновой петлёй (бедро, голеностоп).

B — ДИНАМИЧЕСКАЯ МОБИЛЬНОСТЬ (5–6 мин): суставная мобилизация + динамический стретч.
  Обязательно: бедро (Мобилизация ТБС 90/90, Растяжка Мирового рекордсмена, Поза Голубя), голеностоп (Мобилизация голеностопа у стены), грудной отдел (Открытая книга, Ротация грудного отдела).
  Добавляй: Эксцентрика сгибателей бедра, Боковой выпад, Кросс-боди тяга + Маховый удар назад, Приседание с выходом руками.

C — НЕЙРОМЫШЕЧНАЯ АКТИВАЦИЯ (4–5 мин): «разбуди» ягодицы, ротаторы плеча, кор.
  Нижнее: Боковые шаги с резиновой петлёй / Монстр-прогулка с петлёй (2×10 yd), Ягодичный мост с удержанием 5 сек (1–2×5), Ягодичный мост на одной ноге (1×10/ст.).
  Верхнее: Разводка с резиновой петлёй (1×20–30), Скольжение по стене (1×10), Внешняя ротация плеча с петлёй (1×10–15/ст.).
  Кор: Мёртвый жук (1×5/ст.), Птица-Собака (1×8/ст.), Планка с попеременной опорой 20 сек.

D — ЦНС-ПРАЙМЕР / ФАЗО-СПЕЦИФИЧЕСКАЯ ПОДГОТОВКА (3–5 мин):
  Адаптируй к фазе и цели (см. ниже). Заканчивает разминку и «переключает» нервную систему.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
АДАПТАЦИЯ К ФАЗЕ ПОДГОТОВКИ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

СБОРЫ — ЭКСЦЕНТРИЧЕСКАЯ ФАЗА:
  D-блок: Медленный эксцентрический степ-даун (5 сек, 2×5/ст.) → Прыжок-Пого (2×8, легко) → Прыжок с поддержкой резиновой петлёй (1×5).
  Активация: добавь Подъём носка стоя (2×15) и Копенгагенское сжатие приводящих (1×10/ст.).

СБОРЫ — ИЗОМЕТРИЧЕСКАЯ ФАЗА:
  D-блок: Изометрический Спаниш-присед 45° (2×20–30 сек) → Прыжок на ящик (2×3, легко).
  Активация: Присед с хаотичным сопротивлением петли (1×5 позиций), Мёртвый жук с давлением на руку.

СБОРЫ — КОНЦЕНТРИЧЕСКАЯ ФАЗА:
  D-блок: Присед на носках (1×10) → Прыжок через препятствие (2×4, минимальный контакт с землёй) → Пистон у стены ×10 сек.
  Цель: нейронная скорость. Добавь Скип на одной ноге (2×5 yd/ст.) если есть пространство.

ЗВС СИЛОВОЙ ДЕНЬ (3+ дн. до игры):
  D-блок: Прыжок на ящик — праймер (2×3, низкий ящик 40 см) → Присед с сопротивлением петли (1×5 быстрых).

ЗВС МОЩНОСТНОЙ ДЕНЬ (1–2 дня до игры):
  D-блок: Прыжок-Пого лёгкий (1×8) → Баланс на одной ноге (20 сек/ст.) → Прыжок на ящик активационный (2×3).
  ⚠ НЕТ тяжёлой активации — только нейронный праймер, не накопление.

ЗВС ВОССТАНОВЛЕНИЕ (день после игры):
  Блок D отсутствует. A и B расширены (ткань 7 мин + мобильность 8 мин). Блок C облегчён.

ПЕП ПОДГОТОВИТЕЛЬНАЯ / PHASE 2 / PHASE 3:
  D-блок: Праймер механики спринта (Скип А 2×10 yd, Ножничный прыжок 1×10 yd) → Скакалка/Прыжок-Пого 30 сек → Пистон у стены (10 сек).

ВНЕ СБОРОВ (обычный период):
  D-блок: Прыжок-Пого (2×8) → Прыжок на ящик (2×3) → Прыжок с поддержкой резиновой петлёй (1×5). Или Прыжок с тумбы ×3 если свежие.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
АДАПТАЦИЯ К БИОМЕТРИКЕ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Recovery <40% / HRV низкий / DOMS 4-5 / sRPE вчера >8:
  → A-блок расширить до 7 мин (Band Joint Distraction обязательно)
  → B-блок добавить Pigeon Pose и 90/90 Hip Rotation
  → C-блок облегчить: убрать взрывные элементы из активации
  → D-блок: ТОЛЬКО лёгкий Pogo/SL Balance — без интенсивных прыжков

Recovery >75% / HRV норм / DOMS ≤2:
  → D-блок можно усилить: добавить Drop Jump или резиновую ленту к прыжку

Травма активная:
  → Исключи движения на повреждённую зону, добавь щадящую работу вокруг неё

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ПРАВИЛА
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Длительность каждого движения — в cue или через targetSets (например ["45сек"], ["10/ст.", "10/ст."])
• Разминка должна заканчиваться «горячей» — не «остывшей». Последнее движение D-блока должно разогревать.
• Пиши на русском, профессиональным тренерским языком. Названия упражнений — ТОЛЬКО на русском (оригинальное название в скобках, если нужно для ясности: «Прыжок-Пого», «Скольжение по стене», «Птица-Собака»).

Заполни структуру через инструмент build_warmup.`;

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'OPENAI_API_KEY не настроен' });

  const { playerId, date, dayGoal = '', days = 7, focus = 'inseason', notes = '' } = req.body || {};
  if (!playerId) return res.status(400).json({ error: 'playerId required' });

  const today = todayISO();
  const targetDate = date || today;

  const snapshot = await getPlayerSnapshot(String(playerId), Number(days) || 7, targetDate);
  if (!snapshot) return res.status(404).json({ error: 'Player not found' });

  const dataSummary = summarizeSnapshot(snapshot);

  const FOCUS_LABELS = {
    eccentric_camp: 'СБОРЫ — Эксцентрическая фаза',
    isometric_camp: 'СБОРЫ — Изометрическая фаза',
    concentric: 'СБОРЫ — Концентрическая фаза',
    zvs_strength_day: 'ЗВС Сезон — Силовой день (3+ дн. до игры)',
    zvs_power_day: 'ЗВС Сезон — Мощностной день (1-2 дня до игры)',
    zvs_recovery: 'ЗВС Сезон — Восстановление (день после игры)',
    zvs_struct: 'ЗВС Фаза 1 — Структурная подготовка',
    zvs_strength_base: 'ЗВС Фаза 2 — Силовая база',
    zvs_power_transfer: 'ЗВС Фаза 3 — Мощность и перенос',
    pep_prep: 'PEP Подготовительная фаза',
    pep_phase2: 'PEP Phase 2 — Силовая мощь + Спринт',
    pep_phase3: 'PEP Phase 3 — Скорость + COD + Мощь',
    inseason: 'Игровой период',
    preseason: 'Предсезонная подготовка',
    power: 'Развитие взрывной силы',
    strength: 'Максимальная силовая база',
    rehab: 'Восстановление / травма',
  };

  const focusLabel = FOCUS_LABELS[focus] || focus;

  const userPrompt = `${dataSummary}

Фаза подготовки: ${focusLabel}
Цель сессии после разминки: ${dayGoal || 'тренировка в тренажёрном зале по фазе'}
${notes ? `Комментарии тренера: ${notes}` : ''}

Составь разминку на ${targetDate} — 15–20 минут, 4 блока (A/B/C/D). Адаптируй к биометрике игрока и фазе подготовки.`;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_WARMUP_MODEL,
        instructions: SYSTEM_PROMPT,
        input: userPrompt,
        max_output_tokens: 2000,
        store: false,
        tools: [warmupToolForOpenAI(WARMUP_TOOL)],
        tool_choice: { type: 'function', name: 'build_warmup' },
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(502).json({ error: err.error?.message || `API error ${response.status}` });
    }

    const data = await response.json();
    const toolUse = findOpenAIFunctionCall(data.output, 'build_warmup');
    const warmup = parseFunctionArguments(toolUse?.arguments);
    if (!warmup) return res.status(502).json({ error: 'Модель не вернула структуру разминки' });

    return res.status(200).json({
      session: {
        blocks: warmup.blocks,
        assessment: warmup.assessment,
        periodization_note: warmup.duration_note,
        warnings: '',
      },
      player: snapshot.player,
      dataSummary,
      date: targetDate,
      dayGoal,
      sessionType: 'warmup',
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
