import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import {
  KeyRound,
  CheckCircle2,
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
} from 'lucide-react';

const FOCUS_OPTIONS = [
  { value: 'inseason', label: 'Игровой период (поддержание)' },
  { value: 'preseason', label: 'Межсезонье (наращивание)' },
  { value: 'power', label: 'Взрывная сила / прыжок' },
  { value: 'strength', label: 'Максимальная сила' },
  { value: 'rehab', label: 'Реабилитация / разгрузка' },
];

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function fieldLabel(icon, text) {
  return (
    <span className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400">
      {icon}
      {text}
    </span>
  );
}

const inputClass =
  'block w-full rounded-xl border border-surface-border bg-surface-raised px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20';

const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:border-accent/60';

// Custom dropdown so the open menu stays in the dark theme — a native <select> always renders
// its option list with OS chrome (white on most platforms), which breaks the dark theme.
function Listbox({ value, onChange, options, placeholder = '— выбрать —' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onEscape(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, []);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`${inputClass} ${focusRing} flex items-center justify-between gap-2 text-left ${open ? 'border-accent/60 ring-2 ring-accent/20' : ''}`}
      >
        <span className={`truncate ${selected ? 'text-slate-100' : 'text-slate-500'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={15} className={`shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <ul className="absolute z-20 mt-1.5 max-h-64 w-full overflow-auto rounded-xl border border-surface-border bg-surface-raised p-1 shadow-card">
          {options.length === 0 && (
            <li className="px-3 py-2.5 text-sm text-slate-500">Нет доступных вариантов</li>
          )}
          {options.map(o => (
            <li key={o.value}>
              <button
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                  o.value === value ? 'bg-accent/10 text-accent' : 'text-slate-200 hover:bg-white/5'
                }`}
              >
                <span className="truncate">{o.label}</span>
                {o.value === value && <Check size={14} className="shrink-0" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// One exercise card: name, AI-generated diagram (cached server-side by name), editable set/weight/
// cue fields. Mirrors the trainer's own paper session sheets, but live and editable.
function ExerciseCard({ apiKey, code, name, targetSets, weightNote, cue, onChangeName, onChangeSet, onAddSet, onChangeWeight, onChangeCue }) {
  const [image, setImage] = useState(null);
  const [imageError, setImageError] = useState('');
  const [imageLoading, setImageLoading] = useState(false);

  useEffect(() => {
    if (!name || !name.trim() || !apiKey) return;
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
        if (!r.ok) throw new Error(data.error || 'Не удалось получить изображение');
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
    // Regenerate the picture only when the exercise *name* changes — not on every keystroke
    // in the sets/weight/cue fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, apiKey]);

  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-raised print:break-inside-avoid print:border-slate-300 print:bg-white">
      <div className="flex items-center gap-2 bg-surface-card px-3 py-2 print:bg-slate-100">
        <span className="shrink-0 text-xs font-semibold text-accent print:text-slate-700">{code}</span>
        <input
          value={name}
          onChange={e => onChangeName(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-right text-sm font-medium text-slate-100 outline-none print:text-slate-900"
        />
      </div>

      <div className="flex aspect-square items-center justify-center bg-white">
        {imageLoading && <Loader2 size={22} className="animate-spin text-slate-400" />}
        {!imageLoading && image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={name} className="h-full w-full object-contain" />
        )}
        {!imageLoading && !image && (
          <span className="px-3 text-center text-[11px] text-slate-400">{imageError || 'Нет изображения'}</span>
        )}
      </div>

      <div className="space-y-2 p-3">
        <div className="flex flex-wrap gap-1.5">
          {targetSets.map((s, i) => (
            <div
              key={i}
              className="flex items-center overflow-hidden rounded-md border border-surface-border bg-surface-card print:border-slate-300"
            >
              <span className="px-1.5 py-1 text-[10px] text-slate-500">{i + 1}</span>
              <input
                value={s}
                onChange={e => onChangeSet(i, e.target.value)}
                placeholder="—"
                className="w-12 bg-transparent px-1 py-1 text-center text-xs text-slate-100 outline-none print:text-slate-900"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={onAddSet}
            className="rounded-md border border-dashed border-surface-border px-2 text-xs text-slate-500 transition hover:border-accent/40 hover:text-accent print:hidden"
          >
            +
          </button>
        </div>

        <input
          value={weightNote}
          onChange={e => onChangeWeight(e.target.value)}
          placeholder="Вес / интенсивность"
          className="w-full rounded-md border border-surface-border bg-surface-card px-2 py-1.5 text-xs text-slate-200 outline-none transition focus:border-accent/50 print:border-slate-300 print:text-slate-900"
        />
        <textarea
          value={cue}
          onChange={e => onChangeCue(e.target.value)}
          rows={2}
          className="w-full resize-none rounded-md border border-surface-border bg-surface-card px-2 py-1.5 text-xs leading-snug text-slate-400 outline-none transition focus:border-accent/50 print:border-slate-300 print:text-slate-700"
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
  const [focus, setFocus] = useState('inseason');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSummary, setShowSummary] = useState(false);

  // The active, editable session + the metadata it was generated/loaded with.
  const [session, setSession] = useState(null);
  const [meta, setMeta] = useState(null); // { player, dataSummary, date }

  // A previously saved (edited) session for the currently selected player+date, if any —
  // surfaced as a banner before generating a fresh one over it.
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
    localStorage.setItem('coachApiKey', apiKey);
    setPlayersError('');
    fetch('/api/players/list', { headers: { 'x-api-key': apiKey } })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `Ошибка загрузки списка игроков (${r.status})`);
        setPlayers(data.players || []);
      })
      .catch(err => {
        setPlayers([]);
        setPlayersError(err.message);
      });
  }, [apiKey]);

  // Check whether a previously saved/edited session already exists for this player+date.
  useEffect(() => {
    if (!apiKey || !playerId || !date) {
      setPendingSaved(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/programs/get?playerId=${encodeURIComponent(playerId)}&date=${encodeURIComponent(date)}`, {
      headers: { 'x-api-key': apiKey },
    })
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
      const res = await fetch('/api/programs/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ playerId, date, dayGoal, days, focus, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка генерации');
      setSession(data.session);
      setMeta({ player: data.player, dataSummary: data.dataSummary, date: data.date });
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
    setMeta({ player: pendingSaved.player, dataSummary: pendingSaved.dataSummary, date: pendingSaved.date });
    setError('');
  }

  async function handleSave() {
    if (!session || !meta) return;
    setSaving(true);
    try {
      const res = await fetch('/api/programs/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ playerId, date: meta.date, session, player: meta.player, dataSummary: meta.dataSummary }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить');
      setJustSaved(true);
      setPendingSaved({ session, player: meta.player, dataSummary: meta.dataSummary, date: meta.date, savedAt: new Date().toISOString() });
      setTimeout(() => setJustSaved(false), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function updateExercise(blockIdx, exIdx, patch) {
    setSession(prev => {
      const blocks = prev.blocks.map((b, bi) => {
        if (bi !== blockIdx) return b;
        const exercises = b.exercises.map((ex, ei) => (ei === exIdx ? { ...ex, ...patch } : ex));
        return { ...b, exercises };
      });
      return { ...prev, blocks };
    });
  }

  function updateSet(blockIdx, exIdx, setIdx, value) {
    setSession(prev => {
      const blocks = prev.blocks.map((b, bi) => {
        if (bi !== blockIdx) return b;
        const exercises = b.exercises.map((ex, ei) => {
          if (ei !== exIdx) return ex;
          const targetSets = ex.targetSets.map((s, si) => (si === setIdx ? value : s));
          return { ...ex, targetSets };
        });
        return { ...b, exercises };
      });
      return { ...prev, blocks };
    });
  }

  function addSetRow(blockIdx, exIdx) {
    setSession(prev => {
      const blocks = prev.blocks.map((b, bi) => {
        if (bi !== blockIdx) return b;
        const exercises = b.exercises.map((ex, ei) => (ei === exIdx ? { ...ex, targetSets: [...ex.targetSets, ''] } : ex));
        return { ...b, exercises };
      });
      return { ...prev, blocks };
    });
  }

  return (
    <>
      <Head>
        <title>Periodyx — AI Performance Coach</title>
        <meta name="description" content="Генерация тренировок в зале на конкретный день под состояние и цели игрока." />
      </Head>

      <div className="h-[3px] w-full bg-gradient-to-r from-transparent via-accent to-transparent opacity-70 print:hidden" />

      <div className="min-h-screen px-4 py-10 text-slate-100 sm:px-6">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-8 flex items-center justify-between print:hidden">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent shadow-glow">
                <Orbit size={19} strokeWidth={2.1} />
              </div>
              <div>
                <div className="text-base font-semibold tracking-tight text-slate-50">Periodyx</div>
                <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">AI Performance Coach</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setKeyPanelOpen(o => !o)}
              className={`flex items-center gap-2 rounded-full border border-surface-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-accent/40 ${focusRing}`}
            >
              {keyConnected ? <CheckCircle2 size={14} className="text-emerald-400" /> : <KeyRound size={14} className="text-slate-400" />}
              {keyConnected ? 'Подключено' : 'API-ключ'}
            </button>
          </div>

          {keyPanelOpen && (
            <div className="mb-6 animate-fade-in rounded-2xl border border-surface-border bg-surface-card p-4 shadow-card print:hidden">
              {fieldLabel(<KeyRound size={13} />, 'API-ключ (TRAINER_API_KEY)')}
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Введите ключ"
                className={`${inputClass} ${focusRing}`}
              />
              {playersError && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-rose-400">
                  <AlertTriangle size={13} /> {playersError}
                </p>
              )}
            </div>
          )}

          <p className="mb-6 text-sm leading-relaxed text-slate-400 print:hidden">
            Генерация тренировки на конкретный день — индивидуально под игрока, его состояние именно на эту
            дату, и под цель, которую ты сейчас задашь.
          </p>

          <form
            onSubmit={handleGenerate}
            className="space-y-5 rounded-2xl border border-surface-border bg-surface-card p-5 shadow-card sm:p-6 print:hidden"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                {fieldLabel(<Target size={13} />, 'Игрок')}
                <Listbox value={playerId} onChange={setPlayerId} options={playerOptions} />
              </label>

              <label className="block">
                {fieldLabel(<CalendarDays size={13} />, 'Дата тренировки')}
                <input
                  type="date"
                  value={date}
                  max={todayISO()}
                  onChange={e => setDate(e.target.value)}
                  required
                  className={`${inputClass} ${focusRing}`}
                />
              </label>
            </div>

            {pendingSaved && !session && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent animate-fade-in">
                <span className="flex items-center gap-2">
                  <History size={15} />
                  Для этого игрока и даты есть сохранённая тренировка.
                </span>
                <button
                  type="button"
                  onClick={loadSavedRecord}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-surface transition hover:brightness-110"
                >
                  Загрузить сохранённую
                </button>
              </div>
            )}

            <label className="block">
              {fieldLabel(<Target size={13} />, 'Цель именно этой тренировки')}
              <input
                type="text"
                value={dayGoal}
                onChange={e => setDayGoal(e.target.value)}
                placeholder="Например: верх тела + кор, восстановительная сессия, акцент на прыжок"
                className={`${inputClass} ${focusRing}`}
              />
            </label>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                {fieldLabel(<Layers size={13} />, 'Фаза подготовки')}
                <Listbox value={focus} onChange={setFocus} options={FOCUS_OPTIONS} />
              </label>

              <label className="block">
                {fieldLabel(<TrendingUp size={13} />, 'Окно тренда (дней до даты)')}
                <input
                  type="number"
                  min={3}
                  max={30}
                  value={days}
                  onChange={e => setDays(Number(e.target.value))}
                  className={`${inputClass} ${focusRing}`}
                />
              </label>
            </div>

            <label className="block">
              {fieldLabel(<MessageSquare size={13} />, 'Комментарии тренера (необязательно)')}
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                className={`${inputClass} ${focusRing} resize-none`}
              />
            </label>

            <button
              type="submit"
              disabled={loading || !apiKey || !playerId}
              className={`flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-surface transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Генерация...
                </>
              ) : (
                <>
                  <Dumbbell size={16} /> Сгенерировать тренировку
                </>
              )}
            </button>
          </form>

          {error && (
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300 animate-fade-in print:hidden">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {loading && !session && (
            <div className="mt-6 animate-pulse space-y-3 rounded-2xl border border-surface-border bg-surface-card p-6 shadow-card print:hidden">
              <div className="h-4 w-1/3 rounded bg-surface-raised" />
              <div className="h-3 w-full rounded bg-surface-raised" />
              <div className="h-3 w-5/6 rounded bg-surface-raised" />
              <div className="h-3 w-2/3 rounded bg-surface-raised" />
            </div>
          )}

          {session && meta && (
            <div className="mt-6 animate-fade-in rounded-2xl border border-surface-border bg-surface-card p-5 shadow-card sm:p-6 print:border-none print:bg-white print:p-0 print:shadow-none">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-slate-50">Тренировка</h2>
                  <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">{meta.player?.name}</span>
                  <span className="rounded-full bg-surface-raised px-2.5 py-1 text-xs font-medium text-slate-400">{meta.date}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className={`flex items-center gap-1.5 rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-accent/40 ${focusRing}`}
                  >
                    <Printer size={14} /> Печать
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className={`flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-surface transition hover:brightness-110 disabled:opacity-50 ${focusRing}`}
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    {justSaved ? 'Сохранено ✓' : 'Сохранить'}
                  </button>
                </div>
              </div>

              <div className="mb-4 hidden items-center justify-between border-b border-slate-300 pb-3 print:flex">
                <div className="text-sm font-semibold text-slate-900">Заречье — Одинцово</div>
                <div className="text-sm text-slate-700">
                  {meta.player?.name} · {meta.date}
                </div>
              </div>

              {session.assessment && (
                <p className="mb-5 text-sm leading-relaxed text-slate-300 print:text-slate-800">{session.assessment}</p>
              )}

              <div className="space-y-6">
                {(session.blocks || []).map((block, bi) => (
                  <div key={bi}>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-xs font-bold text-surface print:bg-slate-800 print:text-white">
                        {block.label}
                      </span>
                      <span className="text-xs uppercase tracking-wider text-slate-500">Блок {block.label}</span>
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

              {session.warnings && (
                <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200 print:border-slate-300 print:bg-slate-50 print:text-slate-800">
                  <strong className="font-semibold">Предостережения: </strong>
                  {session.warnings}
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowSummary(s => !s)}
                className={`mt-4 flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-300 print:hidden ${focusRing} rounded`}
              >
                <ChevronDown size={14} className={`transition-transform ${showSummary ? 'rotate-180' : ''}`} />
                Исходные данные, на которых построена тренировка
              </button>
              {showSummary && (
                <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-surface-border bg-surface-raised p-4 text-xs leading-relaxed text-slate-400 print:hidden">
                  {meta.dataSummary}
                </pre>
              )}
            </div>
          )}

          <footer className="mt-10 text-center text-[11px] text-slate-600 print:hidden">Periodyx · powered by Claude</footer>
        </div>
      </div>
    </>
  );
}
