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
} from 'lucide-react';

const PERIODS = [
  { value: 'inseason',  label: 'Сезон' },
  { value: 'camp',      label: 'Сборы' },
  { value: 'offseason', label: 'Межсезонье' },
  { value: 'rehab',     label: 'Реабилитация' },
];

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
    <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
      <span className="text-accent/60">{icon}</span>
      {text}
    </div>
  );
}

const inputBase =
  'block w-full rounded-xl border border-white/[0.07] bg-white/[0.04] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition-all duration-200 hover:border-white/[0.11] focus:border-accent/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-accent/15';

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
  cue,
  onChangeName,
  onChangeSet,
  onAddSet,
  onChangeWeight,
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
      <div className="flex items-center gap-2.5 bg-gradient-to-r from-accent/[0.12] to-transparent px-3.5 py-2.5 print:bg-slate-100">
        <span className="shrink-0 rounded-md bg-accent/20 px-1.5 py-0.5 text-[10px] font-black tracking-wide text-accent print:bg-slate-200 print:text-slate-700">
          {code}
        </span>
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

  const keyConnected = apiKey && !playersError;
  const playerOptions = players.map(p => ({
    value: p.id,
    label: `${p.name}${p.position ? ` (${p.position})` : ''}`,
  }));

  async function handleGenerate(e) {
    e.preventDefault();
    if (!playerId) return;
    setLoading(true);
    setError('');
    setSession(null);
    setMeta(null);
    setJustSaved(false);
    try {
      const endpoint = sessionType === 'warmup'
        ? '/api/programs/generate-warmup'
        : '/api/programs/generate';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ playerId, date, dayGoal, days, focus, notes }),
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
      setShowSummary(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
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

      {/* Ambient background orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden print:hidden">
        <div className="absolute -top-40 -left-40 h-[560px] w-[560px] rounded-full bg-accent/[0.055] blur-[120px]" />
        <div className="absolute bottom-10 -right-20 h-[420px] w-[420px] rounded-full bg-blue-600/[0.045] blur-[130px]" />
        <div className="absolute top-1/2 left-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.02] blur-[100px]" />
      </div>

      {/* Top accent line */}
      <div className="h-[1.5px] w-full bg-gradient-to-r from-transparent via-accent/70 to-transparent print:hidden" />

      <div className="relative min-h-screen px-4 py-10 text-slate-100 sm:px-6">
        <div className="mx-auto w-full max-w-5xl">

          {/* ── Header ── */}
          <header className="mb-10 flex items-center justify-between print:hidden">
            <div className="flex items-center gap-3.5">
              <div className="relative flex h-11 w-11 items-center justify-center">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-accent/30 to-accent/5 ring-1 ring-accent/20" />
                <div className="absolute inset-0 rounded-2xl bg-accent/10 blur-md" />
                <Orbit size={20} strokeWidth={1.8} className="relative text-accent" />
              </div>
              <div>
                <div className="text-[17px] font-black tracking-tight text-white">Periodyx</div>
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.22em] text-slate-600">
                  AI Performance Coach
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setKeyPanelOpen(o => !o)}
              className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ${focusRing} ${
                keyConnected
                  ? 'border-emerald-500/25 bg-emerald-500/[0.09] text-emerald-400 hover:border-emerald-500/40 hover:bg-emerald-500/[0.13]'
                  : 'border-white/[0.08] bg-white/[0.04] text-slate-500 hover:border-white/[0.14] hover:text-slate-300'
              }`}
            >
              {keyConnected ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  </span>
                  Подключено
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-slate-700" />
                  Настроить ключ
                </>
              )}
            </button>
          </header>

          {/* ── API key panel ── */}
          {keyPanelOpen && (
            <div className="mb-6 animate-fade-in rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 shadow-[0_4px_28px_rgba(0,0,0,0.45)] backdrop-blur-2xl print:hidden">
              <SectionLabel icon={<span className="text-sm leading-none">⬡</span>} text="TRAINER_API_KEY" />
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Введите ключ..."
                className={`${inputBase} ${focusRing}`}
              />
              {playersError && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-rose-400">
                  <AlertTriangle size={12} /> {playersError}
                </p>
              )}
            </div>
          )}

          {/* ── Subtitle ── */}
          <p className="mb-6 max-w-lg text-[13px] leading-relaxed text-slate-600 print:hidden">
            Тренировка на конкретный день — индивидуально под игрока, его состояние и цели тренера.
          </p>

          {/* ── Schedule panel ── */}
          {keyConnected && (
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

          {/* ── Form ── */}
          <form
            onSubmit={handleGenerate}
            className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 shadow-[0_4px_32px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-6 print:hidden"
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

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <SectionLabel icon={<Dumbbell size={11} />} text="Игрок" />
                <Listbox value={playerId} onChange={setPlayerId} options={playerOptions} />
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
            </div>

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

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
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
                      className={`flex-1 rounded-xl border py-2 text-[11px] font-bold transition-all ${
                        period === p.value
                          ? 'border-accent/40 bg-accent/10 text-accent'
                          : 'border-white/[0.07] text-slate-500 hover:border-white/[0.12] hover:text-slate-300'
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
                      className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                        focus === ph.value
                          ? 'border-accent/40 bg-accent/10'
                          : 'border-white/[0.07] hover:border-white/[0.12]'
                      }`}
                    >
                      <div className={`text-[11px] font-semibold leading-tight ${focus === ph.value ? 'text-accent' : 'text-slate-300'}`}>
                        {ph.label}
                      </div>
                      {ph.sub && (
                        <div className="mt-0.5 text-[10px] leading-tight text-slate-500">{ph.sub}</div>
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
              <div>
                <SectionLabel icon={<TrendingUp size={11} />} text="Окно тренда (дней до даты)" />
                <input
                  type="number"
                  min={3}
                  max={30}
                  value={days}
                  onChange={e => setDays(Number(e.target.value))}
                  className={`${inputBase} ${focusRing}`}
                />
              </div>
            </div>

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

            <button
              type="submit"
              disabled={loading || !apiKey || !playerId}
              className={`mt-6 flex w-full items-center justify-center gap-2.5 rounded-xl bg-accent px-5 py-3.5 text-sm font-bold text-[#060a0e] shadow-[0_4px_24px_rgba(34,211,238,0.38)] transition-all duration-200 hover:brightness-110 hover:shadow-[0_6px_32px_rgba(34,211,238,0.52)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none ${focusRing}`}
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
                          cue={ex.cue || ''}
                          onChangeName={v => updateExercise(bi, ei, { name: v })}
                          onChangeSet={(si, v) => updateSet(bi, ei, si, v)}
                          onAddSet={() => addSetRow(bi, ei)}
                          onChangeWeight={v => updateExercise(bi, ei, { weightNote: v })}
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

          {/* ── Footer ── */}
          <footer className="mt-14 flex items-center justify-center gap-3 print:hidden">
            <span className="text-[11px] font-medium text-white/[0.15]">Periodyx</span>
            <span className="h-px w-5 bg-white/[0.08]" />
            <span className="text-[11px] text-white/[0.10]">AI Performance Coach</span>
            <span className="h-px w-5 bg-white/[0.08]" />
            <span className="text-[11px] text-white/[0.10]">powered by Claude</span>
          </footer>

        </div>
      </div>
    </>
  );
}
