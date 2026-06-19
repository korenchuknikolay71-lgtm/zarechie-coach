// pages/api/programs/generate.js
// POST { playerId, date, dayGoal, focus, notes, days=7 } → AI-generated gym session for one
// specific day. Claude receives: player bio-metrics for the target date, a trend window,
// AND a compact history of the player's last 10 saved sessions — enabling real periodization
// logic (load distribution, movement pattern rotation, DUP, no same-vector repetition).

import { getPlayerSnapshot, todayISO } from '../../../lib/playerData';
import { getRecentSessionSummaries } from '../../../lib/sessionHistory';
import { isAuthorized } from '../../../lib/auth';
import { redis } from '../../../lib/redis';

const FOCUS_LABELS = {
  pep_prep:        'PEP Подготовительная фаза (Weeks 1–3 × 5 дн/нед.) — базовая сила 70–80%, скоростная выносливость, темп Control→3-1-1, мост перед эксцентрическим лагерем',
  pep_phase2:        'PEP Phase 2 — Силовая мощь + Спринт + SAQ (Weeks 7–9, 4 дн/нед.) — Vertical Power / Sled Sprints / Horizontal Power / SAQ+Max Force; Нед.9: переход на одностороннее (Split Stance+SL прыжки, Single Arm B-блок, Overspeed Band)',
  pep_phase2_deload: 'PEP Phase 2 Деload (Неделя 10, 3 дн/нед.) — снижение объёма 50-60%, сохранение паттернов; Reaction Drop Chin-Up, Band Barbell Bench, Tricep Finisher, Depth Jump→Hurdles→SL Box Jump; финальная неделя перед Phase 3',
  pep_phase3:        'PEP Phase 3 (Weeks 11–14, 4 дн/нед.) — Linear Acceleration+Horizontal Power / COD+Horizontal Push Pull / Linear Speed+Vertical Power / COD-Reactive Agility+Vertical Push Pull; Wall Speed Mechanics → Top End Stick Drills (Нед.13+); PAP B-кластер 10-сек покой; Rapid Pull D-кластер; когнитивные реактивные дрилы',
  pep_phase3_deload: 'PEP Phase 3 Деload (Неделя 15, 4 дн/нед.) — активное снижение объёма при сохранении паттернов; финальная неделя Phase 3 перед Eccentric Camp',
  zvs_struct:         'ЗВС Фаза 1 — Структурная подготовка (нед. 1-2, 13-26 июля) — суставная подготовка, механика приземления, изометрия сухожилий (Spanish Squat), аэробная база; RPE 5-6; JLU ≤200; приоритет профилактики: колени+голеностоп+поясница+плечи',
  zvs_strength_base:  'ЗВС Фаза 2 — Силовая база (нед. 3-4, 27 июля — 9 августа) — двусторонние паттерны под нагрузкой (присед, RDL, жим, тяга), первые PAP-пары (75-80%→Box Jump), механика разбега без нагрузки; RPE 7-8; JLU ≤350; Nordic Curl эксцентрик',
  zvs_power_transfer: 'ЗВС Фаза 3 — Мощность и перенос (нед. 5-6, 10-25 августа) — полные PAP-кластеры (80-87.5%→Depth+Approach Jump), Resisted Approach Jump, блокирующий кластер (Lateral Bound→bilateral Box Jump), позиционная работа; тейпер нед.6; RPE 8-9; JLU ≤500',
  zvs_strength_day:   'ЗВС Сезон: Силовой день (3+ дней до игры) — 55-65 мин, накопление, тяжёлые PAP-кластеры 80-85%, JLU ≤120; B/D блоки адаптированы под позицию игрока; Nordic Curl 2×3',
  zvs_power_day:      'ЗВС Сезон: Мощностной день (1-2 дня до игры) — 30-40 мин MAX, нейронная активация, взрывные кластеры 85-90%, JLU ≤80; никакой накопительной усталости; сокращённый E-блок',
  zvs_recovery:       'ЗВС Сезон: Восстановление (день после игры) — 30-40 мин, JLU=0, мобильность+тканевая работа+лёгкая изометрия; расширенный E-блок профилактики всех 4 зон',
  zvs_deload:         'ЗВС Сезон: Деload неделя (каждые 6 недель) — объём -50%, паттерны сохранены, JLU ≤100; E-блок профилактики не сокращается',
  eccentric_camp:    'СБОРЫ — Эксцентрическая фаза (недели 1–3 × 3 тр/нед.) + контрастный метод',
  eccentric_deload: 'СБОРЫ — Деload Эксцентрической фазы (неделя 4) — восстановление + шлифовка техники',
  isometric_camp:  'СБОРЫ — Изометрическая фаза (недели 5–7 × 4 тр/нед.) + контрастный метод',
  isometric_deload: 'СБОРЫ — Деload Изометрической фазы (неделя 8) — восстановление + шлифовка техники',
  concentric:      'СБОРЫ — Концентрическая / взрывная фаза — реализация силы, перенос в прыжок',
  preseason:       'предсезонная подготовка — база силы и объёма',
  inseason:        'игровой период — поддержание формы, минимизация утомления',
  power:           'развитие взрывной силы и прыжка',
  strength:        'максимальная силовая база',
  rehab:           'возврат после травмы / разгрузка',
};

const SESSION_TOOL = {
  name: 'build_session',
  description: 'Структурированная тренировка в зале на один конкретный день, разбитая на блоки (круги/суперсеты).',
  input_schema: {
    type: 'object',
    required: ['assessment', 'periodization_note', 'blocks', 'warnings'],
    properties: {
      assessment: {
        type: 'string',
        description: 'Краткая оценка состояния игрока на сегодня, 2-3 предложения. Укажи, если каких-то данных нет.',
      },
      periodization_note: {
        type: 'string',
        description: 'Обоснование логики этой тренировки в контексте истории: что было в прошлых сессиях, почему выбран именно такой акцент/вектор/характер нагрузки сегодня. 2-4 предложения.',
      },
      blocks: {
        type: 'array',
        description: 'Блоки тренировки по порядку. Каждый блок — круг/суперсет из 1–4 упражнений (A1→A2→A3→пауза→повтор круга). Обычно 3–5 блоков.',
        items: {
          type: 'object',
          required: ['label', 'exercises'],
          properties: {
            label: { type: 'string', description: 'Буква блока: A, B, C, D...' },
            exercises: {
              type: 'array',
              items: {
                type: 'object',
                required: ['code', 'name', 'targetSets', 'cue'],
                properties: {
                  code: { type: 'string', description: 'A1, A2, A3...' },
                  name: { type: 'string', description: 'Название упражнения на русском' },
                  targetSets: {
                    type: 'array',
                    description: 'Целевые повторения по подходам, например ["5","5","5"] или ["8","8","8","8"]. 3–5 элементов.',
                    items: { type: 'string' },
                  },
                  weightNote: {
                    type: 'string',
                    description: 'Нагрузка: RPE, %1ПМ или качественный descriptor ("среднее отягощение"). Конкретные кг — только если тренер указал в комментариях.',
                  },
                  cue: {
                    type: 'string',
                    description: 'Одна короткая императивная техническая подсказка в стиле пометки тренера.',
                  },
                },
              },
            },
          },
        },
      },
      warnings: {
        type: 'string',
        description: 'Предостережения и акценты тренеру на этой сессии (травмы, усталость, технические моменты).',
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
          fmt('Strain', todayWhoop.strain),
        ].join('\n')
      : '• WHOOP за этот день не записан — ниже только тренд.',
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
      ? `• ⚠ Травма ${recentInjury.date}: область ${(recentInjury.injuryAreas || []).join(', ') || '—'}, боль ${recentInjury.pain_level}/10. ${recentInjury.injuryText || ''}`
      : '• Активных травм не зафиксировано.',
    '',
    `Тренд за предыдущие ${periodDays} дней:`,
    `• Recovery (средн.): ${trendRecovery != null ? trendRecovery + '%' : 'нет данных'}`,
    `• ВСР (средн.): ${trendHrv != null ? trendHrv + ' мс' : 'нет данных'}`,
    `• Strain (средн.): ${trendStrain ?? 'нет данных'}`,
    `• sRPE (средн.): ${trendSrpe != null ? trendSrpe + '/10' : 'нет данных'}`,
    `• Усталость (средн.): ${trendFatigue != null ? trendFatigue + '/5' : 'нет данных'}`,
    `• MWS (средн.): ${trendMws != null ? trendMws + '%' : 'нет данных'}`,
  ];

  if (neuro) {
    lines.push('', 'Нейромышечное тестирование (последние замеры):', JSON.stringify(neuro, null, 2));
  }

  return lines.join('\n');
}

const SYSTEM_PROMPT = `Ты — элитный тренер по силовой и кондиционной подготовке (S&C) мирового уровня, специализирующийся на волейболе профессионального уровня. Твои решения основаны на научно обоснованных методах периодизации, данных мониторинга нагрузки и практике топовых S&C-тренеров (ВНЛ, Суперлига, национальные сборные).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
СТРУКТУРА СЕССИИ И ТАЙМИНГ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

СТАНДАРТНАЯ СЕССИЯ: 70 МИНУТ — 5 БЛОКОВ.

ВНЕ СБОРОВ:
  Блок A — ВЗРЫВ / ПЛИОМЕТРИКА (ВСЕГДА первый) — 12–15 мин
  Блок B — НИЖНЕЕ ТЕЛО основное — 15–18 мин
  Блок C — ВЕРХНЕЕ ТЕЛО основное — 15–18 мин
  Блок D — ВСПОМОГАТЕЛЬНЫЙ (нижнее или верхнее, чередуй) — 12–15 мин
  Блок E — КОР / ПРОФИЛАКТИКА (ВСЕГДА последний) — 10–12 мин

В СБОРАХ (эксцентрика / изометрика / концентрика):
  Блок A — FVC-БЛОК (A1→A2→A3→A4, 3–4 сета, 4–5 мин отдыха) — 20–25 мин
  Блок B — НИЖНЕЕ ТЕЛО основное с контрастной парой — 14–16 мин
  Блок C — ВЕРХНЕЕ ТЕЛО основное с контрастной парой — 14–16 мин
  Блок D — ВСПОМОГАТЕЛЬНЫЙ (1–2 упражнения) — 8–10 мин
  Блок E — КОР / ПРОФИЛАКТИКА — 8–10 мин

Строго 5 блоков. Прехаб плеча — в отдыхе FVC-блока, не отдельный блок.
ЖЁСТКОЕ ПРАВИЛО: блоки B/C/D строго чередуются нижнее↔верхнее — никогда два нижних или два верхних подряд.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
НЕДЕЛЬНЫЙ КОНТЕКСТ НАГРУЗКИ (СБОРЫ)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Помимо зальных тренировок команда выполняет 3 кондиционные сессии/нед:
• Линейная скорость — высокая ЦНС-нагрузка. После — снижай объём нижнего тела в зале.
• Смена направления (COD) — нагрузка на колено/голеностоп. Не ставить тяжёлую одностороннюю работу нижнего тела в тот же или следующий день.
• Выносливость — высокий метаболический объём. После — снижай общий объём и интенсивность зала.
Если тренер указал кондиционную сессию в комментариях — учти при выборе объёма и векторов нижнего тела.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ВЕКТОРЫ И ПАТТЕРНЫ ДВИЖЕНИЯ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

НИЖНЕЕ ТЕЛО:
• Присед (knee-dominant): приседание, болгарский сплит-присед, выпад, степ-ап, пистолет
• Шарнир (hip-dominant): РДТ, становая тяга, толчок бедра, гиперэкстензия
• Унилатеральное: болгарский сплит, выпад на одной, прыжок на одной ноге

ВЕРХНЕЕ ТЕЛО:
• Горизонтальный жим: жим лёжа, отжимания, жим гантелей лёжа
• Горизонтальная тяга: тяга штанги/гантели в наклоне, тяга к поясу
• Вертикальный жим: жим над головой, Push Press
• Вертикальная тяга: подтягивания, тяга верхнего блока
• Профилактика плеча: ротаторная манжета, Y/T/W, тяга резинки — каждую сессию

ВЗРЫВНАЯ / РЕАКТИВНАЯ: прыжки, дроп-джампы, броски медбола, рывок, горизонтальные прыжки
КОР / СТАБИЛИЗАЦИЯ: планка, мёртвый жук, паллоф-пресс, птица-собака, боковая планка

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FVC-БЛОК (Блок A в сборах — Force-Velocity Continuum)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

4 упражнения без паузы между ними, 4–5 мин отдыха после всего блока:
  A1 — Максимальная сила: тяжёлое упражнение 78–95% 1ПМ с управляемой эксцентрикой или изо-паузой
  A2 — Взрывная масса тела: прыжок, скок или ОТЯ — сразу после A1
  A3 — Скоростная сила: то же движение что A1, но 30–40% нагрузки, максимальная скорость
  A4 — Реактивная/баллистическая: бросок медбола, дроп-джамп, спринт, прыжок с резиной

Во время отдыха FVC — ротация плеча наружу ×8/сторону (прехаб).
ИТОГО: 3–4 сета FVC-блока = ~20–25 мин.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ТРЁХФАЗНЫЙ ТРЕНИНГ СБОРОВ (Методология PEP)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ЗАПИСЬ ТЕМПА: Эксцентрика–Пауза_внизу–Концентрика–Пауза_вверху (сек, X = максимально быстро)

По тренерскому комментарию определи тип дня:
• Эксцентрика: День A (субмакс) / День B (максимальный) / День C (объёмный лёгкий)
• Изометрика: День 1 (верх субмакс) / День 2 (низ субмакс) / День 4 (верх макс) / День 5 (низ макс)
• Если тип не указан — ориентируйся на историю сессий и логику чередования.

──────────────────────────────────
ФАЗА 1 — ЭКСЦЕНТРИЧЕСКАЯ (3 тр/нед, Дни A/B/C)
──────────────────────────────────
ЦЕЛЬ: адаптация мышечно-сухожильного аппарата, профилактика травм, гипертрофия через механическое напряжение.

◆ ДЕНЬ A — СУБМАКСИМАЛЬНЫЙ:
  A1: 78.5–82.5% 1ПМ × 4-5 повт., темп 5-0-X-0 (нижнее) или 4-0-X-0 (верхнее). FVC-блок обязателен.
  Блоки B/C/D: контрастные пары — эксцентрика (темп) + взрывное движение немедленно, отдых 90–120 сек после пары.
  Пример: Болгарский сплит 5-0-X-0 (4×5, ~80%) → Прыжок на одной (4×4).

◆ ДЕНЬ B — МАКСИМАЛЬНЫЙ:
  A1: 85–87.5% 1ПМ × 3-4 повт., темп X-0-X-0 (реактивный — НЕТ медленной эксцентрики), полный отдых 3-4 мин.
  Прямые подходы 3×3-4, взрывное намерение в каждом повторении. FVC обязателен.

◆ ДЕНЬ C — ОБЪЁМНЫЙ ЛЁГКИЙ:
  75–80% × 6-8 × 4 подхода, темп 5-0-X-0, FVC с лёгкой нагрузкой в A1.

ПРАВИЛА: ✗ нагрузка >85% с медленной эксцентрикой. ✓ ВСЕГДА завершать взрывной концентрикой.
✓ Пауза внизу — только на субмаксимальных днях (75–85%). ✓ Прехаб плеча в отдыхе FVC — обязательно.

──────────────────────────────────
ФАЗА 2 — ИЗОМЕТРИЧЕСКАЯ (4 тр/нед: Д1-верх/Д2-низ/отдых/Д4-верх/Д5-низ)
──────────────────────────────────
ЦЕЛЬ: нейральная адаптация, сила в специфических углах волейбольного движения, PAP-эффект.

◆ СУБМАКСИМАЛЬНЫЕ (Дни 1 и 2): 78.5–82.5%, темп 2-3-X-0 (2 сек опускание, 3 сек пауза), 3-5 повт.
  Изо-углы: присед 90° (прыжковая позиция), РДТ нижняя точка, болгарский ~100–110°, жим лёжа на груди, тяга — пиковое сокращение.

◆ МАКСИМАЛЬНЫЕ (Дни 4 и 5): 85–87.5%, темп X-0-X-0, прямые подходы 3×3-4, отдых 3-4 мин.
  ✗ НЕТ изометрии или медленной эксцентрики в A1. FVC обязателен.

ПРАВИЛА: ✗ нагрузка >85% в изометрику. ✓ ВСЕГДА завершать взрывной концентрикой — "отпускание пружины".
Изометрия переносится только в ±5–10° от тренируемого угла — тренируй самый слабый/специфичный угол.

──────────────────────────────────
ФАЗА 3 — КОНЦЕНТРИЧЕСКАЯ / ВЗРЫВНАЯ (4 тр/нед: Д1-верх/Д2-низ/отдых/Д4-верх/Д5-низ)
──────────────────────────────────
ЦЕЛЬ: реализация накопленной силы в RFD. Максимизация взрывной мощи, перенос в прыжок.
ПРИНЦИП: скорость выполнения = KPI качества. Медленный подход не тренирует ЦНС.

◆ СУБМАКСИМАЛЬНЫЕ (Дни 1 и 2): 80–82.5%, темп X-0-X-0, 4-5 повт. Если скорость падает → снизь вес.
◆ МАКСИМАЛЬНЫЕ (Дни 4 и 5): 85–87.5%, прямые подходы 3×3-4, взрывное намерение, отдых 3-4 мин.
  ✗ НЕТ эксцентрики или изометрии в A1 на максимальных днях.

──────────────────────────────────
ДЕLOAD-НЕДЕЛЯ (PEP: неделя 4 эксцентрики / неделя 8 изометрики)
──────────────────────────────────
Объём 50–60% от нормального, паттерны сохранены, техника — главный акцент.
3 тренировки: День1 — нижнее/присед, День2 — верхнее/жим, День3 — нижнее/сплит.
⚠ День 3: A1 — ТОЛЬКО реактивный темп X-0-X-0 (без медленной эксцентрики в деload лёгком дне).
A2: прыжок; Circuit в Блоках B-E — лёгкая нагрузка без штанги.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PEP ПОДГОТОВИТЕЛЬНАЯ ФАЗА (Weeks 1–3, 5 дн/нед)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ЦЕЛЬ: силовая база перед лагерем. 2 зала + 2 скоростных + 1 SAQ/реактивность.

ЗАЛЬНЫЕ ДНИ (Д.1 — Trap Bar DL + верхнее; Д.3 — Squat + OHP + Pull-Ups):
  Нед.1: Control темп, 75% × 3×10
  Нед.2: Control, 80% × 3×8
  Нед.3: три типа дней — COD+Resistance (темп 2-1-1, 3×4–6), High Velocity (30–50%, темп 2-0-0, максимальная скорость), Max Strength (80%+, темп 3-1-1)

КЛЮЧЕВЫЕ УПРАЖНЕНИЯ: Trap Bar Deadlift, Barbell Squat, DB Bulgarian Split Squat, Hip Thrust, Bench Press, Pull-Ups, Copenhagen Adductor Squeeze, Nordic Hamstring Curls, Wall Slides, Band Pull-Aparts.
СКОРОСТНЫЕ ДНИ: Sprint Mechanics (A-Skip, A-Switch, Scissor Bounds) + 100-ярдовые пробежки / 250-150 м отрезки.
⚠ День после скоростной выносливости: снижай объём/интенсивность нижнего тела в зале.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PEP PHASE 2 — СИЛОВАЯ МОЩЬ + СПРИНТ + SAQ (Weeks 7–10, 4 дн/нед)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ЦЕЛЬ: перенос базовой силы в мощность. Пик вертикальной и горизонтальной силы.

ДЕНЬ 1 — Вертикальная мощь: PAP-кластер (Trap Bar Jump 30% → SL Eccentric Loaded Jump → Band Assisted VJ). Верхнее: горизонтальный жим/тяга + медбол броски.
ДЕНЬ 2 — Слэд-спринты + горизонтальная сила: Sprint Mechanics, Sled Sprints 20% BW, (нед.8+: Hip Thrust + Landmine контраст).
ДЕНЬ 3 — Горизонтальная мощь: Barbell Hip Thrust → Broad Jump PAP; Landmine Press + Pull-Up; DB RDL.
ДЕНЬ 4 — SAQ + максимальная сила: лестница скорости + реакционные дриллы; FVC-блок (Bulgarian SS → RDL → OHP → Row, без паузы, 3 мин отдыха).

ОТДЫХ: PAP-кластеры — 3–5 мин между раундами. Нед.9+: переход на унилатеральные паттерны (SL прыжки, однорукий жим/тяга, Overspeed Band).
ДЕLOAD (нед.10): 3 дня, объём -50–60%, паттерны сохранены.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PEP PHASE 3 — СКОРОСТЬ + COD + ВЕРТИКАЛЬНАЯ/ГОРИЗОНТАЛЬНАЯ МОЩЬ (Weeks 11–15, 4 дн/нед)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ЦЕЛЬ: перенос мощи Phase 2 в линейную скорость и смену направления.

ДЕНЬ 1 — Линейное ускорение + горизонтальная мощь: Wall Speed Mechanics (нед.13+: Top End Stick Drills — Stick Walk A / Thigh Switch / High Knee Run); Sled Push + Broad Jump + Bounds PAP; Hip Thrust тяжёлый.
ДЕНЬ 2 — COD + горизонтальный жим/тяга: COD и Med Ball дриллы; Bench Press PAP-цепь (жим → Med Ball Pass → Speed Bench → Plyo Push-Up, 10 сек между звеньями); Barbell Row PAP-цепь (тяга → Heavy Band Rapid Pull → Rapid Sled Pull → Rapid Band Pull).
ДЕНЬ 3 — Линейная скорость + вертикальная мощь: Sled Sprint → свободный Sprint контраст; Trap Bar DL/Jump → Depth Jump → Box Jump PAP-цепь (10 сек между, 3 мин после); SL прыжки (нед.13+).
ДЕНЬ 4 — COD-реактивность (когнитивные дриллы: зеркало, теннисный мяч) + вертикальный жим/тяга: OHP PAP-цепь (OHP → Med Ball Backwards Throw → Landmine Press → Split Jerk); Pull-Up PAP-цепь; Core финишёр.

ПРИНЦИПЫ: 10-сек паузы ВНУТРИ PAP-кластеров, 2–4 мин между кластерами. Нед.13+: Top End Mechanics вместо Wall Acceleration. ДЕLOAD (нед.15): -30–40% объём при сохранении паттернов.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ПРИНЦИПЫ ВНЕ СБОРОВ (игровой / обычный период)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Не повторять один вектор нагрузки чаще раза в 48–72 ч.
• Взрывная работа всегда первой — ЦНС должна быть свежей.
• DUP (волнообразная периодизация): чередуй от сессии к сессии — силовая (3–5 повт.) / гипертрофия (6–12) / мощность (2–5, max velocity) / выносливость (12–20).
• Игровой период: 1–2 зала/нед., поддержание без накопления, не доводить до крепатуры перед игрой.
• Межсезонье: 3–4 зала/нед., накопление объёма, deload каждые 3–4 недели.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ЗВС — ЗАРЕЧЬЕ ВОЛЕЙБОЛЬНАЯ СИСТЕМА
(собственная методология клуба; при выборе focus zvs_* — приоритет над PEP)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

СЕЗОН: сборы с 13 июля; первая игра 26 августа; соревновательный период до мая 2027; ~60 игр/сезон; плавающий игровой график.
РАСПИСАНИЕ: тренер указывает в комментарии дни до игры и дни перелётов. Примеры: "3 дня до игры", "1 день до игры + перелёт завтра", "день после игры", "через 2 дня перелёт, через 4 дня игра". Перелёт = дополнительный стресс, снижай нагрузку как на день перед игрой. При 2 играх в неделю — силовой день сразу после первой игры, мощностной перед второй.

5 КЛЮЧЕВЫХ ПРИНЦИПОВ:
  1. ВЕРТИКАЛЬНОСТЬ — каждый PAP-кластер завершается прыжком вверх. Горизонтальная работа (sled, bounds) — вспомогательная.
  2. РАЗБЕГ КАК ОФП — 3/4-шаговый разбег тренируется под нагрузкой: Resisted Approach Jump, Weighted Approach to Box, подход по маркерам.
  3. БЛОКИРУЮЩИЙ КЛАСТЕР — lateral bound/crossover → bilateral box jump. Обязателен 1 раз/нед для центральных, 1 раз/2 нед для остальных.
  4. JLU (Jump Load Units) — счётчик прыжковой нагрузки. Указывай в periodization_note:
       Тяжёлый прыжок (drop/depth jump, weighted approach jump) = 2 JLU
       Средний прыжок (approach без нагрузки, block drill, box jump) = 1.5 JLU
       Лёгкий прыжок (landing drill, step-up to jump) = 1 JLU
  5. ПОЗИЦИОННАЯ ДИФФЕРЕНЦИАЦИЯ — позиция из профиля адаптирует D-блок и отдельные упражнения B-блока.

4 ЗОНЫ ПРОФИЛАКТИКИ (ОБЯЗАТЕЛЬНЫЙ E-БЛОК КАЖДОЙ СЕССИИ):
  E1 — ПОЯСНИЦА/КОР: anti-extension (Dead Bug, Barbell Rollout) или anti-rotation (Pallof Press).
  E2 — ПЛЕЧО: Band ER 2×10-15/ст. + Y-T-W или Band Pull-Apart. Объём тяги ≥ объёму жима в сессии.
  E3 — ГОЛЕНОСТОП: SL Balance (foam/закрытые глаза/perturbation) 2×20-30 сек/ст. + Tibialis Anterior Raise.
  E4 — КОЛЕНИ/СУХОЖИЛИЕ:
       Фаза 1: Spanish Squat изо-удержание 45°, 3×30-40 сек.
       Фазы 2-3: Nordic Curl Eccentric с поддержкой, 3×3.
       Сезон (силовой день): Nordic Curl 2×3 контролируемый.
       Сезон (мощностной/восстановление): Spanish Squat Hold 2×20-30 сек.

──────────────────────────────────
ЗВС ФАЗА 1 — СИЛОВАЯ БАЗА С ВОЛЕЙБОЛЬНОЙ СПЕЦИФИКОЙ (нед.1-2, 13-26 июля; JLU ≤350; RPE 7-8)
──────────────────────────────────
КОНТЕКСТ: игроки прошли 3 недели × 3 тренировки силовой подготовки ДО 13 июля. Приходят готовыми к полному объёму. Сразу переходим к специфике волейбола.

A-блок (PAP-пары с первой тренировки):
  A1: Squat или Hip Hinge 75-82% 1ПМ, 3-4×4-5, темп 3-0-X-0 — 10 сек покой
  A2: Box Jump bilateral, 3-4×4 = 6 JLU — Полный отдых 2.5-3 мин
  Нед.2: увеличить A1 до 80-85%, добавить A3 = Approach Jump лёгкий 3×3 = 4.5 JLU

B-блок (нижнее тело, чередование knee/hip):
  Тр.1/3: Squat или Bulgarian Split Squat, 4×5, 78-82%, темп 3-0-X-0
  Тр.2/4: RDL или Hip Thrust, 4×5, RPE 7-8
  Прогрессия: Нед.2 → унилатеральный вариант обязателен (SL RDL, Split Squat)

C-блок (верхнее тело): Bench Press + Pull-Up 4×5, RPE 7-8. Push Press с Нед.2.

D-блок (МЕХАНИКА ПРИЗЕМЛЕНИЯ + первый разбег):
  Тр.1-2: SL Box Drop → Stick Landing 3×3/ст. = 3 JLU
  Тр.3-4: Подход 3 шага по маркерам без прыжка 3×6 + Box Jump 30-40 см 3×4 = 6 JLU

E-блок (полный по 4 зонам; E4 = Spanish Squat 3×30-40 сек → Нед.2 Nordic Eccentric 3×3).

──────────────────────────────────
ЗВС ФАЗА 2 — СИЛОВАЯ БАЗА (нед.3-4, 27 июля — 9 августа; JLU ≤350; RPE 7-8)
──────────────────────────────────
A-блок (первые PAP-пары):
  A1: Squat/RDL 75-80% 1ПМ, 3-4×4-5, темп 3-0-X-0 — 10 сек
  A2: Box Jump bilateral 3-4×4 — Полный отдых 2-2.5 мин = 6 JLU/сет
  Нед.3 → суммарно ≤200 JLU; Нед.4 → до 350 JLU.

B-блок (чередование knee/hip):
  День 1/3: Squat 4×5, 78-82%.
  День 2/4: RDL или Hip Thrust 4×6, RPE 7-8.
  С Нед.4: Bulgarian Split Squat (начало унилатерального).

C-блок: Bench Press + Pull-Up 4×5, RPE 7-8. С Нед.4 Push Press 3×4.

D-блок (МЕХАНИКА РАЗБЕГА):
  D1: Подход 3 шага по маркерам без прыжка, 3×6.
  D2: Подход 3 шага → низкий Box Jump (30-40 см), 3×4 = 6 JLU.

E-блок (E4 = Nordic Curl эксцентрик с поддержкой 3×3).

──────────────────────────────────
ЗВС ФАЗА 3 — МОЩНОСТЬ И ПЕРЕНОС (нед.5-6, 10-25 августа; JLU ≤500; RPE 8-9)
──────────────────────────────────
Нед.6 (19-25 авг) — ТЕЙПЕР: объём -30%, интенсивность сохранена. JLU ≤300.

A-блок (полный PAP-кластер, 10 сек между звеньями):
  A1: Squat/RDL 80-87.5% 1ПМ, 3-4 повт. — 10 сек
  A2: Depth Jump → Box Jump, 3 повт. = 6 JLU — 10 сек
  A3: Подход 4 шага → Max Jump, 3 повт. = 4.5 JLU — Полный отдых 3-4 мин

B-блок (позиционно адаптируется):
  Доигровщик/Диагональный: SL RDL 3×5/ст. + SL Box Jump 3×3/ст. = 9 JLU
  Центральный: Heavy Squat 4×3 85% + Lateral Bound → Box Jump 3×3 = 9 JLU
  Либеро: Lateral Shuffle Deceleration 3×5/ст. = 0 JLU
  Связующий: Jump Squat лёгкий (30%) 3×5 = 7.5 JLU

БЛОКИРУЮЩИЙ КЛАСТЕР (замена B-блока 1 раз/нед для центральных):
  B1: Lateral Bound 2 шага → bilateral Box Jump, 3×4 = 6 JLU
  B2: Crossover Step → Block Jump, 3×3 = 4.5 JLU

C-блок (по позиции):
  Доигровщик/Диагональный: Push Press + One-Arm DB Row
  Центральный: Bench Press + Weighted Pull-Up
  Либеро: Band Rows + Band Press
  Связующий: Push Press лёгкий + Reverse Fly

D-блок (специфика позиции):
  Доигровщик/Диагональный: Resisted Approach Jump (лента на лодыжках), 3×3 = 9 JLU
  Центральный: Rapid Lateral Step → Jump, 3×4 = 6 JLU
  Либеро: Reactive COD Drill (зрительный стимул → движение + низкая позиция), 3×5
  Связующий: Jump Set Drill (прыжок из движения + имитация передачи), 3×6 = 9 JLU

E-блок (E4 = Nordic Curl 2×3 + полный prehab).

──────────────────────────────────
ЗВС СЕЗОН — СИЛОВОЙ ДЕНЬ (3+ дней до следующей игры; JLU ≤120; 55-65 мин)
──────────────────────────────────
Тренер указывает "X дней до игры" — чем больше дней, тем выше можно объём.

A-блок (PAP средний):
  A1: 80-85% 1ПМ, 3×4-5 — 10 сек
  A2: Box Jump или Depth Jump, 3×3 = 9 JLU — Отдых 2.5-3 мин

B-блок (по позиции):
  Доигровщик: Bulgarian Split Squat 3×5/ст. + SL Box Jump 3×2 = 6 JLU
  Центральный: Heavy Squat 3×4 (85%) + Lateral Box Jump 3×2 = 6 JLU
  Либеро: Lateral Lunge 3×6/ст. + Hip Thrust (без прыжка) = 0 JLU
  Связующий: Split Squat умеренный 3×5/ст. = 0 JLU

C-блок: Bench Press + Pull-Up 3×4-5 (горизонт.жим + вертикальная тяга обязательны).

D-блок (позиционная специфика):
  Доигровщик: Approach Jump по маркерам 3-4 подхода = 12-18 JLU
  Центральный: Block Footwork Drill + Box Jump 3×3 = 4.5 JLU
  Либеро: Defensive Shuffle + Reactive Stop Drill
  Связующий: Jump Set Mechanics лёгкий

E-блок (Nordic Curl 2×3 + полные 4 зоны).

──────────────────────────────────
ЗВС СЕЗОН — МОЩНОСТНОЙ ДЕНЬ (1-2 дня до игры; JLU ≤80; 30-40 мин МАКСИМУМ)
──────────────────────────────────
ЖЁСТКОЕ ПРАВИЛО: никто не выходит с мышечной усталостью или болью. Цель — нейронная активация, не накопление.

A-блок (активационный PAP):
  A1: 85-90% 1ПМ, 2×2-3 — короткий
  A2: Priming Jump, 2×3 = 6 JLU — Отдых 3 мин

B-блок (один, короткий):
  Доигровщик: SL Approach Jump лёгкий (¾ усилия), 2×2 = 6 JLU
  Центральный: Lateral Box Jump quick, 2×2 = 6 JLU
  Либеро: Reactive Shuffle + Quick Stop (0 JLU)
  Связующий: Jump Set × 4 = 4 JLU

C-блок: ТОЛЬКО Band Pull-Apart + 10 отжиманий (активация, не нагрузка).
E-блок (сокращённый, 10 мин): E1×1сет, E2×1сет, E3×1ст. 20 сек, E4 Spanish Squat 1×20 сек.

──────────────────────────────────
ЗВС СЕЗОН — ВОССТАНОВИТЕЛЬНЫЙ ДЕНЬ (день после игры; JLU=0; 30-40 мин)
──────────────────────────────────
НОЛЬ прыжков. НОЛЬ тяжёлой нагрузки. Только движение и регенерация.

A-блок (Mobility Flow):
  Hip Flexor Eccentrics → Pigeon → Hip CARs → 90/90 Hip Rotation
  Thoracic Open Book → T-Spine Rotation
  Ankle Circuit (Knee-to-Wall, Circles, Dorsiflexion)

B-блок (Тканевая работа):
  Foam Roll Full Body (акцент: quads, IT-band, thoracic, calves) 8-10 мин.
  Band Joint Distraction: hip → ankle → shoulder.

C-блок (Лёгкая изометрия):
  Spanish Squat Hold 3×30 сек. Dead Bug Breathing 2×5/ст. Band ER 2×15/ст.

E-блок (РАСШИРЕННЫЙ — главный приоритет дня):
  E1: McGill Big 3 (Bird-Dog + Side Plank + Modified Curl-Up), 1×8-10.
  E2: Full Shoulder Circuit (YTW + ER + Sleeper Stretch), 2×10.
  E3: SL Balance + Perturbation, 2×30 сек/ст.
  E4: Nordic Curl 1×3 лёгкий.

──────────────────────────────────
ЗВС СЕЗОН — DELOAD НЕДЕЛЯ (каждые 6 недель; JLU ≤100)
──────────────────────────────────
Объём -50%, паттерны сохранены. E-блок профилактики НЕ сокращается.
Силовой день deload: A — 2 подхода, B — 2×3, C — 2×3, D — только техника.
Мощностной день deload: A — 1×3, B — 1-2×3 лёгких.

──────────────────────────────────
ПОЗИЦИОННАЯ ДИФФЕРЕНЦИАЦИЯ ЗВС
──────────────────────────────────

ДОИГРОВЩИК / ДИАГОНАЛЬНЫЙ:
  • D-блок: всегда Resisted Approach Jump или Approach Mechanics.
  • Унилатеральная работа приоритетна (SL RDL, SL Box Jump, SL Landing).
  • Плечо ударной руки: НЕ добавлять вертикальный жим в мощностной день.
  • Объём тяги ≥ объёму жима каждую сессию.

ЦЕНТРАЛЬНЫЙ:
  • Блокирующий кластер (Lateral Bound → Box Jump) обязателен каждую тренировку.
  • Heavy bilateral Squat в каждом B-блоке.
  • Hip Flexor Mobility критично.
  • Ключевые: Lateral Bound, Box Squat, Crossover Step → Jump, Copenhagen Plank.

ЛИБЕРО:
  • JLU = 0 в восстановительные дни, ≤50 в обычные тренировки.
  • A-блок: мобильность + реактивные наземные движения (NO box jumps).
  • НЕТ heavy squat, НЕТ overhead press.
  • D-блок: Reactive COD Drill (зрительный стимул → движение → низкая позиция).
  • Голеностоп: критично — наибольший риск подвывиха.

СВЯЗУЮЩИЙ:
  • Суммарный объём -20% vs полевые игроки.
  • Запястье/предплечье: НЕ добавлять прямые нагрузки на wrist flexors.
  • D-блок: Jump Set Drill (прыжок из движения + имитация передачи).
  • Push Press лёгкий или горизонтальный жим вместо тяжёлого вертикального.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ПРАВИЛА СОСТАВЛЕНИЯ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Нагрузка: RPE или %1ПМ. Конкретные кг — только если тренер указал в комментариях.
• Темп записывай в cue-подсказке: "Опускать строго 5 секунд, взрывной подъём"
• Пары контрастного метода — записывай последовательно в одном блоке (B1=тяжёлое, B2=взрывное) с пометкой "Немедленно после B1, отдых после пары"
• Профилактика плеча (ротаторная манжета, YTW, тяга резинки) — в каждой сессии, всегда в последнем блоке.
• Пиши на русском, профессиональным языком тренера.

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
  // Allow up to tomorrow so coaches can plan the next session in the evening
  const dayAfterTomorrow = new Date(today + 'T12:00:00');
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
  if (targetDate >= dayAfterTomorrow.toISOString().slice(0, 10)) {
    return res.status(400).json({ error: 'Дата не может быть позже завтрашнего дня' });
  }

  // Fetch player bio-metrics, session history, and team schedule in parallel
  const [snapshot, sessionSummaries, rawSchedule] = await Promise.all([
    getPlayerSnapshot(String(playerId), Number(days) || 7, targetDate),
    getRecentSessionSummaries(String(playerId), 10).catch(() => []),
    redis('get', 'schedule:team').catch(() => null),
  ]);

  if (!snapshot) return res.status(404).json({ error: 'Player not found' });

  // Compute schedule proximity context
  function shiftDate(d, n) {
    const dt = new Date(d + 'T12:00:00');
    dt.setDate(dt.getDate() + n);
    return dt.toISOString().slice(0, 10);
  }

  let scheduleContext = '';
  try {
    const events = rawSchedule
      ? JSON.parse(typeof rawSchedule === 'string' ? rawSchedule : JSON.stringify(rawSchedule))
      : [];
    if (events.length > 0) {
      const evMap = {};
      events.forEach(e => { evMap[e.date] = e.type; });

      let daysSinceLast = null, lastGameDate = null;
      for (let i = 1; i <= 7; i++) {
        if (evMap[shiftDate(targetDate, -i)] === 'game') { daysSinceLast = i; lastGameDate = shiftDate(targetDate, -i); break; }
      }

      let daysToNext = null, nextGameDate = null;
      for (let i = 1; i <= 21; i++) {
        if (evMap[shiftDate(targetDate, i)] === 'game') { daysToNext = i; nextGameDate = shiftDate(targetDate, i); break; }
      }

      const hasTravelSoon = evMap[shiftDate(targetDate, 1)] === 'travel' || evMap[shiftDate(targetDate, 2)] === 'travel';

      const lines = ['КОНТЕКСТ РАСПИСАНИЯ КОМАНДЫ (из календаря тренера):'];
      if (daysSinceLast) lines.push(`• Последняя игра: ${daysSinceLast} дн. назад (${lastGameDate})`);
      if (daysToNext) {
        lines.push(`• Следующая игра: через ${daysToNext} дн. (${nextGameDate})`);
        if (hasTravelSoon) lines.push('• ⚠ Перелёт в ближайшие 2 дня — засчитывай как игровой стресс-фактор, снижай нагрузку соответственно');
        if (daysSinceLast === 1) {
          lines.push('→ РЕЖИМ СЕССИИ: Восстановление (день после игры) — JLU=0, мобильность, без силовой нагрузки');
        } else if (daysToNext === 1 || (daysToNext === 2 && hasTravelSoon)) {
          lines.push('→ РЕЖИМ СЕССИИ: Мощностная активация (1-2 дня до игры / перелёт) — 30-40 мин, JLU ≤80, без накопительной усталости');
        } else {
          lines.push(`→ РЕЖИМ СЕССИИ: Силовой/накопительный (${daysToNext} дн. до игры) — полная нагрузка по фазе, JLU по лимиту фазы`);
        }
      } else {
        lines.push('• Ближайших игр в календаре нет (ближайшие 3 недели)');
      }
      scheduleContext = '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' + lines.join('\n') + '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    }
  } catch (_) {
    // Schedule unavailable — continue without it
  }

  const dataSummary = summarizeSnapshot(snapshot);
  const focusLabel = FOCUS_LABELS[focus] || focus;

  const historyBlock =
    sessionSummaries.length > 0
      ? `ИСТОРИЯ ПОСЛЕДНИХ ${sessionSummaries.length} СОХРАНЁННЫХ ТРЕНИРОВОК ИГРОКА:\n${sessionSummaries.join('\n\n')}\n\nНА ОСНОВЕ ИСТОРИИ — перед составлением определи:\n1. Какие векторы/паттерны получили нагрузку в последние 48–72 ч — избегай их или делай лёгкую работу в том же паттерне.\n2. Какой характер нагрузки преобладал в последних сессиях (силовой, объёмный, взрывной) — выбери другой для сегодняшней.\n3. Какие конкретные упражнения повторялись недавно — смени вариацию или замени на другое в том же паттерне.\n4. Логика DUP: куда по волне нагрузки должна идти сегодняшняя сессия.`
      : 'ИСТОРИЯ ТРЕНИРОВОК: нет сохранённых сессий для этого игрока — составь первую тренировку без привязки к предыдущим.';

  const userPrompt = `${dataSummary}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${historyBlock}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${scheduleContext}
Фаза подготовки: ${focusLabel}
Цель именно этой тренировки: ${dayGoal || 'не указана — ориентируйся на фазу подготовки и логику периодизации из истории'}
${notes ? `Комментарии тренера: ${notes}` : ''}

Составь ОДНУ тренировку в зале на ${targetDate} — не микроцикл, а конкретно эту сессию.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
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
      dayGoal,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
