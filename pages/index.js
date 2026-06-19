import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import {
  AlertTriangle,
  CalendarDays,
  Target,
  Layers,
  TrendingUp,
  MessageSquare,
  Loader2,
  ChevronDown,
  Check,
  Dumbbell,
  Orbit,
  Printer,
  Save,
  History,
  Zap,
  BarChart2,
  Calendar,
  Link2,
} from 'lucide-react';

const ONE_RM_FIELDS = [
  { key: 'squat',    label: 'Присед',        unit: 'кг' },
  { key: 'rdl',      label: 'RDL',           unit: 'кг' },
  { key: 'deadlift', label: 'Становая',      unit: 'кг' },
  { key: 'bench',    label: 'Жим лёжа',      unit: 'кг' },
  { key: 'ohp',      label: 'Жим стоя',      unit: 'кг' },
  { key: 'pullup',   label: 'Подтяг. (+кг)', unit: 'кг' },
];

function addDaysToDate(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function getWeekFocuses(focus) {
  if (focus.startsWith('zvs_') || focus === 'inseason') {
    return [
      { focus: 'zvs_strength_day', label: 'Силовой день' },
      { focus: 'zvs_power_day',    label: 'Мощностной день' },
      { focus: 'zvs_recovery',     label: 'Восстановление' },
    ];
  }
  if (focus.includes('eccentric') || focus.includes('isometric') || focus === 'concentric') {
    return [
      { focus, label: 'Тренировка 1' },
      { focus, label: 'Тренировка 2' },
      { focus: 'zvs_recovery', label: 'Восстановление' },
    ];
  }
  if (focus.startsWith('pep_')) {
    return [
      { focus, label: 'День A' },
      { focus, label: 'День B' },
      { focus: 'zvs_recovery', label: 'Восстановление' },
    ];
  }
  return [
    { focus: 'strength',      label: 'Силовой' },
    { focus: 'power',         label: 'Мощностной' },
    { focus: 'zvs_recovery',  label: 'Восстановление' },
  ];
}

function summarizeWarmupForGym(warmupSession) {
  if (!warmupSession?.blocks) return '';
  return warmupSession.blocks.map(block => {
    const exList = (block.exercises || []).map(ex => `${ex.name} (${(ex.targetSets || []).join('/')})`).join(', ');
    return `${block.label}: ${exList}`;
  }).join('\n');
}

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function positionDot(pos) {
  const p = (pos || '').toLowerCase();
  if (p.includes('диагон')) return 'bg-violet-400';
  if (p.includes('доигр')) return 'bg-cyan-400';
  if (p.includes('центр') || p.includes('middle')) return 'bg-amber-400';
  if (p.includes('связ') || p.includes('setter')) return 'bg-emerald-400';
  if (p.includes('либеро')) return 'bg-rose-400';
  return 'bg-slate-500';
}

const PERIODS = [
  { value: 'inseason',  label: 'Сезон' },
  { value: 'camp',      label: 'Сборы' },
  { value: 'offseason', label: 'Межсезонье' },
  { value: 'rehab',     label: 'Реабилитация' },
];

const PERIOD_COLORS = {
  inseason:  { tab: 'border-cyan-400/40 bg-cyan-400/[0.09] text-cyan-300',   card: 'border-cyan-400/30 bg-cyan-400/[0.06]',   text: 'text-cyan-300',   dot: 'bg-cyan-400',   glow: 'shadow-[0_0_12px_rgba(34,211,238,0.15)]' },
  camp:      { tab: 'border-amber-400/40 bg-amber-400/[0.09] text-amber-300', card: 'border-amber-400/30 bg-amber-400/[0.06]', text: 'text-amber-300', dot: 'bg-amber-400',   glow: 'shadow-[0_0_12px_rgba(251,191,36,0.15)]' },
  offseason: { tab: 'border-emerald-400/40 bg-emerald-400/[0.09] text-emerald-300', card: 'border-emerald-400/30 bg-emerald-400/[0.06]', text: 'text-emerald-300', dot: 'bg-emerald-400', glow: 'shadow-[0_0_12px_rgba(52,211,153,0.15)]' },
  rehab:     { tab: 'border-violet-400/40 bg-violet-400/[0.09] text-violet-300',  card: 'border-violet-400/30 bg-violet-400/[0.06]',  text: 'text-violet-300',  dot: 'bg-violet-400',  glow: 'shadow-[0_0_12px_rgba(167,139,250,0.15)]' },
};

const PHASES_BY_PERIOD = {
  inseason: [
    { value: 'zvs_strength_day',   label: 'Силовой день',        sub: '3+ дня до игры' },
    { value: 'zvs_power_day',      label: 'Мощностной день',     sub: '1–2 дня до игры' },
    { value: 'zvs_recovery',       label: 'Восстановление',      sub: 'После игры' },
    { value: 'zvs_deload',         label: 'Разгрузочная неделя', sub: 'Каждые 6 недель' },
  ],
  camp: [
    { value: 'eccentric_camp', label: 'Эксцентрическая фаза', sub: 'Недели 1–4' },
    { value: 'isometric_camp', label: 'Изометрическая фаза',  sub: 'Недели 5–8' },
    { value: 'concentric',     label: 'Концентрическая',       sub: 'Скорость / Недели 9–12' },
  ],
  offseason: [
    { value: 'zvs_struct',         label: 'Структурная подготовка', sub: 'ЗВС Фаза 1' },
    { value: 'zvs_strength_base',  label: 'Силовая база',           sub: 'ЗВС Фаза 2' },
    { value: 'zvs_power_transfer', label: 'Мощность и перенос',     sub: 'ЗВС Фаза 3' },
  ],
  rehab: [
    { value: 'rehab', label: 'Реабилитация / Травма', sub: null },
  ],
};

function getPeriodForFocus(focusValue) {
  for (const [p, phases] of Object.entries(PHASES_BY_PERIOD)) {
    if (phases.some(ph => ph.value === focusValue)) return p;
  }
  return 'inseason';
}

function getFocusLabel(period, focusValue) {
  return PHASES_BY_PERIOD[period]?.find(ph => ph.value === focusValue)?.label || focusValue;
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function addDaysToStr(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function getCalendarGrid(weeks = 4) {
  const today = new Date();
  const dow = today.getDay();
  const start = new Date(today);
  start.setDate(today.getDate() + (dow === 0 ? -6 : 1 - dow));
  const startStr = start.toISOString().slice(0, 10);
  const days = [];
  for (let i = 0; i < weeks * 7; i++) days.push(addDaysToStr(startStr, i));
  return days;
}

function computeSuggestion(date, events) {
  if (!date || !events.length) return null;
  const evMap = {};
  events.forEach(e => { evMap[e.date] = e.type; });

  let daysSinceLast = null;
  for (let i = 1; i <= 7; i++) {
    if (evMap[addDaysToStr(date, -i)] === 'game') { daysSinceLast = i; break; }
  }

  let daysToNext = null;
  for (let i = 1; i <= 21; i++) {
    if (evMap[addDaysToStr(date, i)] === 'game') { daysToNext = i; break; }
  }

  const hasTravelSoon =
    evMap[addDaysToStr(date, 1)] === 'travel' || evMap[addDaysToStr(date, 2)] === 'travel';

  if (daysSinceLast === 1) return { focus: 'zvs_recovery', reason: 'День после игры' };
  if (daysToNext === 1) return { focus: 'zvs_power_day', reason: 'Завтра игра' };
  if (daysToNext === 2 && hasTravelSoon) return { focus: 'zvs_power_day', reason: 'Через 2 дня игра + завтра перелёт' };
  if (daysToNext != null && daysToNext >= 2) {
    const w = daysToNext === 2 ? 'дня' : 'дней';
    return { focus: 'zvs_strength_day', reason: `${daysToNext} ${w} до следующей игры` };
  }
  return null;
}

const DAYS_RU = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];

function ScheduleCalendar({ events, onToggle, trainingDate }) {
  const calDays = useMemo(() => getCalendarGrid(4), []);
  const evMap = useMemo(() => {
    const m = {};
    events.forEach(e => { m[e.date] = e.type; });
    return m;
  }, [events]);

  const today = todayISO();

  return (
    <div>
      <div className="grid grid-cols-7 mb-1.5">
        {DAYS_RU.map(d => (
          <div key={d} className="text-center text-[9px] font-bold uppercase tracking-widest text-slate-700 py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-[3px]">
        {calDays.map(day => {
          const type = evMap[day];
          const isToday = day === today;
          const isTraining = day === trainingDate;
          const isPast = day < today;
          const dayNum = parseInt(day.slice(8), 10);
          const monthChanged = day.slice(5, 7) !== calDays[Math.max(0, calDays.indexOf(day) - 1)]?.slice(5, 7);
          return (
            <button
              key={day}
              type="button"
              onClick={() => onToggle(day)}
              title={type === 'game' ? 'Игра — клик чтобы сменить на перелёт' : type === 'travel' ? 'Перелёт — клик чтобы сбросить' : 'Клик: отметить как игру'}
              className={[
                'relative rounded-lg py-1.5 text-center text-[11px] font-medium transition-all duration-150',
                type === 'game'
                  ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40 hover:bg-rose-500/35'
                  : type === 'travel'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/35 hover:bg-amber-500/30'
                  : isPast
                  ? 'text-slate-700 border border-transparent hover:border-white/[0.08] hover:text-slate-500'
                  : 'text-slate-400 border border-white/[0.05] hover:border-white/[0.14] hover:text-slate-200 hover:bg-white/[0.04]',
                isToday ? 'ring-1 ring-accent/60' : '',
                isTraining ? 'ring-2 ring-accent shadow-[0_0_8px_rgba(34,211,238,0.35)]' : '',
              ].filter(Boolean).join(' ')}
            >
              <span className="block leading-none">{dayNum}</span>
              {type === 'game' && <span className="block text-[8px] mt-0.5 leading-none">🏐</span>}
              {type === 'travel' && <span className="block text-[8px] mt-0.5 leading-none">✈</span>}
              {monthChanged && !type && (
                <span className="absolute -top-0.5 -right-0.5 block h-1 w-1 rounded-full bg-slate-700" />
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-600">
        <span>1 клик → <span className="text-rose-400 font-medium">🏐 игра</span></span>
        <span>2 клика → <span className="text-amber-400 font-medium">✈ перелёт</span></span>
        <span>3 клика → сброс</span>
        <span className="text-accent/50">Рамка = дата тренировки</span>
      </div>
    </div>
  );
}

function SectionLabel({ icon, text }) {
  return (
    <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
      <span className="text-accent/70">{icon}</span>
      {text}
    </div>
  );
}

const inputBase =
  'block w-full rounded-xl border border-white/[0.10] bg-white/[0.055] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-all duration-200 hover:border-white/[0.15] focus:border-accent/50 focus:bg-white/[0.08] focus:ring-2 focus:ring-accent/15';

const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-accent/40';

function Listbox({ value, onChange, options, placeholder = '— выбрать —' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onOut(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onEsc(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onOut);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onOut);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`${inputBase} ${focusRing} flex items-center justify-between gap-2 text-left ${
          open ? 'border-accent/50 bg-white/[0.06] ring-2 ring-accent/15' : ''
        }`}
      >
        <span className={`truncate ${selected ? 'text-slate-100' : 'text-slate-600'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-slate-600 transition-transform duration-200 ${open ? 'rotate-180 text-accent' : ''}`}
        />
      </button>

      {open && (
        <ul className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-white/[0.08] bg-[#0c1118] p-1 shadow-[0_12px_40px_rgba(0,0,0,0.7)] backdrop-blur-2xl animate-fade-in">
          {options.map(o => (
            <li key={o.value}>
              <button
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                  o.value === value
                    ? 'bg-accent/10 text-accent'
                    : 'text-slate-300 hover:bg-white/[0.05] hover:text-slate-100'
                }`}
              >
                <span className="truncate">{o.label}</span>
                {o.value === value && <Check size={13} className="shrink-0" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ExerciseCard({
  apiKey,
  code,
  name,
  targetSets,
  weightNote,
  tempo,
  autoReg,
  cue,
  onChangeName,
  onChangeSet,
  onAddSet,
  onChangeWeight,
  onChangeTempo,
  onChangeAutoReg,
  onChangeCue,
}) {
  const [image, setImage] = useState(null);
  const [imageError, setImageError] = useState('');
  const [imageLoading, setImageLoading] = useState(false);

  useEffect(() => {
    if (!name?.trim() || !apiKey) return;
    let cancelled = false;
    setImageLoading(true);
    setImageError('');
    fetch('/api/exercises/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ name }),
    })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || 'Ошибка');
        if (!cancelled) setImage(data.image);
      })
      .catch(err => {
        if (!cancelled) setImageError(err.message);
      })
      .finally(() => {
        if (!cancelled) setImageLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, apiKey]);

  return (
    <div className="group overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] backdrop-blur-sm transition-all duration-300 hover:border-white/[0.12] hover:bg-white/[0.04] hover:shadow-[0_4px_24px_rgba(0,0,0,0.4)] print:break-inside-avoid print:border-slate-300 print:bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 bg-gradient-to-r from-accent/[0.12] to-transparent px-3.5 py-2.5 print:bg-slate-100">
        <span className="shrink-0 rounded-md bg-accent/20 px-1.5 py-0.5 text-[10px] font-black tracking-wide text-accent print:bg-slate-200 print:text-slate-700">
          {code}
        </span>
        {tempo && (
          <span className="shrink-0 rounded-md border border-blue-500/20 bg-blue-500/[0.08] px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-blue-400 print:border-slate-200 print:text-slate-600">
            {tempo}
          </span>
        )}
        <input
          value={name}
          onChange={e => onChangeName(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-right text-[13px] font-semibold text-slate-100 outline-none placeholder:text-slate-500 print:text-slate-900"
        />
      </div>

      {/* Image */}
      <div className="flex aspect-[4/3] items-center justify-center bg-white">
        {imageLoading && (
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={18} className="animate-spin text-slate-400" />
            <span className="text-[10px] text-slate-400">Рисуем...</span>
          </div>
        )}
        {!imageLoading && image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={name} className="h-full w-full object-contain" />
        )}
        {!imageLoading && !image && (
          <span className="px-4 text-center text-[11px] text-slate-400">{imageError || '—'}</span>
        )}
      </div>

      {/* Sets & notes */}
      <div className="space-y-2 p-3">
        <div className="flex flex-wrap gap-1.5">
          {targetSets.map((s, i) => (
            <div
              key={i}
              className="flex items-center overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.04] print:border-slate-300"
            >
              <span className="px-1.5 py-1 text-[9px] font-semibold text-slate-600">{i + 1}</span>
              <input
                value={s}
                onChange={e => onChangeSet(i, e.target.value)}
                placeholder="—"
                className="w-10 bg-transparent px-1 py-1 text-center text-xs font-medium text-slate-200 outline-none print:text-slate-900"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={onAddSet}
            className="rounded-lg border border-dashed border-white/[0.08] px-2 text-xs text-slate-600 transition hover:border-accent/40 hover:text-accent print:hidden"
          >
            +
          </button>
        </div>

        <input
          value={weightNote}
          onChange={e => onChangeWeight(e.target.value)}
          placeholder="Вес / интенсивность"
          className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-300 outline-none transition focus:border-accent/40 focus:bg-white/[0.05] placeholder:text-slate-600 print:border-slate-300 print:text-slate-900"
        />

        {autoReg && (
          <div className="flex items-start gap-1.5 rounded-lg border border-amber-500/15 bg-amber-500/[0.06] px-2.5 py-1.5 print:border-amber-300 print:bg-amber-50">
            <span className="mt-px text-[10px] text-amber-400/80">⚡</span>
            <input
              value={autoReg}
              onChange={e => onChangeAutoReg(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-[11px] leading-snug text-amber-300/80 outline-none placeholder:text-amber-600/50 print:text-amber-800"
            />
          </div>
        )}

        <textarea
          value={cue}
          onChange={e => onChangeCue(e.target.value)}
          rows={2}
          placeholder="Техническая подсказка"
          className="w-full resize-none rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 text-xs leading-snug text-slate-400 outline-none transition focus:border-accent/40 focus:bg-white/[0.05] placeholder:text-slate-600 print:border-slate-300 print:text-slate-700"
        />
      </div>
    </div>
  );
}

export default function Home() {
  const [apiKey, setApiKey] = useState('');
  const [keyPanelOpen, setKeyPanelOpen] = useState(true);
  const [players, setPlayers] = useState([]);
  const [playersError, setPlayersError] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [dayGoal, setDayGoal] = useState('');
  const [days, setDays] = useState(7);
  const [period, setPeriod] = useState('inseason');
  const [focus, setFocus] = useState('zvs_strength_day');
  const [notes, setNotes] = useState('');
  const [sessionType, setSessionType] = useState('gym'); // 'gym' | 'warmup'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSummary, setShowSummary] = useState(false);

  const [scheduleEvents, setScheduleEvents] = useState([]);
  const [showSchedule, setShowSchedule] = useState(false);
  const [exerciseImages, setExerciseImages] = useState({});
  const [imagesLoadedCount, setImagesLoadedCount] = useState(0);

  const [session, setSession] = useState(null);
  const [meta, setMeta] = useState(null);
  const [pendingSaved, setPendingSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // Sidebar navigation
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [mobileView, setMobileView] = useState('players'); // 'players' | 'workspace'

  // Share link
  const [linkCopied, setLinkCopied] = useState(false);

  // 1RM database
  const [oneRM, setOneRM] = useState({});
  const [oneRMPanelOpen, setOneRMPanelOpen] = useState(false);
  const [oneRMSaveTimer, setOneRMSaveTimer] = useState(null);

  // Warmup → Gym integration
  const [todayWarmup, setTodayWarmup] = useState(null);

  // Weekly plan
  const [weekPlan, setWeekPlan] = useState(null);
  const [weekPlanLoading, setWeekPlanLoading] = useState(false);
  const [weekPlanOpen, setWeekPlanOpen] = useState([0]);

  // Volume stats
  const [volumeStats, setVolumeStats] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem('coachApiKey');
    if (saved) {
      setApiKey(saved);
      setKeyPanelOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!apiKey) return;
    fetch('/api/schedule', { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data.events)) setScheduleEvents(data.events); })
      .catch(() => {});
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey) return;
    localStorage.setItem('coachApiKey', apiKey);
    setPlayersError('');
    fetch('/api/players/list', { headers: { 'x-api-key': apiKey } })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `Ошибка (${r.status})`);
        setPlayers(data.players || []);
      })
      .catch(err => {
        setPlayers([]);
        setPlayersError(err.message);
      });
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey || !playerId || !date) {
      setPendingSaved(null);
      return;
    }
    let cancelled = false;
    fetch(
      `/api/programs/get?playerId=${encodeURIComponent(playerId)}&date=${encodeURIComponent(date)}`,
      { headers: { 'x-api-key': apiKey } }
    )
      .then(r => r.json())
      .then(data => {
        if (!cancelled) setPendingSaved(data.record || null);
      })
      .catch(() => {
        if (!cancelled) setPendingSaved(null);
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey, playerId, date]);

  // Fetch 1RM data when player changes
  useEffect(() => {
    if (!apiKey || !playerId) { setOneRM({}); return; }
    fetch(`/api/players/1rm?playerId=${encodeURIComponent(playerId)}`, { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(data => setOneRM(data.values || {}))
      .catch(() => setOneRM({}));
  }, [apiKey, playerId]);

  // Fetch weekly volume when player changes
  useEffect(() => {
    if (!apiKey || !playerId) { setVolumeStats(null); return; }
    fetch(`/api/players/volume?playerId=${encodeURIComponent(playerId)}&days=7`, { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(data => setVolumeStats(data))
      .catch(() => setVolumeStats(null));
  }, [apiKey, playerId]);

  const keyConnected = apiKey && !playersError;
  const playerOptions = players.map(p => ({
    value: p.id,
    label: `${p.name}${p.position ? ` (${p.position})` : ''}`,
  }));

  function handleOneRMChange(field, value) {
    const updated = { ...oneRM };
    const num = parseFloat(value);
    if (!Number.isNaN(num) && num > 0) updated[field] = num;
    else delete updated[field];
    setOneRM(updated);
    if (oneRMSaveTimer) clearTimeout(oneRMSaveTimer);
    const t = setTimeout(() => {
      fetch('/api/players/1rm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ playerId, values: updated }),
      }).catch(() => {});
    }, 800);
    setOneRMSaveTimer(t);
  }

  function selectPlayer(p) {
    setSelectedPlayer(p);
    setPlayerId(p.id);
    setSession(null);
    setMeta(null);
    setWeekPlan(null);
    setError('');
    setJustSaved(false);
    setTodayWarmup(null);
    setLinkCopied(false);
    setMobileView('workspace');
  }

  async function handleGenerate(e) {
    e.preventDefault();
    if (!playerId) return;
    setLoading(true);
    setError('');
    setSession(null);
    setMeta(null);
    setWeekPlan(null);
    setJustSaved(false);
    try {
      const endpoint = sessionType === 'warmup'
        ? '/api/programs/generate-warmup'
        : '/api/programs/generate';
      const warmupSummary = sessionType === 'gym' && todayWarmup ? summarizeWarmupForGym(todayWarmup) : '';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ playerId, date, dayGoal, days, focus, notes, warmupSummary }),
      });
      let data;
      try { data = await res.json(); } catch (_) {
        throw new Error(res.status === 504
          ? 'Claude думает слишком долго — попробуйте ещё раз через 30 секунд'
          : 'Ошибка соединения — попробуйте ещё раз');
      }
      if (!res.ok) throw new Error(data.error || 'Ошибка генерации');
      setSession(data.session);
      const fl = getFocusLabel(period, focus);
      setMeta({ player: data.player, dataSummary: data.dataSummary, date: data.date, dayGoal: data.dayGoal || '', focusLabel: fl, sessionType });
      if (sessionType === 'warmup') setTodayWarmup(data.session);
      setShowSummary(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateWeek() {
    if (!playerId) return;
    setWeekPlanLoading(true);
    setWeekPlan(null);
    setSession(null);
    setMeta(null);
    setError('');
    const focusList = getWeekFocuses(focus);
    const dates = [date, addDaysToDate(date, 2), addDaysToDate(date, 4)];
    try {
      const warmupSummary = todayWarmup ? summarizeWarmupForGym(todayWarmup) : '';
      const results = await Promise.all(
        focusList.map((f, i) =>
          fetch('/api/programs/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
            body: JSON.stringify({ playerId, date: dates[i], dayGoal, days, focus: f.focus, notes, warmupSummary: i === 0 ? warmupSummary : '' }),
          }).then(r => r.json()).then(data => ({ ...data, planLabel: f.label, planDate: dates[i] }))
        )
      );
      const planItems = results.map((data, i) => ({
        session: data.session,
        player: data.player,
        date: dates[i],
        focus: focusList[i].focus,
        label: focusList[i].label,
        saving: false,
        saved: false,
      }));
      setWeekPlan(planItems);
      setWeekPlanOpen([0]);
    } catch (err) {
      setError('Ошибка генерации плана: ' + err.message);
    } finally {
      setWeekPlanLoading(false);
    }
  }

  async function handleSaveWeekSession(idx) {
    if (!weekPlan?.[idx]?.session) return;
    const item = weekPlan[idx];
    setWeekPlan(prev => prev.map((p, i) => i === idx ? { ...p, saving: true } : p));
    try {
      const res = await fetch('/api/programs/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ playerId, date: item.date, session: item.session, player: item.player, dataSummary: '', dayGoal: item.label }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setWeekPlan(prev => prev.map((p, i) => i === idx ? { ...p, saving: false, saved: true } : p));
      // Refresh volume stats
      fetch(`/api/players/volume?playerId=${encodeURIComponent(playerId)}&days=7`, { headers: { 'x-api-key': apiKey } })
        .then(r => r.json()).then(setVolumeStats).catch(() => {});
    } catch (err) {
      setWeekPlan(prev => prev.map((p, i) => i === idx ? { ...p, saving: false } : p));
      setError(err.message);
    }
  }

  function loadSavedRecord() {
    if (!pendingSaved) return;
    setSession(pendingSaved.session);
    setMeta({
      player: pendingSaved.player,
      dataSummary: pendingSaved.dataSummary,
      date: pendingSaved.date,
    });
    setError('');
  }

  async function handleSave() {
    if (!session || !meta) return;
    setSaving(true);
    try {
      const res = await fetch('/api/programs/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({
          playerId,
          date: meta.date,
          session,
          player: meta.player,
          dataSummary: meta.dataSummary,
          dayGoal: meta.dayGoal || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка сохранения');
      setJustSaved(true);
      setPendingSaved({
        session,
        player: meta.player,
        dataSummary: meta.dataSummary,
        date: meta.date,
        savedAt: new Date().toISOString(),
      });
      setTimeout(() => setJustSaved(false), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function updateExercise(blockIdx, exIdx, patch) {
    setSession(prev => ({
      ...prev,
      blocks: prev.blocks.map((b, bi) =>
        bi !== blockIdx
          ? b
          : { ...b, exercises: b.exercises.map((ex, ei) => (ei !== exIdx ? ex : { ...ex, ...patch })) }
      ),
    }));
  }

  function updateSet(blockIdx, exIdx, setIdx, value) {
    setSession(prev => ({
      ...prev,
      blocks: prev.blocks.map((b, bi) =>
        bi !== blockIdx
          ? b
          : {
              ...b,
              exercises: b.exercises.map((ex, ei) =>
                ei !== exIdx
                  ? ex
                  : { ...ex, targetSets: ex.targetSets.map((s, si) => (si === setIdx ? value : s)) }
              ),
            }
      ),
    }));
  }

  function addSetRow(blockIdx, exIdx) {
    setSession(prev => ({
      ...prev,
      blocks: prev.blocks.map((b, bi) =>
        bi !== blockIdx
          ? b
          : {
              ...b,
              exercises: b.exercises.map((ex, ei) =>
                ei !== exIdx ? ex : { ...ex, targetSets: [...ex.targetSets, ''] }
              ),
            }
      ),
    }));
  }

  function saveScheduleToServer(events) {
    if (!apiKey) return;
    fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ events }),
    }).catch(() => {});
  }

  function toggleScheduleDay(day) {
    const current = scheduleEvents.find(e => e.date === day)?.type;
    const next = !current ? 'game' : current === 'game' ? 'travel' : null;
    const updated = scheduleEvents.filter(e => e.date !== day);
    if (next) updated.push({ date: day, type: next });
    updated.sort((a, b) => a.date.localeCompare(b.date));
    setScheduleEvents(updated);
    saveScheduleToServer(updated);
  }

  const suggestion = useMemo(() => computeSuggestion(date, scheduleEvents), [date, scheduleEvents]);

  useEffect(() => {
    if (!session || !apiKey) { setExerciseImages({}); setImagesLoadedCount(0); return; }
    setExerciseImages({});
    setImagesLoadedCount(0);
    const exercises = (session.blocks || []).flatMap(b => b.exercises || []);
    if (!exercises.length) return;
    exercises.forEach(ex => {
      if (!ex.name?.trim()) { setImagesLoadedCount(c => c + 1); return; }
      fetch('/api/exercises/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ name: ex.name }),
      })
        .then(r => r.json())
        .then(data => { if (data.image) setExerciseImages(prev => ({ ...prev, [ex.name]: data.image })); })
        .catch(() => {})
        .finally(() => setImagesLoadedCount(c => c + 1));
    });
  }, [session, apiKey]);

  const totalPrintExercises = useMemo(
    () => (session?.blocks || []).flatMap(b => b.exercises || []).length,
    [session]
  );
  const printReady = !session || imagesLoadedCount >= totalPrintExercises;

  return (
    <>
      <Head>
        <title>Periodyx — AI Performance Coach</title>
        <meta
          name="description"
          content="Генерация тренировок в зале на конкретный день под состояние и цели игрока."
        />
      </Head>

      {/* Ambient background orbs — fixed behind everything */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden print:hidden">
        <div className="absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full bg-accent/[0.09] blur-[110px]" />
        <div className="absolute bottom-0 -right-20 h-[500px] w-[500px] rounded-full bg-blue-500/[0.09] blur-[120px]" />
        <div className="absolute top-1/3 right-1/4 h-[320px] w-[320px] rounded-full bg-violet-500/[0.05] blur-[100px]" />
      </div>

      <div className="relative flex min-h-screen text-slate-100">

        {/* ══════════════════════════════════════
            SIDEBAR — desktop only (sm+)
        ══════════════════════════════════════ */}
        <aside className="hidden sm:flex w-[260px] shrink-0 flex-col border-r border-white/[0.06] bg-[#060c15] print:hidden">

          {/* Logo + API Key */}
          <div className="border-b border-white/[0.05] p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-accent/30 to-accent/5 ring-1 ring-accent/20" />
                <div className="absolute inset-0 rounded-xl bg-accent/10 blur-md" />
                <Orbit size={16} strokeWidth={1.8} className="relative text-accent" />
              </div>
              <div>
                <div className="text-[15px] font-black tracking-tight text-white">Periodyx</div>
                <div className="text-[8.5px] font-semibold uppercase tracking-[0.22em] text-slate-600">AI Performance Coach</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setKeyPanelOpen(o => !o)}
              className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-semibold transition-all ${focusRing} ${
                keyConnected
                  ? 'border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-400 hover:bg-emerald-500/[0.11]'
                  : 'border-white/[0.07] bg-white/[0.03] text-slate-500 hover:border-white/[0.12] hover:text-slate-300'
              }`}
            >
              {keyConnected ? (
                <>
                  <span className="relative flex h-1.5 w-1.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  </span>
                  Подключено
                </>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-700" />
                  Настроить ключ
                </>
              )}
            </button>

            {keyPanelOpen && (
              <div className="mt-3 animate-fade-in">
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="TRAINER_API_KEY..."
                  className={`${inputBase} text-[12px] ${focusRing}`}
                />
                {playersError && (
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] text-rose-400">
                    <AlertTriangle size={11} /> {playersError}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Player list */}
          <div className="flex-1 overflow-y-auto p-2">
            {!keyConnected && (
              <p className="px-3 py-5 text-[11px] text-slate-600">Введи ключ чтобы загрузить состав</p>
            )}
            {keyConnected && players.length === 0 && (
              <p className="px-3 py-5 text-[11px] text-slate-600">Загрузка состава...</p>
            )}
            {players.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => selectPlayer(p)}
                className={`group w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150 ${
                  playerId === p.id
                    ? 'bg-accent/[0.08] text-white ring-1 ring-inset ring-accent/20'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                }`}
              >
                <div className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[11px] font-black transition-colors ${
                  playerId === p.id
                    ? 'bg-accent text-[#060a0e]'
                    : 'bg-white/[0.07] text-slate-400 group-hover:bg-white/[0.10]'
                }`}>
                  {initials(p.name)}
                  <span className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-[#060c15] ${positionDot(p.position)}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold leading-tight truncate">{p.name}</div>
                  <div className="mt-0.5 text-[10px] text-slate-600 truncate leading-tight">
                    {p.position || '—'}
                    {p.lastSessionDate && (
                      <span className="ml-1.5 opacity-50">
                        {p.lastSessionDate.slice(5).replace('-', '/')}
                      </span>
                    )}
                  </div>
                </div>
                {playerId === p.id && (
                  <button
                    type="button"
                    onClick={async e => {
                      e.stopPropagation();
                      try {
                        const r = await fetch('/api/players/share-token', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
                          body: JSON.stringify({ playerId: p.id }),
                        });
                        const d = await r.json();
                        if (!d.token) return;
                        await navigator.clipboard.writeText(`${window.location.origin}/player/${d.token}`);
                        setLinkCopied(true);
                        setTimeout(() => setLinkCopied(false), 2500);
                      } catch (_) {}
                    }}
                    className="shrink-0 rounded-lg p-1 text-slate-600 transition hover:text-accent"
                    title="Скопировать ссылку игрока"
                  >
                    {linkCopied ? <Check size={11} className="text-emerald-400" /> : <Link2 size={11} />}
                  </button>
                )}
              </button>
            ))}
          </div>
        </aside>

        {/* ══════════════════════════════════════
            MOBILE: full-screen player picker
        ══════════════════════════════════════ */}
        {mobileView === 'players' && (
          <div className="flex sm:hidden flex-col w-full min-h-screen">
            {/* Mobile header */}
            <div className="border-b border-white/[0.06] bg-[#060c15] px-5 py-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-accent/30 to-accent/5 ring-1 ring-accent/20" />
                  <Orbit size={14} strokeWidth={1.8} className="relative text-accent" />
                </div>
                <div>
                  <div className="text-[14px] font-black tracking-tight text-white">Periodyx</div>
                  <div className="text-[8px] font-semibold uppercase tracking-[0.22em] text-slate-600">AI Performance Coach</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setKeyPanelOpen(o => !o)}
                className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-semibold transition-all ${focusRing} ${
                  keyConnected
                    ? 'border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-400'
                    : 'border-white/[0.07] bg-white/[0.03] text-slate-500'
                }`}
              >
                {keyConnected ? (
                  <><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Подключено</>
                ) : (
                  <><span className="h-1.5 w-1.5 rounded-full bg-slate-700" />Настроить ключ</>
                )}
              </button>
              {keyPanelOpen && (
                <div className="mt-3">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="TRAINER_API_KEY..."
                    className={`${inputBase} text-[12px] ${focusRing}`}
                  />
                </div>
              )}
            </div>
            {/* Mobile player grid */}
            <div className="flex-1 overflow-y-auto p-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-600">Состав команды</p>
              <div className="grid grid-cols-2 gap-3">
                {players.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectPlayer(p)}
                    className="flex flex-col items-center gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 text-center transition active:scale-95"
                  >
                    <div className={`relative flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-black ${
                      playerId === p.id ? 'bg-accent text-[#060a0e]' : 'bg-white/[0.07] text-slate-300'
                    }`}>
                      {initials(p.name)}
                      <span className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#07101a] ${positionDot(p.position)}`} />
                    </div>
                    <div>
                      <div className="text-[12px] font-bold text-slate-200 leading-tight">{p.name}</div>
                      <div className="text-[10px] text-slate-600 mt-0.5">{p.position || '—'}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════
            WORKSPACE
        ══════════════════════════════════════ */}
        <div className={`flex-1 min-w-0 overflow-y-auto flex flex-col${mobileView === 'players' ? ' hidden sm:flex' : ''}`}>
          <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-accent/80 to-transparent print:hidden" />

          <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8">

          {/* ── Workspace header (player selected) ── */}
          {playerId && selectedPlayer ? (
            <div className="mb-7 flex items-center gap-4 print:hidden">
              <button
                type="button"
                onClick={() => setMobileView('players')}
                className="sm:hidden shrink-0 -ml-1 flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-slate-500 transition hover:text-slate-300"
              >
                ← Состав
              </button>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-[13px] font-black text-[#060a0e]">
                {initials(selectedPlayer.name)}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-[22px] font-black tracking-tight text-white leading-tight truncate">{selectedPlayer.name}</h1>
                <p className="text-[11px] text-slate-500">{selectedPlayer.position || 'Игрок'}</p>
              </div>
              {selectedPlayer.lastSessionDate && (
                <div className="hidden sm:block shrink-0 text-right">
                  <p className="text-[9px] uppercase tracking-wider text-slate-700">Последняя тр.</p>
                  <p className="text-[11px] font-semibold text-slate-500">{selectedPlayer.lastSessionDate}</p>
                </div>
              )}
            </div>
          ) : !playerId && (
            <div className="hidden sm:flex flex-col items-center justify-center min-h-[65vh] text-center print:hidden">
              <div className="mb-3 text-6xl opacity-10">🏋</div>
              <h2 className="text-[18px] font-black text-slate-600">Выберите игрока</h2>
              <p className="mt-1 text-sm text-slate-700">Состав — в панели слева</p>
            </div>
          )}

          {/* ── Schedule panel ── */}
          {keyConnected && playerId && (
            <div className="mb-5 print:hidden">
              <button
                type="button"
                onClick={() => setShowSchedule(o => !o)}
                className={`flex w-full items-center gap-2.5 rounded-xl border px-4 py-2.5 text-left text-xs font-semibold transition-all duration-200 ${focusRing} ${
                  showSchedule
                    ? 'border-accent/30 bg-accent/[0.07] text-accent'
                    : 'border-white/[0.07] bg-white/[0.025] text-slate-400 hover:border-white/[0.12] hover:text-slate-200'
                }`}
              >
                <CalendarDays size={13} className={showSchedule ? 'text-accent' : 'text-slate-600'} />
                <span>Расписание команды</span>
                {scheduleEvents.filter(e => e.type === 'game' && e.date >= todayISO()).length > 0 && (
                  <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-400">
                    {scheduleEvents.filter(e => e.type === 'game' && e.date >= todayISO()).length} игр
                  </span>
                )}
                <ChevronDown
                  size={12}
                  className={`ml-auto shrink-0 transition-transform duration-200 ${showSchedule ? 'rotate-180' : ''}`}
                />
              </button>

              {showSchedule && (
                <div className="mt-2 animate-fade-in rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 backdrop-blur-xl">
                  <p className="mb-4 text-[11px] text-slate-600">
                    Отмечайте игровые дни и перелёты на 4 недели вперёд. Система автоматически подберёт режим тренировки.
                  </p>
                  <ScheduleCalendar
                    events={scheduleEvents}
                    onToggle={toggleScheduleDay}
                    trainingDate={date}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── Form + Results (only when player is selected) ── */}
          {playerId && <>
          <form
            onSubmit={handleGenerate}
            className="rounded-2xl border border-white/[0.10] bg-white/[0.04] p-5 shadow-[0_8px_40px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur-xl sm:p-6 print:hidden"
          >
            {/* Session type toggle */}
            <div className="mb-5 flex gap-2">
              {[
                { value: 'gym', label: 'Тренажёрный зал', icon: <Dumbbell size={13} /> },
                { value: 'warmup', label: 'Разминка', icon: <Zap size={13} /> },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setSessionType(opt.value); setSession(null); setMeta(null); setError(''); }}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition-all ${
                    sessionType === opt.value
                      ? 'border-accent/40 bg-accent/10 text-accent shadow-[0_0_12px_rgba(34,211,238,0.1)]'
                      : 'border-white/[0.07] text-slate-500 hover:border-white/[0.12] hover:text-slate-300'
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>

            <div>
              <SectionLabel icon={<CalendarDays size={11} />} text="Дата тренировки" />
              <input
                type="date"
                value={date}
                max={addDaysToStr(todayISO(), 1)}
                onChange={e => setDate(e.target.value)}
                required
                className={`${inputBase} ${focusRing}`}
              />
              {date > todayISO() && (
                <p className="mt-1.5 text-[10px] text-accent/70">
                  Данные сегодняшнего вечера будут использованы для генерации завтрашней тренировки
                </p>
              )}
            </div>

            {/* 1RM Panel */}
            {playerId && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setOneRMPanelOpen(o => !o)}
                  className={`flex w-full items-center gap-2.5 rounded-xl border px-4 py-2.5 text-left text-xs font-semibold transition-all duration-200 ${focusRing} ${
                    oneRMPanelOpen
                      ? 'border-accent/30 bg-accent/[0.07] text-accent'
                      : 'border-white/[0.07] bg-white/[0.025] text-slate-400 hover:border-white/[0.12] hover:text-slate-200'
                  }`}
                >
                  <Dumbbell size={12} className={oneRMPanelOpen ? 'text-accent' : 'text-slate-600'} />
                  <span>Максимумы (1ПМ)</span>
                  {Object.keys(oneRM).length > 0 && (
                    <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold text-accent/80">
                      {Object.keys(oneRM).length}/{ONE_RM_FIELDS.length}
                    </span>
                  )}
                  <ChevronDown size={12} className={`ml-auto shrink-0 transition-transform duration-200 ${oneRMPanelOpen ? 'rotate-180' : ''}`} />
                </button>
                {oneRMPanelOpen && (
                  <div className="mt-2 animate-fade-in rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 backdrop-blur-xl">
                    <p className="mb-3 text-[10px] text-slate-600">Тестовые максимумы — Claude будет рассчитывать точные кг в программе</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {ONE_RM_FIELDS.map(f => (
                        <div key={f.key}>
                          <label className="mb-1 block text-[10px] font-semibold text-slate-500">{f.label}</label>
                          <div className="flex items-center overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.03]">
                            <input
                              type="number"
                              min="0"
                              step="2.5"
                              value={oneRM[f.key] || ''}
                              onChange={e => handleOneRMChange(f.key, e.target.value)}
                              placeholder="—"
                              className="w-full bg-transparent px-2.5 py-1.5 text-xs text-slate-200 outline-none placeholder:text-slate-600"
                            />
                            <span className="pr-2 text-[10px] text-slate-600">{f.unit}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {pendingSaved && !session && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/20 bg-accent/[0.05] px-4 py-3 animate-fade-in">
                <span className="flex items-center gap-2 text-xs font-medium text-accent/80">
                  <History size={13} />
                  Для этой даты есть сохранённая тренировка
                </span>
                <button
                  type="button"
                  onClick={loadSavedRecord}
                  className="rounded-lg border border-accent/25 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/20"
                >
                  Загрузить
                </button>
              </div>
            )}

            {/* Warmup → Gym banner */}
            {sessionType === 'gym' && todayWarmup && (
              <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3.5 py-2.5 animate-fade-in">
                <Check size={13} className="shrink-0 text-emerald-400" />
                <span className="text-xs text-emerald-300/90">Разминка готова — будет учтена при составлении программы</span>
                <button
                  type="button"
                  onClick={() => setTodayWarmup(null)}
                  className="ml-auto text-[10px] text-emerald-600 hover:text-emerald-400"
                >
                  сбросить
                </button>
              </div>
            )}

            <div className="mt-5">
              <SectionLabel icon={<Target size={11} />} text="Цель именно этой тренировки" />
              <input
                type="text"
                value={dayGoal}
                onChange={e => setDayGoal(e.target.value)}
                placeholder="Например: верх тела + кор, восстановительная сессия, акцент на прыжок"
                className={`${inputBase} ${focusRing}`}
              />
            </div>

            {/* ── Divider ── */}
            <div className="mt-5 h-px bg-white/[0.08]" />

            {/* ── Period & Phase ── */}
            <div className="mt-5">
              <SectionLabel icon={<Layers size={11} />} text="Период и фаза" />

              {/* Period tabs */}
              <div className="flex gap-1.5">
                {PERIODS.map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => {
                      setPeriod(p.value);
                      setFocus(PHASES_BY_PERIOD[p.value][0].value);
                    }}
                    className={`flex-1 rounded-xl border py-2.5 text-[11px] font-bold tracking-wide transition-all ${
                      period === p.value
                        ? `${PERIOD_COLORS[p.value].tab} ${PERIOD_COLORS[p.value].glow}`
                        : 'border-white/[0.09] text-slate-500 hover:border-white/[0.15] hover:text-slate-300'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Phase cards */}
              <div className={`mt-2 grid gap-1.5 ${PHASES_BY_PERIOD[period].length === 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {PHASES_BY_PERIOD[period].map(ph => (
                  <button
                    key={ph.value}
                    type="button"
                    onClick={() => setFocus(ph.value)}
                    className={`rounded-xl border px-3.5 py-3 text-left transition-all ${
                      focus === ph.value
                        ? `${PERIOD_COLORS[period].card} ${PERIOD_COLORS[period].glow}`
                        : 'border-white/[0.09] text-slate-400 hover:border-white/[0.15] hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${focus === ph.value ? PERIOD_COLORS[period].dot : 'bg-slate-700'}`} />
                      <div className={`text-[11px] font-semibold leading-tight transition-colors ${focus === ph.value ? PERIOD_COLORS[period].text : 'text-slate-400'}`}>
                        {ph.label}
                      </div>
                    </div>
                    {ph.sub && (
                      <div className="mt-1 ml-3.5 text-[10px] leading-tight text-slate-600">{ph.sub}</div>
                    )}
                  </button>
                ))}
              </div>

              {/* Schedule suggestion */}
              {suggestion && (
                <div className="mt-2 animate-fade-in flex items-center justify-between gap-2 rounded-xl border border-accent/15 bg-accent/[0.04] px-3 py-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-accent/60">Расписание → </span>
                    <span className="text-[11px] text-slate-400">{suggestion.reason}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const p = getPeriodForFocus(suggestion.focus);
                      setPeriod(p);
                      setFocus(suggestion.focus);
                    }}
                    className={`shrink-0 rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1 text-[11px] font-bold text-accent transition hover:bg-accent/20 ${focusRing}`}
                  >
                    Применить
                  </button>
                </div>
              )}
            </div>

            {/* ── Trend window (secondary, compact) ── */}
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-2.5">
              <TrendingUp size={12} className="shrink-0 text-slate-600" />
              <span className="text-[11px] text-slate-600">Анализ данных:</span>
              <span className="text-[11px] font-semibold text-slate-400">последние {days} дн.</span>
              <div className="ml-auto flex items-center gap-1">
                {[3, 7, 14, 21].map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setDays(v)}
                    className={`rounded-lg px-2.5 py-1 text-[10px] font-bold transition-all ${
                      days === v
                        ? 'bg-white/[0.08] text-slate-200'
                        : 'text-slate-600 hover:text-slate-400'
                    }`}
                  >
                    {v}д
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 h-px bg-white/[0.08]" />

            <div className="mt-5">
              <SectionLabel icon={<MessageSquare size={11} />} text="Комментарии тренера (необязательно)" />
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder={"Особые условия, ограничения по травмам...\nПример: «Сегодня утром была скоростная — снизить объём низа»\nИли: «Завтра COD-сессия — не перегружать колено»"}
                className={`${inputBase} ${focusRing} resize-none`}
              />
            </div>

            <div className={`mt-6 ${sessionType === 'gym' ? 'flex gap-3' : ''}`}>
            <button
              type="submit"
              disabled={loading || weekPlanLoading || !apiKey || !playerId}
              className={`flex items-center justify-center gap-2.5 rounded-xl bg-accent px-5 py-3.5 text-sm font-bold text-[#060a0e] shadow-[0_4px_24px_rgba(34,211,238,0.38)] transition-all duration-200 hover:brightness-110 hover:shadow-[0_6px_32px_rgba(34,211,238,0.52)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none ${focusRing} ${sessionType === 'gym' ? 'flex-1' : 'w-full'}`}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {sessionType === 'warmup' ? 'Генерация разминки...' : 'Генерация тренировки...'}
                </>
              ) : (
                <>
                  <Zap size={16} strokeWidth={2.5} />
                  {sessionType === 'warmup' ? 'Сгенерировать разминку' : 'Сгенерировать тренировку'}
                </>
              )}
            </button>
            {sessionType === 'gym' && (
              <button
                type="button"
                onClick={handleGenerateWeek}
                disabled={weekPlanLoading || loading || !apiKey || !playerId}
                className={`flex items-center justify-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.04] px-4 py-3.5 text-sm font-semibold text-slate-300 transition-all hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-30 ${focusRing}`}
                title="Сгенерировать план на 3 дня: Силовой → Мощностной → Восстановление"
              >
                {weekPlanLoading ? <Loader2 size={15} className="animate-spin" /> : <Calendar size={15} />}
                <span className="hidden sm:inline">План недели</span>
              </button>
            )}
            </div>
          </form>

          {/* ── Error ── */}
          {error && (
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/[0.07] p-4 text-sm animate-fade-in backdrop-blur-xl print:hidden">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-400" />
              <div>
                <div className="mb-0.5 text-xs font-bold uppercase tracking-wider text-rose-400/70">Ошибка</div>
                <div className="text-sm text-rose-300/80">{error}</div>
              </div>
            </div>
          )}

          {/* ── Loading skeleton ── */}
          {loading && !session && (
            <div className="mt-6 space-y-5 rounded-2xl border border-white/[0.05] bg-white/[0.015] p-6 backdrop-blur-xl print:hidden">
              <div className="flex items-center gap-3">
                <div className="h-7 w-7 animate-pulse rounded-lg bg-accent/10" />
                <div className="h-3.5 w-28 animate-pulse rounded-lg bg-white/[0.06]" />
                <div className="h-px flex-1 bg-white/[0.04]" />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-56 animate-pulse rounded-2xl bg-white/[0.04]" style={{ animationDelay: `${i * 80}ms` }} />
                ))}
              </div>
              <div className="flex items-center gap-3">
                <div className="h-7 w-7 animate-pulse rounded-lg bg-accent/10" style={{ animationDelay: '240ms' }} />
                <div className="h-3.5 w-24 animate-pulse rounded-lg bg-white/[0.06]" style={{ animationDelay: '240ms' }} />
                <div className="h-px flex-1 bg-white/[0.04]" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[1, 2].map(i => (
                  <div key={i} className="h-56 animate-pulse rounded-2xl bg-white/[0.04]" style={{ animationDelay: `${(i + 3) * 80}ms` }} />
                ))}
              </div>
            </div>
          )}

          {/* ── Session result ── */}
          {session && meta && (
            <div className="mt-6 animate-fade-in rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 shadow-[0_4px_32px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-6 print:border-none print:bg-white print:p-0 print:shadow-none">

              {/* Result toolbar */}
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-base font-black tracking-tight text-white">Тренировка</h2>
                  <span className="rounded-full border border-accent/25 bg-accent/[0.09] px-3 py-1 text-xs font-semibold text-accent">
                    {meta.player?.name}
                  </span>
                  <span className="rounded-full border border-white/[0.07] bg-white/[0.04] px-3 py-1 text-xs font-medium text-slate-500">
                    {meta.date}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { if (printReady) window.print(); }}
                    disabled={!printReady}
                    className={`flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2 text-xs font-medium transition hover:border-white/[0.15] ${focusRing} ${printReady ? 'text-slate-400 hover:text-slate-200' : 'cursor-wait text-slate-600'}`}
                  >
                    {printReady ? <Printer size={13} /> : <Loader2 size={13} className="animate-spin" />}
                    {printReady ? 'Печать' : `${imagesLoadedCount}/${totalPrintExercises}`}
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className={`flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-xs font-bold text-[#060a0e] shadow-[0_2px_14px_rgba(34,211,238,0.3)] transition hover:brightness-110 disabled:opacity-50 ${focusRing}`}
                  >
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    {justSaved ? 'Сохранено ✓' : 'Сохранить'}
                  </button>
                </div>
              </div>

              {/* Volume stats bar */}
              {volumeStats && volumeStats.sessions > 0 && (
                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3.5 py-2.5 print:hidden">
                  <BarChart2 size={11} className="text-slate-600" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">Объём за 7д</span>
                  {['A', 'B', 'C', 'D', 'E'].map(label =>
                    volumeStats.byBlock[label] ? (
                      <span key={label} className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-0.5 text-[10px] font-medium text-slate-400">
                        {label}: {volumeStats.byBlock[label]} подх.
                      </span>
                    ) : null
                  )}
                  <span className="text-[10px] text-slate-600">({volumeStats.sessions} сессий)</span>
                </div>
              )}

              {/* Assessment */}
              {session.assessment && (
                <div className="mb-4 rounded-xl border-l-2 border-accent/50 bg-accent/[0.04] px-4 py-4 print:hidden">
                  <div className="mb-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-accent/60">
                    Оценка состояния
                  </div>
                  <p className="text-sm leading-relaxed text-slate-300">{session.assessment}</p>
                </div>
              )}

              {/* Periodization note */}
              {session.periodization_note && (
                <div className="mb-6 rounded-xl border-l-2 border-blue-500/40 bg-blue-500/[0.04] px-4 py-4 print:hidden">
                  <div className="mb-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-blue-400/60">
                    Логика периодизации
                  </div>
                  <p className="text-sm leading-relaxed text-slate-400">{session.periodization_note}</p>
                </div>
              )}

              {/* Blocks — screen only */}
              <div className="space-y-8 print:hidden">
                {(session.blocks || []).map((block, bi) => (
                  <div key={bi}>
                    <div className="mb-3.5 flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-xs font-black text-[#060a0e]">
                        {block.label}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">
                        Блок {block.label}
                      </span>
                      {block.rest_note && (
                        <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-0.5 text-[10px] text-slate-500">
                          ⏱ {block.rest_note}
                        </span>
                      )}
                      <div className="h-px flex-1 bg-gradient-to-r from-white/[0.07] to-transparent" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {(block.exercises || []).map((ex, ei) => (
                        <ExerciseCard
                          key={ex.code || ei}
                          apiKey={apiKey}
                          code={ex.code}
                          name={ex.name}
                          targetSets={ex.targetSets || []}
                          weightNote={ex.weightNote || ''}
                          tempo={ex.tempo || ''}
                          autoReg={ex.autoReg || ''}
                          cue={ex.cue || ''}
                          onChangeName={v => updateExercise(bi, ei, { name: v })}
                          onChangeSet={(si, v) => updateSet(bi, ei, si, v)}
                          onAddSet={() => addSetRow(bi, ei)}
                          onChangeWeight={v => updateExercise(bi, ei, { weightNote: v })}
                          onChangeTempo={v => updateExercise(bi, ei, { tempo: v })}
                          onChangeAutoReg={v => updateExercise(bi, ei, { autoReg: v })}
                          onChangeCue={v => updateExercise(bi, ei, { cue: v })}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Warnings — screen only */}
              {session.warnings && (
                <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-4 print:hidden">
                  <div className="mb-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-amber-400/70">
                    Предостережения
                  </div>
                  <p className="text-sm text-amber-200/70">{session.warnings}</p>
                </div>
              )}

              {/* ── Print-only A4 landscape layout with exercise cards ── */}
              <div className="hidden print:block" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
                <style>{`
                  @page { size: A4 landscape; margin: 5mm 7mm; }
                  @media print {
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    .print-sheet { page-break-inside: avoid; }
                  }
                `}</style>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '3px', marginBottom: '4px' }}>
                  <div style={{ flexShrink: 0 }}>
                    <div style={{ fontSize: '10pt', fontWeight: '900', letterSpacing: '0.12em', color: '#0f172a', lineHeight: 1 }}>PERIODYX</div>
                    <div style={{ fontSize: '6pt', color: '#94a3b8', marginTop: '1px', letterSpacing: '0.05em' }}>AI PERFORMANCE COACH · ЗАРЕЧЬЕ ОДИНЦОВО</div>
                  </div>
                  <div style={{ textAlign: 'center', flex: 1, padding: '0 10px' }}>
                    <div style={{ fontSize: '7pt', fontWeight: '700', color: '#334155' }}>{meta.sessionType === 'warmup' ? 'РАЗМИНКА' : meta.focusLabel}</div>
                    {meta.dayGoal && <div style={{ fontSize: '6pt', color: '#64748b', marginTop: '1px' }}>Цель: {meta.dayGoal}</div>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '9pt', fontWeight: '800', color: '#0f172a', lineHeight: 1 }}>{meta.player?.name}</div>
                    <div style={{ fontSize: '6.5pt', color: '#64748b', marginTop: '1px' }}>{meta.player?.position} · {meta.date}</div>
                  </div>
                </div>

                {/* Exercise card grid — one column per block */}
                <div className="print-sheet" style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${(session.blocks || []).length}, 1fr)`,
                  gap: '3px',
                  alignItems: 'start',
                }}>
                  {(session.blocks || []).map((block, bi) => (
                    <div key={bi} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {/* Block label */}
                      <div style={{
                        backgroundColor: '#0f172a',
                        color: 'white',
                        padding: '2px 5px',
                        fontWeight: '800',
                        fontSize: '7pt',
                        letterSpacing: '0.14em',
                        textAlign: 'center',
                        borderRadius: '2px',
                      }}>
                        БЛОК {block.label}
                      </div>

                      {/* Exercise mini-cards */}
                      {(block.exercises || []).map((ex, ei) => (
                        <div key={ei} style={{
                          border: '1px solid #cbd5e1',
                          borderRadius: '3px',
                          overflow: 'hidden',
                          backgroundColor: 'white',
                        }}>
                          {/* Card header: code + name */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '3px',
                            padding: '2px 4px',
                            backgroundColor: '#f1f5f9',
                            borderBottom: '1px solid #e2e8f0',
                          }}>
                            <span style={{ fontWeight: '900', color: '#0284c7', fontSize: '8pt', flexShrink: 0, lineHeight: '1.1', marginTop: '1px' }}>{ex.code}</span>
                            <span style={{ fontWeight: '700', color: '#0f172a', fontSize: '6pt', lineHeight: '1.2', wordBreak: 'break-word' }}>{ex.name}</span>
                          </div>

                          {/* Exercise illustration */}
                          <div style={{ backgroundColor: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {exerciseImages[ex.name]
                              ? <img src={exerciseImages[ex.name]} alt={ex.name} style={{ width: '100%', maxHeight: '95px', objectFit: 'contain', display: 'block' }} />
                              : <div style={{ height: '55px', width: '100%', backgroundColor: '#f8fafc' }} />
                            }
                          </div>

                          {/* Sets · weight · cue */}
                          <div style={{ padding: '2px 4px', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                            <div style={{ fontFamily: 'monospace', fontWeight: '700', color: '#1d4ed8', fontSize: '7.5pt', textAlign: 'center', marginBottom: '1px', lineHeight: '1.1' }}>
                              {(ex.targetSets || []).join(' · ')}
                            </div>
                            {ex.weightNote && (
                              <div style={{ fontSize: '6pt', color: '#475569', lineHeight: '1.15', marginBottom: '1px' }}>{ex.weightNote}</div>
                            )}
                            {ex.cue && (
                              <div style={{ fontSize: '5.5pt', color: '#64748b', fontStyle: 'italic', lineHeight: '1.15' }}>{ex.cue}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                {/* Footer: assessment + warnings — clamped to 2 lines each to stay on page */}
                {(session.assessment || session.warnings) && (
                  <div style={{ marginTop: '4px', borderTop: '1px solid #e2e8f0', paddingTop: '3px', display: 'flex', gap: '10px', fontSize: '6pt' }}>
                    {session.assessment && (
                      <div style={{ flex: 2, overflow: 'hidden', maxHeight: '2.8em' }}>
                        <span style={{ fontWeight: '800', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Оценка: </span>
                        <span style={{ color: '#475569' }}>{session.assessment}</span>
                      </div>
                    )}
                    {session.warnings && (
                      <div style={{ flex: 1, overflow: 'hidden', maxHeight: '2.8em' }}>
                        <span style={{ fontWeight: '800', color: '#b45309' }}>⚠ </span>
                        <span style={{ color: '#92400e' }}>{session.warnings}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Data summary */}
              <button
                type="button"
                onClick={() => setShowSummary(s => !s)}
                className={`mt-5 flex items-center gap-1.5 text-[11px] font-medium text-slate-700 transition hover:text-slate-500 print:hidden ${focusRing} rounded`}
              >
                <ChevronDown
                  size={13}
                  className={`transition-transform ${showSummary ? 'rotate-180' : ''}`}
                />
                Данные, на которых построена тренировка
              </button>
              {showSummary && (
                <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-white/[0.06] bg-white/[0.025] p-4 text-[11px] leading-relaxed text-slate-600 print:hidden">
                  {meta.dataSummary}
                </pre>
              )}
            </div>
          )}

          {/* ── Week Plan ── */}
          {weekPlan && weekPlan.length > 0 && (
            <div className="mt-6 animate-fade-in space-y-3 print:hidden">
              <div className="flex items-center gap-3">
                <Calendar size={14} className="text-accent" />
                <h2 className="text-sm font-black tracking-tight text-white">План недели</h2>
                <div className="h-px flex-1 bg-gradient-to-r from-white/[0.07] to-transparent" />
                <span className="text-[10px] text-slate-600">3 тренировки · {weekPlan[0]?.date} → {weekPlan[2]?.date}</span>
              </div>
              {weekPlan.map((item, idx) => (
                <div key={idx} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] backdrop-blur-xl">
                  {/* Accordion header */}
                  <button
                    type="button"
                    onClick={() => setWeekPlanOpen(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx])}
                    className="flex w-full items-center gap-3 px-5 py-4 text-left"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent text-[10px] font-black text-[#060a0e]">
                      {idx + 1}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-100">{item.label}</span>
                      <span className="text-[10px] text-slate-500">{item.date} · {item.player?.name}</span>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      {item.saved ? (
                        <span className="rounded-full border border-emerald-500/25 bg-emerald-500/[0.08] px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                          Сохранено ✓
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); handleSaveWeekSession(idx); }}
                          disabled={item.saving}
                          className="rounded-lg bg-accent px-3 py-1.5 text-[10px] font-bold text-[#060a0e] shadow-[0_2px_10px_rgba(34,211,238,0.25)] transition hover:brightness-110 disabled:opacity-50"
                        >
                          {item.saving ? <Loader2 size={11} className="animate-spin" /> : 'Сохранить'}
                        </button>
                      )}
                      <ChevronDown size={13} className={`text-slate-600 transition-transform ${weekPlanOpen.includes(idx) ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  {/* Accordion body */}
                  {weekPlanOpen.includes(idx) && item.session && (
                    <div className="border-t border-white/[0.05] px-5 pb-5 pt-4">
                      {item.session.assessment && (
                        <p className="mb-4 text-xs leading-relaxed text-slate-400">{item.session.assessment}</p>
                      )}
                      <div className="space-y-5">
                        {(item.session.blocks || []).map((block, bi) => (
                          <div key={bi}>
                            <div className="mb-2 flex items-center gap-2.5">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent/20 text-[10px] font-black text-accent">
                                {block.label}
                              </span>
                              {block.rest_note && (
                                <span className="text-[10px] text-slate-600">⏱ {block.rest_note}</span>
                              )}
                            </div>
                            <div className="space-y-1.5 pl-8">
                              {(block.exercises || []).map((ex, ei) => (
                                <div key={ei} className="flex flex-wrap items-baseline gap-2">
                                  <span className="rounded bg-accent/10 px-1 text-[10px] font-bold text-accent">{ex.code}</span>
                                  {ex.tempo && <span className="rounded border border-blue-500/20 bg-blue-500/[0.06] px-1 text-[9px] text-blue-400">{ex.tempo}</span>}
                                  <span className="text-xs font-semibold text-slate-200">{ex.name}</span>
                                  <span className="text-[10px] text-slate-500">{(ex.targetSets || []).length}×{ex.targetSets?.[0]}</span>
                                  {ex.weightNote && <span className="text-[10px] text-slate-500">{ex.weightNote}</span>}
                                  {ex.autoReg && <span className="text-[10px] text-amber-400/70">⚡ {ex.autoReg}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          </>}{/* /playerId && */}

          {/* ── Footer ── */}
          {playerId && (
            <footer className="mt-14 flex items-center justify-center gap-3 print:hidden">
              <span className="text-[11px] font-medium text-white/[0.15]">Periodyx</span>
              <span className="h-px w-5 bg-white/[0.08]" />
              <span className="text-[11px] text-white/[0.10]">AI Performance Coach</span>
              <span className="h-px w-5 bg-white/[0.08]" />
              <span className="text-[11px] text-white/[0.10]">powered by Claude</span>
            </footer>
          )}

          </div>{/* /max-w-3xl */}
        </div>{/* /workspace */}
      </div>{/* /flex */}
    </>
  );
}
