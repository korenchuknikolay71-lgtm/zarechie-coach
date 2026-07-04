import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import {
  Activity,
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
  Copy,
  RefreshCw,
  Users,
  X,
  CheckSquare,
  Square,
  ChevronRight,
  ChevronLeft,
  ArrowLeftRight,
  ChevronUp,
  BookOpen,
  ArrowRight,
  Menu,
  Plus,
  Info,
  Plane,
  Swords,
  Coffee,
  Shield,
  RotateCcw,
  CalendarRange,
} from 'lucide-react';
import { findExerciseUrl } from '../lib/exerciseBank';
import { calcWeight } from '../lib/loadCalc';
import { RESTRICTIONS, hasRestriction } from '../lib/exerciseRestrictions';

// Camp date anchors (сборы 2025).
const CAMP_START = '2025-07-13';
const CAMP_ECC_END = '2025-08-02'; // конец эксцентрической фазы (нед.1-3)

// Evening-conditioning info for weeks 1-3 of camp (Mon/Tue/Sat).
function campEveningNote(dateStr) {
  if (!dateStr || dateStr < CAMP_START || dateStr > CAMP_ECC_END) return null;
  const dow = new Date(`${dateStr}T00:00:00`).getDay(); // 0=Sun..6=Sat
  if (dow === 1) return 'Вечер: линейная скорость · защищай квадрицепс и сгибатели';
  if (dow === 2) return 'Вечер: COD · защищай колени';
  if (dow === 6) return 'Вечер: выносливость · зала сегодня нет';
  return null;
}

// Map a camp focus phase to a representative training week (for auto-weight %).
function weekFromFocus(focus) {
  const f = String(focus || '');
  if (f.startsWith('camp_ecc_')) return 2;
  if (f.startsWith('camp_iso_')) return 4;
  if (f === 'camp_explosive') return 6;
  return null;
}

// Tiny inline trend chart for 1RM history.
function Sparkline({ values, width = 48, height = 20 }) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x},${y}`;
  }).join(' ');
  const last = values[values.length - 1];
  const prev = values[values.length - 2];
  const trend = last > prev ? '↑' : last < prev ? '↓' : '→';
  const color = last > prev ? '#4ade80' : last < prev ? '#f87171' : '#94a3b8';
  return (
    <span className="inline-flex items-center gap-1">
      <svg width={width} height={height} className="shrink-0">
        <polyline fill="none" stroke={color} strokeWidth="1.5" points={pts} opacity="0.7" />
      </svg>
      <span className="text-[10px]" style={{ color }}>{trend}</span>
    </span>
  );
}

// Custom calendar date-picker — auto-closes after selection, matches dark theme.
function DatePicker({ value, onChange, maxDate, size = 'default', className = '' }) {
  const [open, setOpen] = useState(false);
  const [vy, setVy] = useState(() => value ? +value.slice(0, 4) : new Date().getFullYear());
  const [vm, setVm] = useState(() => value ? +value.slice(5, 7) - 1 : new Date().getMonth());
  const ref = useRef(null);

  useEffect(() => {
    if (value) { setVy(+value.slice(0, 4)); setVm(+value.slice(5, 7) - 1); }
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function fn(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);

  const todaySt = new Date().toISOString().slice(0, 10);

  function ds(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function formatLabel(v) {
    if (!v) return 'Дата';
    const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const [y, m, d] = v.split('-');
    return `${+d} ${months[+m - 1]} ${y}`;
  }

  const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const MON = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

  function buildGrid() {
    const first = new Date(vy, vm, 1);
    const last = new Date(vy, vm + 1, 0);
    const startDow = (first.getDay() + 6) % 7;
    const cells = [];
    for (let i = startDow - 1; i >= 0; i--) cells.push({ d: new Date(vy, vm, -i), cur: false });
    for (let i = 1; i <= last.getDate(); i++) cells.push({ d: new Date(vy, vm, i), cur: true });
    while (cells.length < 42) {
      cells.push({ d: new Date(vy, vm + 1, cells.length - last.getDate() - startDow + 1), cur: false });
    }
    return cells;
  }

  function prevM() { const d = new Date(vy, vm - 1, 1); setVy(d.getFullYear()); setVm(d.getMonth()); }
  function nextM() { const d = new Date(vy, vm + 1, 1); setVy(d.getFullYear()); setVm(d.getMonth()); }

  const sm = size === 'sm';

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex w-full items-center gap-2 rounded-xl border bg-white/[0.03] text-left font-semibold text-slate-200 transition focus:outline-none
          ${open ? 'border-accent/50' : 'border-white/[0.08] hover:border-white/[0.14]'}
          ${sm ? 'px-2.5 py-1.5 text-[11px]' : 'px-3.5 py-2.5 text-[13px]'}`}
      >
        <Calendar size={sm ? 11 : 14} className="shrink-0 text-slate-500" />
        {formatLabel(value)}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[60] mt-2 w-[276px] rounded-2xl border border-white/[0.10] bg-[#0d1b2e] p-4 shadow-[0_24px_64px_rgba(0,0,0,0.80)] backdrop-blur-xl">
          {/* Month navigation */}
          <div className="mb-4 flex items-center justify-between">
            <button type="button" onClick={prevM}
              className="grid h-8 w-8 place-items-center rounded-xl text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-200">
              <ChevronLeft size={16} />
            </button>
            <span className="text-[13px] font-black tracking-wide text-slate-100">{MON[vm]} {vy}</span>
            <button type="button" onClick={nextM}
              className="grid h-8 w-8 place-items-center rounded-xl text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-200">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Day-of-week header */}
          <div className="mb-1 grid grid-cols-7">
            {DOW.map(d => (
              <div key={d} className="py-1 text-center text-[9px] font-black uppercase tracking-wider text-slate-700">{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-y-1">
            {buildGrid().map((cell, i) => {
              const s = ds(cell.d);
              const sel = s === value;
              const tod = s === todaySt;
              const dis = maxDate ? s > maxDate : false;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={dis}
                  onClick={() => { onChange(s); setOpen(false); }}
                  className={`h-9 w-full rounded-xl text-[12px] font-semibold transition-all focus:outline-none
                    ${sel
                      ? 'bg-gradient-to-b from-cyan-400 to-cyan-500 text-[#04212b] font-black shadow-[0_4px_14px_rgba(34,211,238,0.35)]'
                      : tod
                      ? 'border border-accent/40 text-accent hover:bg-accent/10'
                      : cell.cur
                      ? 'text-slate-300 hover:bg-white/[0.07] hover:text-white'
                      : 'text-slate-700 hover:text-slate-500'}
                    ${dis ? 'pointer-events-none opacity-25' : ''}`}
                >
                  {cell.d.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const ONE_RM_FIELDS = [
  { key: 'squat',    label: 'Присед (трэп/гоблет)', unit: 'кг' },
  { key: 'rdl',      label: 'РТ на одной ноге',     unit: 'кг' },
  { key: 'deadlift', label: 'Тяга трэп-штанга',     unit: 'кг' },
  { key: 'bench',    label: 'DB Bench (∑ обе гантели)', unit: 'кг' },
  { key: 'ohp',      label: 'Жим Landmine',          unit: 'кг' },
  { key: 'pullup',   label: 'Подтяг. (+кг)',         unit: 'кг' },
];

const RM_COLORS = {
  squat: '#22d3ee', rdl: '#a78bfa', deadlift: '#34d399',
  bench: '#f59e0b', ohp: '#f87171', pullup: '#60a5fa',
};
const RM_SHORT = {
  squat: 'Присед', rdl: 'РТ 1н', deadlift: 'Тяга трэп',
  bench: 'DB Bench', ohp: 'Landmine', pullup: 'Подтяг.',
};

function RMChart({ history, fields }) {
  if (!history || history.length < 2) return null;
  const W = 340, H = 130;
  const PAD = { top: 10, right: 14, bottom: 24, left: 30 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const n = history.length;

  const lines = fields.map(f => {
    const vals = history.map(h => parseFloat(h[f.key]) || null);
    const firstVal = vals.find(v => v != null);
    if (!firstVal) return null;
    const pcts = vals.map(v => v != null ? +((v - firstVal) / firstVal * 100).toFixed(1) : null);
    if (pcts.filter(v => v != null).length < 2) return null;
    const last = vals.filter(v => v != null).at(-1);
    return { key: f.key, pcts, last, delta: +(last - firstVal).toFixed(1), color: RM_COLORS[f.key] };
  }).filter(Boolean);

  if (!lines.length) return null;

  const allPcts = lines.flatMap(l => l.pcts.filter(v => v != null));
  const pMin = Math.min(0, ...allPcts);
  const pMax = Math.max(0, ...allPcts);
  const pad = Math.max((pMax - pMin) * 0.18, 3);
  const yLo = pMin - pad, yHi = pMax + pad;
  const xFn = i => PAD.left + (i / (n - 1)) * cW;
  const yFn = p => PAD.top + cH - ((p - yLo) / (yHi - yLo)) * cH;

  const gridPcts = [-20, -10, 0, 10, 20].filter(p => p >= yLo - 1 && p <= yHi + 1);

  return (
    <div className="mt-4 rounded-2xl border border-white/[0.06] bg-black/20 p-4">
      <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-700">Динамика 1ПМ · % от первого теста</p>
      <div className="overflow-x-auto">
        <svg width={W} height={H} className="w-full" viewBox={`0 0 ${W} ${H}`}>
          {gridPcts.map(p => {
            const gy = yFn(p);
            return (
              <g key={p}>
                <line x1={PAD.left} y1={gy} x2={W - PAD.right} y2={gy}
                  stroke={p === 0 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)'}
                  strokeWidth="1" strokeDasharray={p === 0 ? '0' : '2,4'} />
                <text x={PAD.left - 4} y={gy + 3.5} textAnchor="end"
                  fill="rgba(255,255,255,0.22)" fontSize="8">
                  {p > 0 ? `+${p}` : p}%
                </text>
              </g>
            );
          })}

          {history.map((h, i) => {
            if (n > 6 && i % Math.ceil(n / 5) !== 0 && i !== n - 1) return null;
            return (
              <text key={h.date} x={xFn(i)} y={H - 4} textAnchor="middle"
                fill="rgba(255,255,255,0.2)" fontSize="8">
                {h.date.slice(5).replace('-', '/')}
              </text>
            );
          })}

          {lines.map(line => {
            let d = '';
            line.pcts.forEach((p, i) => {
              if (p == null) return;
              const px = xFn(i), py = yFn(p);
              const gap = line.pcts.slice(0, i).every(v => v == null);
              d += !d || gap ? `M${px},${py}` : ` L${px},${py}`;
            });
            return (
              <g key={line.key}>
                <path d={d} fill="none" stroke={line.color}
                  strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
                {line.pcts.map((p, i) => p != null
                  ? <circle key={i} cx={xFn(i)} cy={yFn(p)} r="2.5" fill={line.color} opacity="0.9" />
                  : null)}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5">
        {lines.map(line => (
          <div key={line.key} className="flex items-center gap-1.5 min-w-0">
            <div className="h-[3px] w-4 shrink-0 rounded-full" style={{ backgroundColor: line.color, opacity: 0.8 }} />
            <span className="truncate text-[9px] text-slate-500">{RM_SHORT[line.key]}</span>
            <span className="ml-auto shrink-0 text-[10px] font-bold text-slate-300">{line.last}кг</span>
            {line.delta !== 0 && (
              <span className={`shrink-0 text-[9px] font-semibold ${line.delta > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {line.delta > 0 ? '+' : ''}{line.delta}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Load + neuro trend charts: CMJ history (with baseline) and rolling ACWR.
function TrendCharts({ data }) {
  const cmj = (data?.cmjHistory || []).filter(p => p.cmj != null);
  const acwr = (data?.acwrHistory || []).filter(p => p.acwr != null);

  // ── CMJ chart ──────────────────────────────────────────────────────────────
  const cmjChart = (() => {
    if (cmj.length < 2) return null;
    const W = 320, H = 100, PAD = { top: 10, right: 12, bottom: 18, left: 28 };
    const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom;
    const n = cmj.length;
    const vals = cmj.map(p => p.cmj);
    const last = vals[n - 1];
    // baseline = avg of last 5 measurements excluding today's
    const prior = vals.slice(0, -1).slice(-5);
    const baseline = prior.length ? prior.reduce((s, v) => s + v, 0) / prior.length : last;
    const drop = baseline ? +(((last - baseline) / baseline) * 100).toFixed(1) : 0;
    const lo = Math.min(...vals, baseline) - 1;
    const hi = Math.max(...vals, baseline) + 1;
    const xFn = i => PAD.left + (i / (n - 1)) * cW;
    const yFn = v => PAD.top + cH - ((v - lo) / (hi - lo || 1)) * cH;
    const lineColor = last >= baseline ? '#34d399' : (drop < -5 ? '#fb7185' : '#fbbf24');
    let d = '';
    cmj.forEach((p, i) => { d += i === 0 ? `M${xFn(i)},${yFn(p.cmj)}` : ` L${xFn(i)},${yFn(p.cmj)}`; });
    const baseY = yFn(baseline);
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-3">
        <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-700">CMJ · см</p>
        <svg width={W} height={H} className="w-full" viewBox={`0 0 ${W} ${H}`}>
          <line x1={PAD.left} y1={baseY} x2={W - PAD.right} y2={baseY} stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="3,3" />
          <text x={W - PAD.right} y={baseY - 3} textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize="8">base {baseline.toFixed(1)}</text>
          {cmj.map((p, i) => {
            if (n > 6 && i % Math.ceil(n / 5) !== 0 && i !== n - 1) return null;
            return <text key={i} x={xFn(i)} y={H - 4} textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="7">{p.date.slice(5).replace('-', '/')}</text>;
          })}
          <path d={d} fill="none" stroke={lineColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
          {cmj.map((p, i) => <circle key={i} cx={xFn(i)} cy={yFn(p.cmj)} r="2.5" fill={lineColor} />)}
        </svg>
        <p className="mt-1 text-[10px] text-slate-500">
          CMJ сегодня: <span className="font-bold text-slate-300">{last.toFixed(1)} см</span>{' '}
          (<span className={drop >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{drop >= 0 ? '+' : ''}{drop}%</span> от baseline {baseline.toFixed(1)})
        </p>
      </div>
    );
  })();

  // ── ACWR chart ───────────────────────────────────────────────────────────
  const acwrChart = (() => {
    if (acwr.length < 2) return null;
    const W = 320, H = 80, PAD = { top: 8, right: 12, bottom: 16, left: 28 };
    const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom;
    const n = acwr.length;
    const vals = acwr.map(p => p.acwr);
    const lo = 0, hi = Math.max(1.8, ...vals) + 0.1;
    const xFn = i => PAD.left + (i / (n - 1)) * cW;
    const yFn = v => PAD.top + cH - ((v - lo) / (hi - lo || 1)) * cH;
    const zoneColor = v => v > 1.5 ? '#fb7185' : v >= 1.3 ? '#fbbf24' : v >= 0.8 ? '#34d399' : '#64748b';
    let d = '';
    acwr.forEach((p, i) => { d += i === 0 ? `M${xFn(i)},${yFn(p.acwr)}` : ` L${xFn(i)},${yFn(p.acwr)}`; });
    const last = vals[n - 1];
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-3">
        <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-700">ACWR · нагрузка</p>
        <svg width={W} height={H} className="w-full" viewBox={`0 0 ${W} ${H}`}>
          {[1.3, 1.5].map(t => (
            <g key={t}>
              <line x1={PAD.left} y1={yFn(t)} x2={W - PAD.right} y2={yFn(t)} stroke={t === 1.5 ? 'rgba(251,113,133,0.3)' : 'rgba(251,191,36,0.3)'} strokeWidth="1" strokeDasharray="2,3" />
              <text x={PAD.left - 3} y={yFn(t) + 3} textAnchor="end" fill="rgba(255,255,255,0.25)" fontSize="7">{t}</text>
            </g>
          ))}
          <path d={d} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          {acwr.map((p, i) => <circle key={i} cx={xFn(i)} cy={yFn(p.acwr)} r="2.2" fill={zoneColor(p.acwr)} />)}
        </svg>
        <p className="mt-1 text-[10px] text-slate-500">
          Сейчас: <span className="font-bold" style={{ color: zoneColor(last) }}>{last.toFixed(2)}</span>
          {' '}{last > 1.5 ? '· пик риска' : last >= 1.3 ? '· повышенная' : last >= 0.8 ? '· оптимально' : '· недогрузка'}
        </p>
      </div>
    );
  })();

  // ── Gym-ACWR chart (tonnage-based) ─────────────────────────────────────────
  const gymAcwr = (data?.gymAcwrHistory || []).filter(p => p.acwr != null);
  const gymAcwrChart = (() => {
    if (gymAcwr.length < 2) return null;
    const W = 320, H = 80, PAD = { top: 8, right: 12, bottom: 16, left: 28 };
    const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom;
    const n = gymAcwr.length;
    const vals = gymAcwr.map(p => p.acwr);
    const lo = 0, hi = Math.max(1.8, ...vals) + 0.1;
    const xFn = i => PAD.left + (i / (n - 1)) * cW;
    const yFn = v => PAD.top + cH - ((v - lo) / (hi - lo || 1)) * cH;
    const zoneColor = v => v > 1.5 ? '#fb7185' : v >= 1.3 ? '#fbbf24' : v >= 0.8 ? '#34d399' : '#64748b';
    let d = '';
    gymAcwr.forEach((p, i) => { d += i === 0 ? `M${xFn(i)},${yFn(p.acwr)}` : ` L${xFn(i)},${yFn(p.acwr)}`; });
    const last = vals[n - 1];
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-3">
        <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-700">Gym-ACWR · тоннаж</p>
        <svg width={W} height={H} className="w-full" viewBox={`0 0 ${W} ${H}`}>
          {[1.3, 1.5].map(t => (
            <g key={t}>
              <line x1={PAD.left} y1={yFn(t)} x2={W - PAD.right} y2={yFn(t)} stroke={t === 1.5 ? 'rgba(251,113,133,0.3)' : 'rgba(251,191,36,0.3)'} strokeWidth="1" strokeDasharray="2,3" />
              <text x={PAD.left - 3} y={yFn(t) + 3} textAnchor="end" fill="rgba(255,255,255,0.25)" fontSize="7">{t}</text>
            </g>
          ))}
          <path d={d} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          {gymAcwr.map((p, i) => <circle key={i} cx={xFn(i)} cy={yFn(p.acwr)} r="2.2" fill={zoneColor(p.acwr)} />)}
        </svg>
        <p className="mt-1 text-[10px] text-slate-500">
          Тоннаж зала: <span className="font-bold" style={{ color: zoneColor(last) }}>{last.toFixed(2)}</span>
          {' '}{last > 1.5 ? '· пик риска' : last >= 1.3 ? '· повышенная' : last >= 0.8 ? '· оптимально' : '· недогрузка'}
        </p>
      </div>
    );
  })();

  const tsbChart = <TSBChart data={data?.tsbHistory || []} />;

  if (!cmjChart && !acwrChart && !gymAcwrChart && !tsbChart) {
    return <p className="mt-3 text-[11px] text-slate-600">Нет данных по нагрузке и нейро.</p>;
  }

  return (
    <div className="mt-3 space-y-3">
      {cmjChart}
      {acwrChart}
      {gymAcwrChart}
      {tsbChart}
    </div>
  );
}

// TSB (Fitness-Fatigue-Form) chart — CTL/ATL/TSB from Banister model.
function TSBChart({ data }) {
  const pts = (data || []).filter(p => p && p.date);
  if (pts.length < 2) return null;
  const W = 320, H = 120, PAD = { top: 12, right: 12, bottom: 18, left: 30 };
  const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom;
  const n = pts.length;
  const allVals = pts.flatMap(p => [p.ctl, p.atl, p.tsb]);
  const lo = Math.min(0, ...allVals) - 5;
  const hi = Math.max(...allVals) + 5;
  const xFn = i => PAD.left + (i / (n - 1)) * cW;
  const yFn = v => PAD.top + cH - ((v - lo) / (hi - lo || 1)) * cH;
  const path = key => {
    let d = '';
    pts.forEach((p, i) => { d += i === 0 ? `M${xFn(i)},${yFn(p[key])}` : ` L${xFn(i)},${yFn(p[key])}`; });
    return d;
  };
  const y0 = yFn(0);
  const last = pts[n - 1];
  const formColor = last.tsb > 10 ? '#34d399' : last.tsb < -25 ? '#fb7185' : last.tsb < -10 ? '#fbbf24' : '#e2e8f0';
  const formLabel = last.tsb > 10 ? 'свежий' : last.tsb < -25 ? 'перегрузка' : last.tsb < -10 ? 'усталость' : 'оптимально';
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-3">
      <p className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-slate-700">Форма · TSB (Fitness-Fatigue)</p>
      <svg width={W} height={H} className="w-full" viewBox={`0 0 ${W} ${H}`}>
        <line x1={PAD.left} y1={y0} x2={W - PAD.right} y2={y0} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
        <path d={path('ctl')} fill="none" stroke="#34d399" strokeWidth="1.3" strokeDasharray="4,3" opacity="0.85" />
        <path d={path('atl')} fill="none" stroke="#fb7185" strokeWidth="1.3" strokeDasharray="4,3" opacity="0.85" />
        <path d={path('tsb')} fill="none" stroke="#e2e8f0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => {
          if (n > 8 && i % Math.ceil(n / 6) !== 0 && i !== n - 1) return null;
          return <text key={i} x={xFn(i)} y={H - 4} textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="7">{p.date.slice(5).replace('-', '/')}</text>;
        })}
      </svg>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
        <span>Fitness <span className="font-bold text-emerald-400">{last.ctl}</span></span>
        <span>Fatigue <span className="font-bold text-rose-400">{last.atl}</span></span>
        <span>Form <span className="font-bold" style={{ color: formColor }}>{last.tsb > 0 ? '+' : ''}{last.tsb}</span> · {formLabel}</span>
      </p>
    </div>
  );
}

function addDaysToDate(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function getWeekFocuses(focus) {
  if (focus.startsWith('inseason_') || focus.startsWith('zvs_') || focus === 'inseason') {
    return [
      { focus: 'inseason_strength',    label: 'Силовая · Вт' },
      { focus: 'inseason_power',       label: 'Мощностная · Ср' },
      { focus: 'inseason_prophylaxis', label: 'Профилактика · Пн' },
    ];
  }
  if (focus.startsWith('camp_ecc_')) {
    return [
      { focus: 'camp_ecc_anterior',  label: 'Пн — Передняя цепь' },
      { focus: 'camp_ecc_posterior', label: 'Вт — Задняя цепь' },
      { focus: 'camp_ecc_fullbody',  label: 'Пт — Всё тело' },
    ];
  }
  if (focus.startsWith('camp_iso_')) {
    return [
      { focus: 'camp_iso_anterior',  label: 'Пн/Пт — Передняя цепь' },
      { focus: 'camp_iso_posterior', label: 'Вт/Сб — Задняя цепь' },
      { focus: 'zvs_recovery',       label: 'Восстановление' },
    ];
  }
  if (focus === 'camp_explosive') {
    return [
      { focus: 'camp_explosive', label: 'Понедельник' },
      { focus: 'camp_explosive', label: 'Вторник' },
      { focus: 'camp_explosive', label: 'Пятница' },
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
  inseason:  {
    tab:  'border-cyan-400/60 bg-cyan-400/[0.15] text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.20),inset_0_1px_0_rgba(34,211,238,0.15)]',
    card: 'border-cyan-400/40 bg-cyan-400/[0.10] shadow-[0_0_12px_rgba(34,211,238,0.10)]',
    text: 'text-cyan-200',
    dot:  'bg-cyan-400',
    glow: '',
  },
  camp: {
    tab:  'border-amber-400/60 bg-amber-400/[0.18] text-amber-200 shadow-[0_0_16px_rgba(251,191,36,0.20),inset_0_1px_0_rgba(251,191,36,0.15)]',
    card: 'border-amber-400/40 bg-amber-400/[0.10] shadow-[0_0_12px_rgba(251,191,36,0.10)]',
    text: 'text-amber-200',
    dot:  'bg-amber-400',
    glow: '',
  },
  offseason: {
    tab:  'border-emerald-400/60 bg-emerald-400/[0.18] text-emerald-200 shadow-[0_0_16px_rgba(52,211,153,0.20),inset_0_1px_0_rgba(52,211,153,0.15)]',
    card: 'border-emerald-400/40 bg-emerald-400/[0.10] shadow-[0_0_12px_rgba(52,211,153,0.10)]',
    text: 'text-emerald-200',
    dot:  'bg-emerald-400',
    glow: '',
  },
  rehab: {
    tab:  'border-violet-400/60 bg-violet-400/[0.18] text-violet-200 shadow-[0_0_16px_rgba(167,139,250,0.20),inset_0_1px_0_rgba(167,139,250,0.15)]',
    card: 'border-violet-400/40 bg-violet-400/[0.10] shadow-[0_0_12px_rgba(167,139,250,0.10)]',
    text: 'text-violet-200',
    dot:  'bg-violet-400',
    glow: '',
  },
};

// Block A=bilateral lower(amber), B=upper body(orange), C=unilateral lower(sky), D=positional(teal), E=prehab(violet)
const BLOCK_CONFIG = {
  A: { circle: 'bg-amber-400',  line: 'from-amber-400/30',  sub: 'text-amber-300/70',  headerFrom: 'from-amber-400/[0.09]',  codeBg: 'bg-amber-400/20 text-amber-300' },
  B: { circle: 'bg-orange-400', line: 'from-orange-400/30', sub: 'text-orange-300/70', headerFrom: 'from-orange-400/[0.09]', codeBg: 'bg-orange-400/20 text-orange-300' },
  C: { circle: 'bg-sky-400',    line: 'from-sky-400/30',    sub: 'text-sky-300/70',    headerFrom: 'from-sky-400/[0.09]',    codeBg: 'bg-sky-400/20 text-sky-300' },
  D: { circle: 'bg-teal-400',   line: 'from-teal-400/30',   sub: 'text-teal-300/70',   headerFrom: 'from-teal-400/[0.09]',   codeBg: 'bg-teal-400/20 text-teal-300' },
  E: { circle: 'bg-violet-400', line: 'from-violet-400/30', sub: 'text-violet-300/70', headerFrom: 'from-violet-400/[0.09]', codeBg: 'bg-violet-400/20 text-violet-300' },
};
function blockCfg(label) { return BLOCK_CONFIG[label] || BLOCK_CONFIG.A; }

const WARMUP_SECTION_STYLES = {
  rolling:    { bar: 'bg-violet-400', text: 'text-violet-400', chip: 'bg-violet-400/[0.07] border-violet-400/20', icon: '⬤' },
  mobility:   { bar: 'bg-sky-400',    text: 'text-sky-400',    chip: 'bg-sky-400/[0.07] border-sky-400/20',    icon: '◎' },
  activation: { bar: 'bg-amber-400',  text: 'text-amber-400',  chip: 'bg-amber-400/[0.07] border-amber-400/20',  icon: '▶' },
  speed:      { bar: 'bg-cyan-400',   text: 'text-cyan-400',   chip: 'bg-cyan-400/[0.07] border-cyan-400/20',   icon: '⚡' },
};
const WARMUP_FOCUS_MAP = { anterior: 'Утро: передняя цепь', posterior: 'Утро: задняя цепь', fullbody: 'Утро: всё тело', general: '' };
const WARMUP_PHASE_MAP = { 1: 'Эксцентрика · нед. 1-3', 2: 'Изометрика · нед. 4-5', 3: 'Взрыв · нед. 6' };

const PHASES_BY_PERIOD = {
  inseason: [
    { value: 'inseason_strength',     label: 'Силовая',              sub: 'Вт · MD-4 · 40 мин' },
    { value: 'inseason_power',        label: 'Мощностная',           sub: 'Ср · MD-3 · 40 мин' },
    { value: 'inseason_prophylaxis',  label: 'Профилактика',         sub: 'Пн MD+2 / Пт MD-1' },
    { value: 'inseason_deload',       label: 'Разгрузочная неделя',  sub: 'Каждые 4 недели' },
    { value: 'inseason_accumulation', label: 'Накопление · Февраль', sub: '60 мин · 80–87% 1ПМ' },
    { value: 'inseason_conversion',   label: 'Конверсия · Март',     sub: 'Сила → Мощность' },
    { value: 'inseason_taper',        label: 'Тейпер к пику',        sub: '10 дней · Суперкубок / Кубок / Плей-офф' },
    { value: 'inseason_md1_activation', label: 'Активация MD-1',      sub: 'День до игры · 15-20 мин' },
  ],
  camp: [
    { value: 'camp_ecc_anterior',  label: 'Эксцентрика · Передняя цепь',  sub: 'Понедельник / Нед.1-3' },
    { value: 'camp_ecc_posterior', label: 'Эксцентрика · Задняя цепь',    sub: 'Вторник / Нед.1-3' },
    { value: 'camp_ecc_fullbody',  label: 'Эксцентрика · Всё тело',       sub: 'Пятница / Нед.1-3' },
    { value: 'camp_iso_anterior',  label: 'Изометрика · Передняя цепь',   sub: 'Пн+Пт / Нед.4-5' },
    { value: 'camp_iso_posterior', label: 'Изометрика · Задняя цепь',     sub: 'Вт+Сб / Нед.4-5' },
    { value: 'camp_explosive',     label: 'Взрыв / Потенциация',           sub: 'Неделя 6 · Тейпер' },
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

function getMondayOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
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

// ── Monthly planner config ──
const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

const PLANNER_TYPES = [
  { value: 'training', label: 'Тренировка' },
  { value: 'game',     label: 'Игра' },
  { value: 'travel',   label: 'Перелёт' },
  { value: 'rest',     label: 'Выходной' },
];

// Cell colors keyed by type, then by focus for training days.
const PLANNER_CELL = {
  game:   'border-rose-500/40 bg-rose-500/[0.12] text-rose-200',
  travel: 'border-amber-500/40 bg-amber-500/[0.12] text-amber-200',
  rest:   'border-white/[0.06] bg-white/[0.02] text-slate-600',
  empty:  'border-white/[0.05] bg-transparent text-slate-700',
};
const PLANNER_FOCUS_CELL = {
  inseason_strength:     'border-cyan-500/40 bg-cyan-500/[0.12] text-cyan-200',
  inseason_power:        'border-violet-500/40 bg-violet-500/[0.12] text-violet-200',
  inseason_prophylaxis:  'border-emerald-500/40 bg-emerald-500/[0.12] text-emerald-200',
  inseason_deload:       'border-slate-500/40 bg-slate-500/[0.12] text-slate-300',
  inseason_taper:        'border-yellow-500/40 bg-yellow-500/[0.12] text-yellow-200',
  inseason_accumulation: 'border-orange-500/40 bg-orange-500/[0.12] text-orange-200',
  inseason_conversion:   'border-purple-500/40 bg-purple-500/[0.12] text-purple-200',
};
const PLANNER_FOCUS_SHORT = {
  inseason_strength:     'Сила',
  inseason_power:        'Мощность',
  inseason_prophylaxis:  'Профил.',
  inseason_deload:       'Deload',
  inseason_taper:        'Тейпер',
  inseason_accumulation: 'Накопл.',
  inseason_conversion:   'Конверс.',
};

function plannerCellClass(day) {
  if (!day) return PLANNER_CELL.empty;
  if (day.type === 'training') return PLANNER_FOCUS_CELL[day.focus] || 'border-cyan-500/30 bg-cyan-500/[0.07] text-cyan-300';
  return PLANNER_CELL[day.type] || PLANNER_CELL.empty;
}

// Build a 6-row grid (Mon-Sun) of ISO date strings (or null for padding) for a YYYY-MM month.
function getMonthGrid(month) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstDow = first.getUTCDay();
  const lead = firstDow === 0 ? 6 : firstDow - 1; // Mon=0
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${month}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
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
    <div className="mb-2.5 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.22em] text-slate-600">
      <span className="text-accent/60">{icon}</span>
      {text}
    </div>
  );
}

const inputBase =
  'block w-full rounded-xl border border-white/[0.09] bg-white/[0.04] px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-all duration-200 hover:border-white/[0.14] hover:bg-white/[0.06] focus:border-accent/40 focus:bg-white/[0.07] focus:ring-2 focus:ring-accent/[0.12]';

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

const YT_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1C4.5 20.5 12 20.5 12 20.5s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.8 15.5V8.5l6.3 3.5-6.3 3.5z"/>
  </svg>
);

function ExerciseVideoLink({ name, apiKey }) {
  const bankUrl = findExerciseUrl(name);
  const [searchUrl, setSearchUrl] = useState(undefined);

  useEffect(() => {
    if (bankUrl || !name?.trim() || !apiKey) return;
    let cancelled = false;
    fetch(`/api/exercises/youtube-search?name=${encodeURIComponent(name)}`, {
      headers: { 'x-api-key': apiKey },
    })
      .then(r => r.json())
      .then(d => { if (!cancelled) setSearchUrl(d.url || null); })
      .catch(() => { if (!cancelled) setSearchUrl(null); });
    return () => { cancelled = true; };
  }, [name, apiKey, bankUrl]);

  const url = bankUrl || searchUrl;
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 rounded-lg bg-red-600/[0.15] px-3 py-1.5 text-[11px] font-semibold text-red-400 transition hover:bg-red-600/[0.25] hover:text-red-300"
    >
      {YT_ICON}
      Видео
    </a>
  );
}

const PENCIL_ICON = (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

function ExerciseImageUpload({ name, apiKey }) {
  // ── Image state ──────────────────────────────────────────────────────────
  const [hasImage, setHasImage] = useState(undefined); // undefined=checking, null=none, timestamp=exists
  const [imageBlobUrl, setImageBlobUrl] = useState(null); // object URL for <img src>
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  // Check existence on mount
  useEffect(() => {
    if (!name?.trim() || !apiKey) return;
    let cancelled = false;
    fetch(`/api/exercises/manual-image?name=${encodeURIComponent(name)}`, { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(d => { if (!cancelled) setHasImage(d.hasImage ? Date.now() : null); })
      .catch(() => { if (!cancelled) setHasImage(null); });
    return () => { cancelled = true; };
  }, [name, apiKey]);

  // Fetch the actual image bytes with auth header → blob URL for <img>
  useEffect(() => {
    if (!hasImage || !apiKey) { setImageBlobUrl(null); return; }
    let objectUrl = null;
    let cancelled = false;
    fetch(`/api/exercises/manual-image?name=${encodeURIComponent(name)}&serve=1&t=${hasImage}`, { headers: { 'x-api-key': apiKey } })
      .then(r => r.ok ? r.blob() : null)
      .then(blob => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setImageBlobUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [hasImage, name, apiKey]);

  function compressImage(file, maxPx = 600, quality = 0.78) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    compressImage(file).then(async (imageData) => {
      if (!imageData) {
        setUploadError('Не удалось обработать изображение');
        setUploading(false);
        return;
      }
      try {
        const res = await fetch('/api/exercises/manual-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
          body: JSON.stringify({ name, imageData }),
        });
        const data = await res.json();
        if (data.ok) {
          // Revoke old blob URL before setting new timestamp (triggers re-fetch effect)
          setImageBlobUrl(null);
          setHasImage(Date.now());
        } else {
          setUploadError(data.error || `Ошибка ${res.status}`);
        }
      } catch (err) {
        setUploadError(err.message);
      }
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    });
  }

  async function handleDeleteImage() {
    await fetch(`/api/exercises/manual-image?name=${encodeURIComponent(name)}`, {
      method: 'DELETE', headers: { 'x-api-key': apiKey },
    }).catch(() => {});
    setHasImage(null);
  }

  // ── Video URL state ───────────────────────────────────────────────────────
  const bankUrl = findExerciseUrl(name);
  const [manualVideoUrl, setManualVideoUrl] = useState(undefined); // undefined = checking
  const [autoVideoUrl, setAutoVideoUrl] = useState(undefined);
  const [editingVideo, setEditingVideo] = useState(false);
  const [videoInput, setVideoInput] = useState('');
  const [savingVideo, setSavingVideo] = useState(false);

  // Fetch manual override
  useEffect(() => {
    if (!name?.trim() || !apiKey) return;
    let cancelled = false;
    fetch(`/api/exercises/manual-video?name=${encodeURIComponent(name)}`, { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(d => { if (!cancelled) setManualVideoUrl(d.url || null); })
      .catch(() => { if (!cancelled) setManualVideoUrl(null); });
    return () => { cancelled = true; };
  }, [name, apiKey]);

  // Auto-search only when no manual override and no bank URL
  useEffect(() => {
    if (manualVideoUrl || bankUrl || !name?.trim() || !apiKey) return;
    let cancelled = false;
    fetch(`/api/exercises/youtube-search?name=${encodeURIComponent(name)}`, { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(d => { if (!cancelled) setAutoVideoUrl(d.url || null); })
      .catch(() => { if (!cancelled) setAutoVideoUrl(null); });
    return () => { cancelled = true; };
  }, [name, apiKey, bankUrl, manualVideoUrl]);

  // Priority: manual → bank → auto-search
  const videoUrl = manualVideoUrl || bankUrl || autoVideoUrl;
  const isManual = !!manualVideoUrl;

  async function handleSaveVideo() {
    const trimmed = videoInput.trim();
    if (!trimmed) return;
    setSavingVideo(true);
    try {
      await fetch('/api/exercises/manual-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ name, url: trimmed }),
      });
      setManualVideoUrl(trimmed);
      setEditingVideo(false);
    } catch (_) {}
    setSavingVideo(false);
  }

  async function handleDeleteVideo() {
    await fetch(`/api/exercises/manual-video?name=${encodeURIComponent(name)}`, {
      method: 'DELETE', headers: { 'x-api-key': apiKey },
    }).catch(() => {});
    setManualVideoUrl(null);
    setEditingVideo(false);
  }

  function openEditVideo() {
    setVideoInput(videoUrl || '');
    setEditingVideo(true);
  }

  return (
    <div className="print:hidden">
      {/* Square image area */}
      {uploadError && (
        <div className="mx-3.5 mb-1 rounded-lg bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-400">{uploadError}</div>
      )}
      <div className="relative mx-3.5 mt-1 mb-2 aspect-square overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0d1520] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] print:block print:border-slate-200">
        {imageBlobUrl ? (
          <div className="group/img relative h-full w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageBlobUrl} alt={name} className="h-full w-full object-contain opacity-90 mix-blend-luminosity" style={{ filter: 'brightness(0.85) contrast(1.1)' }} />
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity group-hover/img:opacity-100">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/20"
              >
                Заменить
              </button>
              <button
                onClick={handleDeleteImage}
                className="rounded-lg bg-rose-500/20 px-3 py-1.5 text-[11px] font-semibold text-rose-400 hover:bg-rose-500/30"
              >
                Удалить
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-600 transition hover:bg-white/[0.04] hover:text-slate-400 disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 size={22} className="animate-spin" />
            ) : (
              <>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                <span className="text-[11px] font-medium">Добавить фото</span>
              </>
            )}
          </button>
        )}
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      {/* Inline URL editor */}
      {editingVideo && (
        <div className="flex items-center gap-1.5 border-t border-white/[0.06] px-3.5 py-2">
          <input
            autoFocus
            type="url"
            value={videoInput}
            onChange={e => setVideoInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveVideo(); if (e.key === 'Escape') setEditingVideo(false); }}
            placeholder="https://youtube.com/watch?v=..."
            className="min-w-0 flex-1 rounded-md bg-white/[0.06] px-2.5 py-1.5 text-[11px] text-slate-200 outline-none placeholder:text-slate-600 focus:bg-white/[0.1] focus:ring-1 focus:ring-accent/40"
          />
          <button
            onClick={handleSaveVideo}
            disabled={savingVideo || !videoInput.trim()}
            className="rounded-md bg-accent/20 px-2.5 py-1.5 text-[11px] font-semibold text-accent hover:bg-accent/30 disabled:opacity-40"
          >
            {savingVideo ? <Loader2 size={11} className="animate-spin" /> : 'Сохранить'}
          </button>
          {isManual && (
            <button onClick={handleDeleteVideo} className="rounded-md bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-400 hover:bg-rose-500/20">
              Сбросить
            </button>
          )}
          <button onClick={() => setEditingVideo(false)} className="rounded-md px-2 py-1.5 text-[11px] text-slate-500 hover:text-slate-300">
            ✕
          </button>
        </div>
      )}

      {/* Bottom bar: video link */}
      <div className="flex items-center gap-2 px-3.5 pb-2">
        {videoUrl ? (
          <div className="flex items-center gap-0.5">
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-1.5 rounded-l-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${isManual ? 'bg-accent/[0.18] text-accent hover:bg-accent/[0.28]' : 'bg-accent/[0.10] text-accent/80 hover:bg-accent/[0.18] hover:text-accent'}`}
            >
              {YT_ICON}
              Видео{isManual ? ' ★' : ''}
            </a>
            <button
              onClick={openEditVideo}
              title="Изменить ссылку"
              className={`rounded-r-lg px-2 py-1.5 transition ${isManual ? 'bg-accent/[0.18] text-accent/60 hover:bg-accent/[0.28]' : 'bg-accent/[0.10] text-accent/40 hover:bg-accent/[0.18] hover:text-accent/70'}`}
            >
              {PENCIL_ICON}
            </button>
          </div>
        ) : (
          <button
            onClick={openEditVideo}
            className="flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:bg-white/[0.1] hover:text-slate-300"
          >
            {YT_ICON}
            Добавить видео
          </button>
        )}
      </div>
    </div>
  );
}

function AutoResizeTextarea({ value, onChange, className, placeholder, minRows = 1 }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={minRows}
      placeholder={placeholder}
      className={className + ' overflow-hidden'}
    />
  );
}

// Parse numeric kg value from legacy free-text weightNote strings.
function parseKgFromNote(note) {
  if (!note) return null;
  const m = String(note).match(/(\d+(?:[.,]\d+)?)\s*(?:кг|kg)\b/i);
  if (m) return parseFloat(m[1].replace(',', '.'));
  const pure = String(note).trim().match(/^(\d+(?:[.,]\d+)?)$/);
  return pure ? parseFloat(pure[1].replace(',', '.')) : null;
}

function ExerciseCard({
  apiKey,
  code,
  name,
  targetSets,
  weightNote,
  weightKg,
  tempo,
  autoReg,
  cue,
  focus,
  week,
  oneRM,
  position,
  prevKg,
  prevRpe,
  suggestedKg,
  restrictions,
  exHistory,
  actualKg,
  onActualKgChange,
  actualRpe,
  onActualRpeChange,
  onChangeName,
  onChangeSet,
  onAddSet,
  onChangeWeight,
  onChangeWeightKg,
  onChangeTempo,
  onChangeAutoReg,
  onChangeCue,
  onRegenerate,
}) {
  const [regenerating, setRegenerating] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapSearch, setSwapSearch] = useState('');
  const [swapLibrary, setSwapLibrary] = useState([]);
  const [swapLoading, setSwapLoading] = useState(false);
  const [altLoading, setAltLoading] = useState(false);
  const [altSuggestion, setAltSuggestion] = useState(null);

  async function handleSuggestAlt() {
    if (altLoading) return;
    setAltLoading(true);
    setAltSuggestion(null);
    try {
      const r = await fetch('/api/programs/suggest-alternative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ exerciseName: name, restrictions: restrictions || [], position, focus }),
      });
      const d = await r.json();
      setAltSuggestion(d.alternative || d.error || 'Не удалось получить замену');
    } catch (_) {
      setAltSuggestion('Ошибка запроса');
    } finally {
      setAltLoading(false);
    }
  }
  const blockLetter = (code || 'A')[0];
  const bc = blockCfg(blockLetter);
  const hasConflict = hasRestriction(name, restrictions || []);
  const rmSuggestion = useMemo(() => calcWeight(name, focus, week, oneRM, position), [name, focus, week, oneRM, position]);
  const effectiveSuggestedKg = suggestedKg || rmSuggestion?.kg || null;

  async function handleRegenerate() {
    if (regenerating || !onRegenerate) return;
    setRegenerating(true);
    try { await onRegenerate(); } finally { setRegenerating(false); }
  }

  async function openSwap() {
    const next = !swapOpen;
    setSwapOpen(next);
    if (!next) return;
    setSwapSearch('');
    if (swapLibrary.length) return;
    setSwapLoading(true);
    try {
      const r = await fetch('/api/exercises/library', { headers: { 'x-api-key': apiKey } });
      const d = await r.json();
      setSwapLibrary(Array.isArray(d.cards) ? d.cards : []);
    } catch (_) {} finally { setSwapLoading(false); }
  }

  function doSwap(title) {
    if (onChangeName) onChangeName(title);
    setSwapOpen(false);
    setSwapSearch('');
  }

  return (
    <div className={`group overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-white/[0.015] backdrop-blur-sm transition-all duration-300 hover:border-white/[0.14] hover:from-white/[0.06] hover:to-white/[0.025] hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)] print:break-inside-avoid print:border-slate-300 print:bg-white ${hasConflict ? 'ring-1 ring-rose-500/30' : ''}`}>
      {/* Header */}
      <div className={`bg-gradient-to-r ${bc.headerFrom} to-transparent px-3.5 pt-2.5 pb-2 print:bg-slate-100`}>
        {/* Row 1: badges + regenerate button */}
        <div className="flex items-center gap-1.5">
          <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-black tracking-wide ${bc.codeBg} print:bg-slate-200 print:text-slate-700`}>
            {code}
          </span>
          {tempo && (
            <span className="shrink-0 rounded-md border border-white/[0.10] bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-mono font-semibold tracking-wider text-slate-400 print:border-slate-200 print:text-slate-600">
              {tempo}
            </span>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={openSwap}
            title="Заменить упражнение из библиотеки"
            className={`shrink-0 rounded-md p-1 transition-all hover:bg-white/[0.08] print:hidden ${swapOpen ? 'text-accent opacity-100' : hasConflict ? 'text-rose-400 opacity-100' : 'text-slate-600 opacity-0 group-hover:opacity-100'}`}
          >
            <ArrowLeftRight size={13} />
          </button>
          {onRegenerate && (
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={regenerating}
              title="Перегенерировать упражнение"
              className="shrink-0 rounded-md p-1 text-slate-600 opacity-0 transition-all hover:bg-white/[0.08] hover:text-slate-300 group-hover:opacity-100 disabled:cursor-not-allowed print:hidden"
            >
              {regenerating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            </button>
          )}
        </div>

        {/* Swap panel */}
        {swapOpen && (
          <div className="mt-2 mb-1 rounded-xl border border-white/[0.10] bg-[#071018] p-2 print:hidden">
            <input
              autoFocus
              value={swapSearch}
              onChange={e => setSwapSearch(e.target.value)}
              placeholder="Поиск по библиотеке..."
              className="w-full rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-[13px] text-slate-200 outline-none placeholder:text-slate-600 focus:bg-white/[0.08]"
            />
            <div className="mt-1.5 max-h-44 overflow-y-auto">
              {swapLoading ? (
                <div className="py-3 text-center text-[12px] text-slate-600">Загрузка...</div>
              ) : swapLibrary.filter(ex => !swapSearch.trim() || (ex.title || '').toLowerCase().includes(swapSearch.toLowerCase())).length === 0 ? (
                <div className="py-3 text-center text-[12px] text-slate-600">Не найдено</div>
              ) : (
                swapLibrary
                  .filter(ex => !swapSearch.trim() || (ex.title || '').toLowerCase().includes(swapSearch.toLowerCase()))
                  .slice(0, 18)
                  .map(ex => (
                    <button
                      key={ex.canonicalId}
                      type="button"
                      onClick={() => doSwap(ex.title)}
                      className="w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                    >
                      {ex.title}
                    </button>
                  ))
              )}
            </div>
          </div>
        )}

        {/* Row 2: full exercise name */}
        <AutoResizeTextarea
          value={name}
          onChange={onChangeName}
          minRows={1}
          className="mt-1.5 w-full resize-none bg-transparent text-[15px] font-semibold tracking-tight leading-snug text-white outline-none placeholder:text-slate-500 print:text-slate-900"
        />
        {hasConflict && (
          <div className="mt-1 flex flex-wrap items-center gap-2 print:hidden">
            <span className="text-[10px] font-semibold text-rose-400">⚠ Ограничение · заменить ↑</span>
            <button
              type="button"
              onClick={handleSuggestAlt}
              disabled={altLoading}
              className="text-[10px] text-rose-400/70 hover:text-rose-300 underline disabled:opacity-50"
            >
              {altLoading ? 'Подбор…' : 'AI замена'}
            </button>
          </div>
        )}
        {altSuggestion && (
          <div className="mt-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.08] px-2 py-1.5 text-[11px] leading-snug text-emerald-300 print:hidden">
            {altSuggestion}
          </div>
        )}
      </div>

      {/* Image upload + YouTube link */}
      <ExerciseImageUpload name={name} apiKey={apiKey} />

      {/* Sets & notes */}
      <div className="space-y-2.5 p-4">
        <div className="flex flex-wrap gap-1.5">
          {targetSets.map((s, i) => (
            <div
              key={i}
              className="flex items-center overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.04] transition-colors focus-within:border-accent/40 print:border-slate-300"
            >
              <span className="px-1.5 py-1 text-[10px] font-semibold text-slate-500">{i + 1}</span>
              <input
                value={s}
                onChange={e => onChangeSet(i, e.target.value)}
                placeholder="—"
                className="w-12 bg-transparent px-1 py-1 text-center text-[13px] font-semibold text-slate-100 outline-none print:text-slate-900"
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

        {/* Structured weight input */}
        <div className="flex items-center gap-2 print:hidden">
          <div className="flex items-center rounded-lg border border-white/[0.08] bg-white/[0.04] pr-2.5 transition-all focus-within:border-accent/50 focus-within:bg-accent/[0.05]">
            <input
              type="number"
              step="2.5"
              min="0"
              value={weightKg ?? ''}
              onChange={e => {
                const raw = e.target.value;
                const v = raw === '' ? null : parseFloat(raw);
                onChangeWeightKg(isNaN(v) ? null : v);
              }}
              placeholder="—"
              className="w-16 bg-transparent px-2.5 py-1.5 text-right text-[16px] font-bold text-slate-100 outline-none tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="text-[12px] font-medium text-slate-500">кг</span>
          </div>
          {onActualKgChange && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium text-emerald-400/60">факт</span>
              <input
                type="number"
                step="2.5"
                min="0"
                value={actualKg ?? ''}
                onChange={e => {
                  const raw = e.target.value;
                  const v = raw === '' ? null : parseFloat(raw);
                  onActualKgChange(isNaN(v) ? null : v);
                }}
                placeholder="факт кг"
                className="w-20 bg-transparent text-[11px] text-emerald-400/70 border-b border-white/[0.07] outline-none focus:border-emerald-400/50"
              />
              {onActualRpeChange && (
                <div className="ml-2 flex items-center gap-1.5">
                  <span className="text-[10px] font-medium text-sky-400/60">RPE</span>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="10"
                    value={actualRpe ?? ''}
                    onChange={e => {
                      const raw = e.target.value;
                      const v = raw === '' ? null : parseFloat(raw);
                      onActualRpeChange(isNaN(v) ? null : v);
                    }}
                    placeholder="1-10"
                    className="w-14 bg-transparent text-[11px] text-sky-400/70 border-b border-white/[0.07] outline-none focus:border-sky-400/50"
                  />
                </div>
              )}
            </div>
          )}
        </div>
        {/* Print fallback */}
        {weightKg != null && (
          <div className="hidden text-[14px] font-medium text-slate-300 print:block">{weightKg} кг</div>
        )}

        {/* Progression hint */}
        {prevKg ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 print:hidden">
            <span className="text-[11px] text-slate-600">
              ↑ {prevKg} кг{prevRpe ? ` · RPE ${prevRpe}` : ''}
              {effectiveSuggestedKg && effectiveSuggestedKg !== prevKg && (
                <span className={effectiveSuggestedKg > prevKg ? ' text-emerald-400/80' : ' text-rose-400/70'}>
                  {' → '}{effectiveSuggestedKg} кг
                </span>
              )}
            </span>
            {effectiveSuggestedKg && (
              <button
                type="button"
                onClick={() => onChangeWeightKg(effectiveSuggestedKg)}
                className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-cyan-400/70 transition hover:bg-cyan-400/10 hover:text-cyan-400"
              >
                Принять
              </button>
            )}
            {!suggestedKg && rmSuggestion && (
              <div className="w-full text-[10px] text-slate-600">
                {rmSuggestion.pctLow}–{rmSuggestion.pctHigh}% от 1ПМ
                {rmSuggestion.maxSets && <span className="ml-1 text-amber-400/70">· макс. {rmSuggestion.maxSets} сета</span>}
              </div>
            )}
          </div>
        ) : (
          /* 1RM hint when no previous session data */
          (() => {
            const hint = rmSuggestion;
            if (!hint) return null;
            return (
              <div className="mt-1 text-[12px] text-slate-600 print:hidden">
                Расч. вес: <span className="font-semibold text-slate-500">{hint.kg} кг</span>
                <span className="ml-1">({hint.pctLow}–{hint.pctHigh}% 1ПМ)</span>
                {hint.maxSets && <span className="ml-1 text-amber-400/70">· макс. {hint.maxSets} сета</span>}
              </div>
            );
          })()
        )}

        {/* Weight history sparkline */}
        {exHistory && exHistory.length >= 2 && (
          <div className="mt-1.5 flex items-center gap-2 print:hidden">
            <Sparkline values={exHistory.map(e => e.kg)} width={56} height={16} />
            <span className="text-[10px] text-slate-600">
              {exHistory[0].kg}→{exHistory[exHistory.length - 1].kg} кг
              <span className="ml-1 text-slate-700">· {exHistory.length} тр.</span>
            </span>
          </div>
        )}

        {autoReg && (
          <div className="flex items-start gap-1.5 border-l-2 border-amber-400/40 pl-2.5 py-0.5">
            <span className="text-[10px] text-amber-400/70 mt-px shrink-0">⚡</span>
            <AutoResizeTextarea
              value={autoReg}
              onChange={onChangeAutoReg}
              className="min-w-0 flex-1 resize-none border-0 bg-transparent text-[13px] leading-snug text-amber-300/70 outline-none placeholder:text-amber-700/50 print:text-amber-800"
            />
          </div>
        )}

        <AutoResizeTextarea
          value={cue}
          onChange={onChangeCue}
          placeholder="Техническая подсказка"
          className="w-full resize-none border-0 bg-transparent px-0 py-0.5 text-[13px] leading-snug text-slate-500 outline-none transition placeholder:text-slate-700 focus:text-slate-400 print:border-slate-300 print:text-slate-700"
        />
      </div>
    </div>
  );
}

const CAMP_FORBIDDEN = [
  { re: /back squat|классический присед|присед.*со штанг.*спин/i, label: 'Классический присед (Back Squat)' },
  { re: /bench press|жим лёжа(?!.*наклон)/i, label: 'Жим лёжа (Bench Press)' },
  { re: /bent.?over row|тяга.*наклон|barbell row/i, label: 'Тяга в наклоне' },
  { re: /nordic curl|nordic hamstring|нордик/i, label: 'Nordic Curl' },
  { re: /ab wheel|ab roller|ролик.*пресс|rollout/i, label: 'Ab Wheel Rollout' },
  { re: /broad jump|прыжок в длину/i, label: 'Broad Jump (заменять вертикальными)' },
  { re: /floor press|жим.*пол[уе]|жим на полу/i, label: 'DB Floor Press' },
  { re: /wrist stability|стабилизация запястья|band.*wrist/i, label: 'Band Wrist Stability' },
  { re: /jump set drill|прыжок.*передач|имитация передачи/i, label: 'Jump Set Drill' },
  { re: /kb press|жим.*гир[яеи]\b|kettlebell press/i, label: 'KB Press (заменять DB/Landmine)' },
  { re: /tricep.*band.*pushdown|band.*tricep|pushdown.*петл|разгибание.*локт.*петл/i, label: 'Tricep Band Pushdown' },
];

const JUMP_TAGS = ['прыжок', 'jump', 'hop', 'bound', 'cmj', 'плиометр', 'tuck jump', 'split jump', 'box jump', 'depth jump'];

export default function Home() {
  const [apiKey, setApiKey] = useState('coach-ui');
  const [keyPanelOpen, setKeyPanelOpen] = useState(false);
  const [players, setPlayers] = useState([]);
  const [playersError, setPlayersError] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [dayGoal, setDayGoal] = useState('');
  const [days, setDays] = useState(7);
  const [period, setPeriod] = useState('camp');
  const [focus, setFocus] = useState('camp_ecc_anterior');
  const [notes, setNotes] = useState('');
  const [sessionType, setSessionType] = useState('gym'); // 'gym' | 'warmup'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [genProgress, setGenProgress] = useState(0);
  const [genStage, setGenStage] = useState('');
  const genTimers = useRef([]);

  const [autoFocusNote, setAutoFocusNote] = useState(null);

  // Main section navigation
  const [mainSection, setMainSection] = useState('workouts'); // 'workouts' | 'warmup'

  // Left panel tabs
  const [leftTab, setLeftTab] = useState('players'); // 'players' | 'day'
  const [teamStatus, setTeamStatus] = useState({});

  // Warmup
  const [warmupDate, setWarmupDate] = useState(todayISO());
  const [warmupPhase, setWarmupPhase] = useState(1);
  const [warmupPlan, setWarmupPlan] = useState(null);
  const [warmupLoading, setWarmupLoading] = useState(false);
  const [warmupError, setWarmupError] = useState('');
  const [warmupHistory, setWarmupHistory] = useState([]);
  const [teamStatusLoading, setTeamStatusLoading] = useState(false);

  // Batch generation
  const [batchId, setBatchId] = useState(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchSelectedIds, setBatchSelectedIds] = useState(new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchResults, setBatchResults] = useState([]); // [{playerId, name, position, status, error}]
  const [showSummary, setShowSummary] = useState(false);

  const [scheduleEvents, setScheduleEvents] = useState([]);
  const [showSchedule, setShowSchedule] = useState(false);

  const [session, setSession] = useState(null);
  const [meta, setMeta] = useState(null);
  const [pendingSaved, setPendingSaved] = useState(null);
  const [compliance, setCompliance] = useState(null); // null | { percent, actualTonnage, plannedTonnage }
  const [savingActual, setSavingActual] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progressionMap, setProgressionMap] = useState({}); // exerciseName → { kg, rpe, suggestedKg }
  const [tonnageData, setTonnageData] = useState(null);
  const [tonnageLoading, setTonnageLoading] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  // True after an async gym generation completes — generate-status already persisted the
  // session, so the manual "Сохранить" button is redundant (show "✓ Сохранено" instead).
  const [autoSaved, setAutoSaved] = useState(false);
  const [resuming, setResuming] = useState(false);

  // Sidebar navigation
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [mobileView, setMobileView] = useState('players'); // 'players' | 'workspace'

  // Share link — stores the playerId whose link was just copied
  const [linkCopied, setLinkCopied] = useState(null);

  // Player feedbacks: { [playerId]: { rpe, feel, date } }
  const [playerFeedbacks, setPlayerFeedbacks] = useState({});

  // Position filter for player list
  const [positionFilter, setPositionFilter] = useState('all');

  // Copy program to another player
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyDone, setCopyDone] = useState(null);

  // Player photo editing
  const [editPhotoFor, setEditPhotoFor] = useState(null);
  const [photoInput, setPhotoInput] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoFileRef = useRef(null);

  // Per-exercise weight history (for sparklines)
  const [exHistoryMap, setExHistoryMap] = useState({});

  // 1RM database
  const [oneRM, setOneRM] = useState({});
  const [rmHistory, setRmHistory] = useState([]);
  const [oneRMPanelOpen, setOneRMPanelOpen] = useState(false);
  // Load + neuro trends panel (Feature 2)
  const [trendsOpen, setTrendsOpen] = useState(false);
  const [trendsData, setTrendsData] = useState(null);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [lsiValue, setLsiValue] = useState('');
  // Player recovery status (simplified manual proxy for external dashboard)
  const [recoveryStatus, setRecoveryStatus] = useState('green'); // 'green' | 'yellow' | 'red'
  // Microcycle templates
  const [templates, setTemplates] = useState([]);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  // Player contraindications
  const [restrictions, setRestrictions] = useState([]);
  const [oneRMSaveTimer, setOneRMSaveTimer] = useState(null);

  // Warmup → Gym integration
  const [todayWarmup, setTodayWarmup] = useState(null);

  // Weekly plan
  const [weekPlan, setWeekPlan] = useState(null);
  const [weekPlanLoading, setWeekPlanLoading] = useState(false);
  const [weekPlanOpen, setWeekPlanOpen] = useState([0]);

  // Player history workspace
  const [workspaceTab, setWorkspaceTab] = useState('program'); // 'program' | 'history'
  const [historyData, setHistoryData] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(null); // expanded session date
  const [exProgressData, setExProgressData] = useState({}); // { [name]: [{date, kg}] }

  // Mobile sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Block collapse in session view
  const [collapsedBlocks, setCollapsedBlocks] = useState(new Set());
  function toggleBlock(label) {
    setCollapsedBlocks(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  }

  // Player search in sidebar
  const [playerSearch, setPlayerSearch] = useState('');

  // Quick-add exercise to a block
  const [addExBlock, setAddExBlock] = useState(null); // null | blockIndex
  const [addExQuery, setAddExQuery] = useState('');
  function addExerciseToBlock(bi, name) {
    if (!name.trim()) return;
    setSession(prev => {
      if (!prev) return prev;
      const blocks = (prev.blocks || []).map((b, i) => {
        if (i !== bi) return b;
        return {
          ...b,
          exercises: [
            ...(b.exercises || []),
            { name: name.trim(), code: '', targetSets: ['8', '8', '8'], weightNote: '', weightKg: null, tempo: '', autoReg: '', cue: '' },
          ],
        };
      });
      return { ...prev, blocks };
    });
    setAddExBlock(null);
    setAddExQuery('');
  }

  // Workspace: 'zarechie' | 'nkperf'
  const [workspace, setWorkspace] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('workspace') || 'zarechie';
    return 'zarechie';
  });
  const [nkSyncing, setNkSyncing] = useState(false);

  // Team readiness (Feature 1)
  const [readinessDate, setReadinessDate] = useState(() => todayISO());
  const [readinessData, setReadinessData] = useState(null);
  const [readinessLoading, setReadinessLoading] = useState(false);

  // Team calendar
  const [calWeekStart, setCalWeekStart] = useState(() => getMondayOf(todayISO()));
  const [calData, setCalData] = useState(null);
  const [calLoading, setCalLoading] = useState(false);

  // Monthly planner
  const [plannerMonth, setPlannerMonth] = useState(() => todayISO().slice(0, 7));
  const [monthSchedule, setMonthSchedule] = useState(null); // array of day objects
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [plannerEditDate, setPlannerEditDate] = useState(null); // date string of open popup

  // Tonnage section sub-tab
  const [tonnageTab, setTonnageTab] = useState('tonnage'); // 'tonnage' | 'status'

  // Volume stats
  const [volumeStats, setVolumeStats] = useState(null);

  useEffect(() => {
    localStorage.removeItem('coachApiKey');
    setApiKey('coach-ui');
    setKeyPanelOpen(false);
  }, []);

  // Resume a pending async gym generation after a tab reload. Only resumes when the saved
  // batch matches the currently selected player + date, so we don't clobber other state.
  const resumeAttempted = useRef(false);
  useEffect(() => {
    if (resumeAttempted.current || !apiKey || !playerId || !date) return;
    let pending;
    try { pending = JSON.parse(localStorage.getItem('pending_batch') || 'null'); } catch (_) { pending = null; }
    if (!pending?.batchId) return;
    if (pending.playerId !== playerId || pending.date !== date) return;

    resumeAttempted.current = true;
    setResuming(true);
    setLoading(true);
    setBatchId(pending.batchId);
    setSessionType('gym');
    setError('');
    startGenProgress(true);
    pollBatchResult(pending.batchId, pending.focusLabel || getFocusLabel(period, focus))
      .catch(err => { setError(err.message); stopGenProgress(false); })
      .finally(() => { setBatchId(null); setLoading(false); setResuming(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, playerId, date]);

  useEffect(() => {
    if (!apiKey) return;
    fetch('/api/schedule', { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data.events)) setScheduleEvents(data.events); })
      .catch(() => {});
  }, [apiKey]);

  function switchWorkspace(ws) {
    setWorkspace(ws);
    if (typeof window !== 'undefined') localStorage.setItem('workspace', ws);
    setPlayerId('');
    setSession(null);
    setPlayers([]);
    setOneRM({});
    setRmHistory([]);
  }

  async function loadNKPlayers(forceSync = false) {
    setPlayersError('');
    try {
      if (forceSync) {
        const sr = await fetch('/api/nkperf/sync', { method: 'POST', headers: { 'x-api-key': apiKey } });
        const sd = await sr.json().catch(() => ({}));
        if (sr.ok && Array.isArray(sd.players)) { setPlayers(sd.players); return; }
      }
      const r = await fetch('/api/nkperf/sync', { headers: { 'x-api-key': apiKey } });
      const data = await r.json().catch(() => ({}));
      const list = data.players || [];
      if (!list.length) {
        // Auto-sync on first load
        const sr2 = await fetch('/api/nkperf/sync', { method: 'POST', headers: { 'x-api-key': apiKey } });
        const sd2 = await sr2.json().catch(() => ({}));
        setPlayers(sd2.players || []);
      } else {
        setPlayers(list);
      }
    } catch (err) {
      setPlayersError(err.message);
    }
  }

  useEffect(() => {
    if (!apiKey) return;
    localStorage.setItem('coachApiKey', apiKey);
    setPlayersError('');

    if (workspace === 'nkperf') {
      loadNKPlayers(false);
      return;
    }

    fetch('/api/players/list', { headers: { 'x-api-key': apiKey } })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `Ошибка (${r.status})`);
        const list = data.players || [];
        setPlayers(list);
        // Load today's feedback for all players
        const today = todayISO();
        fetch('/api/players/feedbacks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
          body: JSON.stringify({ playerIds: list.map(p => p.id), date: today }),
        }).then(r2 => r2.json()).then(d => setPlayerFeedbacks(d.feedbacks || {})).catch(() => {});
      })
      .catch(err => {
        setPlayers([]);
        setPlayersError(err.message);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, workspace]);

  useEffect(() => {
    if (!apiKey || !playerId || !date) {
      setPendingSaved(null);
      return;
    }
    let cancelled = false;
    fetch(
      `/api/programs/get?playerId=${encodeURIComponent(playerId)}&date=${encodeURIComponent(date)}&workspace=${workspace}`,
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

  // Reset trends when player changes
  useEffect(() => {
    setTrendsData(null);
    setTrendsOpen(false);
  }, [playerId]);

  // Load stored LSI (jump limb-symmetry index) for the selected player
  useEffect(() => {
    setLsiValue('');
    if (!apiKey || !playerId) return;
    fetch(`/api/players/lsi?playerId=${encodeURIComponent(playerId)}`, { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(d => { if (d && d.lsi != null) setLsiValue(String(d.lsi)); })
      .catch(() => {});
  }, [apiKey, playerId]);

  // Persist LSI to Redis (debounced on blur/change via the handler below)
  const saveLSI = useCallback((val) => {
    if (!apiKey || !playerId) return;
    fetch('/api/players/lsi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ playerId, lsi: val === '' ? null : Number(val) }),
    }).catch(() => {});
  }, [apiKey, playerId]);

  const handleLSIChange = useCallback((val) => {
    setLsiValue(val);
    saveLSI(val);
  }, [saveLSI]);

  // Fetch load + neuro trends when the panel opens
  useEffect(() => {
    if (!trendsOpen || !apiKey || !playerId) return;
    if (trendsData) return;
    setTrendsLoading(true);
    fetch(`/api/players/trends?playerId=${encodeURIComponent(playerId)}&days=28`, { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(d => setTrendsData(d))
      .catch(() => setTrendsData({ cmjHistory: [], acwrHistory: [], gymAcwrHistory: [], tsbHistory: [] }))
      .finally(() => setTrendsLoading(false));
  }, [trendsOpen, apiKey, playerId, trendsData]);

  // Restore recovery status when player changes
  useEffect(() => {
    if (!playerId) { setRecoveryStatus('green'); return; }
    try {
      const saved = localStorage.getItem(`recovery_${playerId}`);
      setRecoveryStatus(saved === 'yellow' || saved === 'red' ? saved : 'green');
    } catch (_) { setRecoveryStatus('green'); }
  }, [playerId]);

  function changeRecovery(status) {
    setRecoveryStatus(status);
    if (playerId) { try { localStorage.setItem(`recovery_${playerId}`, status); } catch (_) {} }
  }

  // Fetch 1RM data (+ history) when player changes
  useEffect(() => {
    if (!apiKey || !playerId) { setOneRM({}); setRmHistory([]); return; }
    fetch(`/api/players/1rm?playerId=${encodeURIComponent(playerId)}&workspace=${workspace}`, { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(data => setOneRM(data.values || {}))
      .catch(() => setOneRM({}));
    fetch(`/api/players/1rm-history?playerId=${encodeURIComponent(playerId)}`, { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(data => setRmHistory(Array.isArray(data.history) ? data.history : []))
      .catch(() => setRmHistory([]));
  }, [apiKey, playerId]);

  // Load microcycle templates list when the coach key is present.
  useEffect(() => {
    if (!apiKey) { setTemplates([]); return; }
    fetch('/api/programs/templates', { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(data => setTemplates(Array.isArray(data.templates) ? data.templates : []))
      .catch(() => setTemplates([]));
  }, [apiKey]);

  // Fetch player contraindications when player changes.
  useEffect(() => {
    if (!apiKey || !playerId) { setRestrictions([]); return; }
    fetch(`/api/player/restrictions?playerId=${encodeURIComponent(playerId)}`, { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(data => setRestrictions(Array.isArray(data.restrictions) ? data.restrictions : []))
      .catch(() => setRestrictions([]));
  }, [apiKey, playerId]);

  // Fetch weekly volume when player changes
  useEffect(() => {
    if (!apiKey || !playerId) { setVolumeStats(null); return; }
    fetch(`/api/players/volume?playerId=${encodeURIComponent(playerId)}&days=7`, { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(data => setVolumeStats(data))
      .catch(() => setVolumeStats(null));
  }, [apiKey, playerId]);

  // Load per-exercise progression hints and weight history whenever the current session changes.
  useEffect(() => {
    if (!session || !playerId || !apiKey) { setProgressionMap({}); setExHistoryMap({}); return; }
    const names = (session.blocks || []).flatMap(b => (b.exercises || []).map(e => e.name)).filter(Boolean);
    if (!names.length) return;
    const opts = { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey }, body: JSON.stringify({ playerId, names }) };
    Promise.all([
      fetch('/api/players/progression', opts).then(r => r.json()).catch(() => ({})),
      fetch('/api/players/ex-history', opts).then(r => r.json()).catch(() => ({})),
    ]).then(([prog, hist]) => {
      setProgressionMap(prog.progression || {});
      setExHistoryMap(hist.histories || {});
    });
  }, [session, playerId, apiKey]);

  // Load team tonnage when switching to the Нагрузка section.
  useEffect(() => {
    if (mainSection !== 'tonnage' || !apiKey) return;
    setTonnageLoading(true);
    fetch('/api/players/team-tonnage?days=7', { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(d => setTonnageData(d))
      .catch(() => {})
      .finally(() => setTonnageLoading(false));
  }, [mainSection, apiKey]);

  // Load player session history when switching to history tab.
  useEffect(() => {
    if (workspaceTab !== 'history' || !playerId || !apiKey) { setHistoryData(null); return; }
    setHistoryLoading(true);
    fetch(`/api/players/sessions?playerId=${encodeURIComponent(playerId)}&limit=20`, { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(d => setHistoryData(d))
      .catch(() => setHistoryData({ sessions: [] }))
      .finally(() => setHistoryLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceTab, playerId, apiKey]);

  // Load exercise progress data when history loads (top recurring exercises).
  useEffect(() => {
    if (!historyData || !playerId || !keyConnected) { setExProgressData({}); return; }
    const sessions = historyData.sessions || [];
    if (sessions.length < 2) { setExProgressData({}); return; }
    const freq = {};
    sessions.forEach(s => (s.exercises || []).forEach(ex => {
      if (ex.name && ex.kg > 0) freq[ex.name] = (freq[ex.name] || 0) + 1;
    }));
    const names = Object.entries(freq)
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([n]) => n);
    if (!names.length) { setExProgressData({}); return; }
    let cancelled = false;
    fetch('/api/players/ex-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ playerId, names }),
    })
      .then(r => (r.ok ? r.json() : { histories: {} }))
      .then(d => { if (!cancelled) setExProgressData(d.histories || {}); })
      .catch(() => { if (!cancelled) setExProgressData({}); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyData, playerId, apiKey]);

  // Auto-load team status when switching to status sub-tab in Нагрузка.
  useEffect(() => {
    if (mainSection === 'tonnage' && tonnageTab === 'status' && players.length > 0 && apiKey) loadTeamStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainSection, tonnageTab]);

  // Load team readiness when switching to readiness section or changing date.
  useEffect(() => {
    if (mainSection !== 'readiness' || !apiKey) return;
    setReadinessLoading(true);
    fetch(`/api/team/readiness?date=${readinessDate}`, { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(d => setReadinessData(d))
      .catch(() => setReadinessData({ players: [] }))
      .finally(() => setReadinessLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainSection, apiKey, readinessDate]);

  // Load team calendar when switching to calendar section or changing week.
  useEffect(() => {
    if (mainSection !== 'calendar' || !apiKey) return;
    setCalLoading(true);
    setCalData(null);
    fetch(`/api/schedule/week?start=${calWeekStart}`, { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(d => setCalData(d))
      .catch(() => setCalData({ players: [], sessions: {}, dates: [] }))
      .finally(() => setCalLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainSection, apiKey, calWeekStart]);

  // Load monthly schedule when switching to planner section or changing month.
  useEffect(() => {
    if (mainSection !== 'planner' || !apiKey) return;
    setPlannerLoading(true);
    setMonthSchedule(null);
    setPlannerEditDate(null);
    fetch(`/api/schedule/month?month=${plannerMonth}`, { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(d => setMonthSchedule(Array.isArray(d.days) ? d.days : []))
      .catch(() => setMonthSchedule([]))
      .finally(() => setPlannerLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainSection, apiKey, plannerMonth]);

  function plannerDayFor(dateStr) {
    return (monthSchedule || []).find(d => d.date === dateStr) || null;
  }

  async function savePlannerDay(dateStr, patch) {
    const existing = monthSchedule || [];
    let next;
    if (patch === null) {
      next = existing.filter(d => d.date !== dateStr);
    } else {
      const found = existing.find(d => d.date === dateStr);
      const merged = { date: dateStr, ...(found || {}), ...patch };
      if (merged.type !== 'training') delete merged.focus;
      next = found
        ? existing.map(d => (d.date === dateStr ? merged : d))
        : [...existing, merged];
    }
    next.sort((a, b) => (a.date < b.date ? -1 : 1));
    setMonthSchedule(next);
    await fetch('/api/schedule/month', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ month: plannerMonth, days: next }),
    }).catch(() => {});
  }

  async function runPlannerAutoplan() {
    setPlannerLoading(true);
    try {
      const r = await fetch(`/api/schedule/month?month=${plannerMonth}`, {
        method: 'PUT',
        headers: { 'x-api-key': apiKey },
      });
      const d = await r.json();
      setMonthSchedule(Array.isArray(d.days) ? d.days : []);
    } catch {}
    setPlannerLoading(false);
  }

  // Auto-apply schedule suggestion when date changes
  useEffect(() => {
    const sug = computeSuggestion(date, scheduleEvents);
    if (!sug) { setAutoFocusNote(null); return; }
    const p = getPeriodForFocus(sug.focus);
    if (p) setPeriod(p);
    setFocus(sug.focus);
    setAutoFocusNote(sug.reason);
    const t = setTimeout(() => setAutoFocusNote(null), 5000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const filteredPlayers = (positionFilter === 'all' ? players : players.filter(p => {
    const pos = (p.position || '').toLowerCase();
    if (positionFilter === 'diagonal') return pos.includes('диагон');
    if (positionFilter === 'outside') return pos.includes('доигр');
    if (positionFilter === 'middle') return pos.includes('центр') || pos.includes('middle');
    if (positionFilter === 'setter') return pos.includes('связ') || pos.includes('setter');
    if (positionFilter === 'libero') return pos.includes('либеро');
    return true;
  })).filter(p => !playerSearch || p.name.toLowerCase().includes(playerSearch.toLowerCase()));

  const playerIndex = useMemo(
    () => filteredPlayers.findIndex(p => p.id === playerId),
    [filteredPlayers, playerId]
  );
  const prevPlayer = useMemo(() => {
    if (filteredPlayers.length <= 1 || playerIndex < 0) return null;
    return filteredPlayers[(playerIndex - 1 + filteredPlayers.length) % filteredPlayers.length];
  }, [filteredPlayers, playerIndex]);
  const nextPlayer = useMemo(() => {
    if (filteredPlayers.length <= 1 || playerIndex < 0) return null;
    return filteredPlayers[(playerIndex + 1) % filteredPlayers.length];
  }, [filteredPlayers, playerIndex]);

  const keyConnected = apiKey && !playersError;

  // Session volume: total sets + estimated tonnage
  const sessionVolume = useMemo(() => {
    if (!session) return null;
    let sets = 0, kgTotal = 0;
    (session.blocks || []).forEach(b => {
      (b.exercises || []).forEach(ex => {
        sets += (ex.targetSets || []).length;
        const kg = ex.weightKg != null ? ex.weightKg : parseKgFromNote(ex.weightNote || '');
        if (kg > 0) (ex.targetSets || []).forEach(s => { kgTotal += (parseInt(s) || 0) * kg; });
      });
    });
    const exCount = (session.blocks || []).reduce((s, b) => s + (b.exercises || []).length, 0);
    return { sets, exCount, tonnes: kgTotal > 0 ? (kgTotal / 1000).toFixed(1) : null };
  }, [session]);

  const methodViolations = useMemo(() => {
    if (!session || period !== 'camp') return [];
    const v = [];
    (session.blocks || []).forEach(b =>
      (b.exercises || []).forEach(ex => {
        const hit = CAMP_FORBIDDEN.find(r => r.re.test(ex.name || ''));
        if (hit) v.push({ name: ex.name, label: hit.label });
      })
    );
    return v;
  }, [session, period]);

  const jumpVolume = useMemo(() => {
    if (!session) return null;
    let exCount = 0, sets = 0;
    (session.blocks || []).forEach(b =>
      (b.exercises || []).forEach(ex => {
        if (JUMP_TAGS.some(t => (ex.name || '').toLowerCase().includes(t))) {
          exCount++;
          sets += (ex.targetSets || []).length;
        }
      })
    );
    return exCount > 0 ? { exCount, sets } : null;
  }, [session]);

  // Keyboard shortcuts: G=generate, S=save, Alt+←/→=prev/next player, Esc=blur
  useEffect(() => {
    function onKey(e) {
      const t = e.target;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
      if (e.altKey && e.key === 'ArrowLeft') {
        if (prevPlayer) { e.preventDefault(); selectPlayer(prevPlayer); }
        return;
      }
      if (e.altKey && e.key === 'ArrowRight') {
        if (nextPlayer) { e.preventDefault(); selectPlayer(nextPlayer); }
        return;
      }
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key === 'g' || e.key === 'G' || e.key === 'п' || e.key === 'П') {
        if (session === null && playerId) { e.preventDefault(); handleGenerate(e); }
      } else if (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы') {
        if (session !== null && !justSaved && !autoSaved) { e.preventDefault(); handleSave(); }
      } else if (e.key === 'Escape') {
        document.activeElement?.blur?.();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, playerId, justSaved, autoSaved, prevPlayer, nextPlayer]);
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
        body: JSON.stringify({ playerId, values: updated, workspace }),
      }).catch(() => {});
    }, 800);
    setOneRMSaveTimer(t);
  }

  async function copyTo(targetPlayerId) {
    setCopying(true);
    try {
      await fetch('/api/programs/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ fromPlayerId: playerId, toPlayerId: targetPlayerId, date }),
      });
      const target = players.find(p => p.id === targetPlayerId);
      setCopyDone(target?.name || 'Игрок');
      setTimeout(() => setCopyDone(null), 3000);
    } catch (_) {}
    setCopying(false);
    setCopyModalOpen(false);
  }

  async function savePhoto(url) {
    const photoUrl = typeof url === 'string' ? url : photoInput.trim();
    try {
      await fetch('/api/players/photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ playerId: editPhotoFor, photoUrl }),
      });
      setPlayers(prev => prev.map(p => p.id === editPhotoFor ? { ...p, photo: photoUrl || null } : p));
      if (selectedPlayer?.id === editPhotoFor) {
        setSelectedPlayer(prev => ({ ...prev, photo: photoUrl || null }));
      }
    } catch (_) {}
    setEditPhotoFor(null);
  }

  async function uploadPlayerPhoto(file) {
    if (!file || !editPhotoFor) return;
    setPhotoUploading(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();
        reader.onload = e => { img.src = e.target.result; };
        img.onload = () => {
          const MAX = 400;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = reject;
        reader.readAsDataURL(file);
      });
      await savePhoto(dataUrl);
    } catch (_) {
      setPhotoUploading(false);
    }
  }

  function selectPlayer(p) {
    setSelectedPlayer(p);
    setPlayerId(p.id);
    setSession(null);
    setMeta(null);
    setWeekPlan(null);
    setError('');
    setJustSaved(false);
    setAutoSaved(false);
    setTodayWarmup(null);
    setLinkCopied(null);
    setMobileView('workspace');
    setWorkspaceTab('program');
    setHistoryData(null);
    setHistoryExpanded(null);
    setExProgressData({});
    setSidebarOpen(false);
  }

  function startGenProgress(longRun = false) {
    genTimers.current.forEach(clearTimeout);
    genTimers.current = [];
    setGenProgress(0);
    // Gym sessions now run through the async generation path (~1-3 мин) — use a slower, longer
    // timeline so the messaging matches reality. Warmup stays on the quick timeline.
    const stages = longRun
      ? [
          { delay: 0,      pct: 3,  msg: 'Ставлю задачу в очередь...' },
          { delay: 4000,   pct: 10, msg: 'Генерирую тренировку... обычно 1-3 минуты' },
          { delay: 20000,  pct: 25, msg: 'Анализирую состояние и историю...' },
          { delay: 45000,  pct: 42, msg: 'Составляю структуру и подбираю упражнения...' },
          { delay: 80000,  pct: 60, msg: 'Генерирую PAP-блоки и прогрессию...' },
          { delay: 120000, pct: 76, msg: 'Финализирую программу...' },
          { delay: 160000, pct: 88, msg: 'Почти готово, ожидаю результат...' },
        ]
      : [
          { delay: 0,     pct: 3,  msg: 'Загружаю данные игрока...' },
          { delay: 1500,  pct: 12, msg: 'Анализирую состояние и историю...' },
          { delay: 4000,  pct: 28, msg: 'Составляю структуру тренировки...' },
          { delay: 10000, pct: 45, msg: 'Подбираю упражнения и нагрузку...' },
          { delay: 22000, pct: 62, msg: 'Генерирую PAP-блоки...' },
          { delay: 38000, pct: 76, msg: 'Рассчитываю прогрессию...' },
          { delay: 55000, pct: 88, msg: 'Финализирую программу...' },
          { delay: 75000, pct: 93, msg: 'Ожидаю результат...' },
        ];
    stages.forEach(({ delay, pct, msg }) => {
      const t = setTimeout(() => { setGenProgress(pct); setGenStage(msg); }, delay);
      genTimers.current.push(t);
    });
  }

  function stopGenProgress(success) {
    genTimers.current.forEach(clearTimeout);
    genTimers.current = [];
    if (success) {
      setGenProgress(100);
      setGenStage('Готово!');
      setTimeout(() => { setGenProgress(0); setGenStage(''); }, 800);
    } else {
      setGenProgress(0);
      setGenStage('');
    }
  }

  async function loadTeamStatus() {
    if (!apiKey || !players.length) return;
    setTeamStatusLoading(true);
    try {
      const res = await fetch('/api/programs/team-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ playerIds: players.map(p => p.id), date }),
      });
      if (res.ok) { const d = await res.json(); setTeamStatus(d.status || {}); }
    } catch (_) {}
    setTeamStatusLoading(false);
  }

  // Auto-load team status when switching to 'day' tab
  useEffect(() => {
    if (leftTab === 'day' && players.length > 0 && apiKey) loadTeamStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftTab, date]);

  async function loadWarmupHistory() {
    if (!apiKey) return;
    try {
      const r = await fetch('/api/warmup/history', { headers: { 'x-api-key': apiKey } });
      const d = await r.json();
      if (r.ok) setWarmupHistory(d.dates || []);
    } catch (_) {}
  }

  async function loadWarmupByDate(d) {
    if (!apiKey) return;
    setWarmupDate(d);
    try {
      const r = await fetch(`/api/warmup/get?date=${d}`, { headers: { 'x-api-key': apiKey } });
      const data = await r.json();
      if (r.ok && data.plan) setWarmupPlan(data.plan);
    } catch (_) {}
  }

  async function generateWarmup() {
    if (!apiKey || warmupLoading) return;
    setWarmupLoading(true);
    setWarmupError('');
    setWarmupPlan(null);
    try {
      const r = await fetch('/api/warmup/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ date: warmupDate, phase: warmupPhase }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Ошибка генерации');
      setWarmupPlan(data.plan);
      loadWarmupHistory();
    } catch (e) {
      setWarmupError(e.message);
    } finally {
      setWarmupLoading(false);
    }
  }

  function toggleBatchPlayer(id) {
    setBatchSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllBatch() {
    if (batchSelectedIds.size === players.length) {
      setBatchSelectedIds(new Set());
    } else {
      setBatchSelectedIds(new Set(players.map(p => p.id)));
    }
  }

  async function retryFailedBatch() {
    const failedIds = new Set(batchResults.filter(r => r.status === 'error').map(r => r.playerId));
    const failed = players.filter(p => failedIds.has(p.id));
    if (!failed.length) return;
    setBatchResults(prev => prev.map(r => failedIds.has(r.playerId) ? { ...r, status: 'queued', error: undefined } : r));
    setBatchRunning(true);

    const CONCURRENCY = 5;
    const queue = [...failed];
    async function worker() {
      while (queue.length) {
        const player = queue.shift();
        try {
          await generatePlayerAsync(player);
          setBatchResults(prev => prev.map(r => r.playerId === player.id ? { ...r, status: 'done' } : r));
        } catch (err) {
          setBatchResults(prev => prev.map(r => r.playerId === player.id ? { ...r, status: 'error', error: err.message } : r));
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, failed.length) }, worker));

    setBatchRunning(false);
  }

  // Generate + poll one player's gym session via the async generation path.
  // generate-status persists the session on completion, so no separate save call is needed.
  async function generatePlayerAsync(player) {
    setBatchResults(prev => prev.map(r => r.playerId === player.id ? { ...r, status: 'generating' } : r));

    // 1. Submit the batch.
    const submitRes = await fetch('/api/programs/generate-async', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ playerId: player.id, date, dayGoal, days, focus, notes, coachRecovery: recoveryStatus, workspace }),
    });
    const submitData = await submitRes.json().catch(() => ({}));
    if (!submitRes.ok) throw new Error(submitData.error || 'Ошибка постановки в очередь');
    const batchId = submitData.batchId;
    if (!batchId) throw new Error('Сервер не вернул идентификатор задачи');
    setBatchResults(prev => prev.map(r => r.playerId === player.id ? { ...r, batchId } : r));

    // 2. Poll every 6s, up to 8 minutes (80 attempts).
    const MAX_ATTEMPTS = 80;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      await new Promise(r => setTimeout(r, 6000));
      let statusData;
      try {
        const statusRes = await fetch(`/api/programs/generate-status?batchId=${encodeURIComponent(batchId)}`, {
          headers: { 'x-api-key': apiKey },
        });
        statusData = await statusRes.json();
        if (!statusRes.ok) throw new Error(statusData.error || 'Ошибка проверки статуса');
      } catch (_) {
        // Transient network blip during polling — keep trying until the attempt cap.
        continue;
      }
      if (statusData.status === 'done') return; // generate-status already saved it
      // status 'pending' → loop again
    }
    throw new Error('Генерация заняла слишком долго');
  }

  async function runBatchGeneration() {
    const selected = players.filter(p => batchSelectedIds.has(p.id));
    if (!selected.length) return;
    setBatchResults(selected.map(p => ({ playerId: p.id, name: p.name, position: p.position, status: 'queued' })));
    setBatchRunning(true);

    // Run players through a pool, max 5 concurrent.
    const CONCURRENCY = 5;
    const queue = [...selected];
    async function worker() {
      while (queue.length) {
        const player = queue.shift();
        try {
          await generatePlayerAsync(player);
          setBatchResults(prev => prev.map(r => r.playerId === player.id ? { ...r, status: 'done' } : r));
        } catch (err) {
          setBatchResults(prev => prev.map(r => r.playerId === player.id ? { ...r, status: 'error', error: err.message } : r));
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, selected.length) }, worker));

    setBatchRunning(false);
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
    setAutoSaved(false);
    setBatchId(null);
    startGenProgress(sessionType === 'gym');
    try {
      const fl = getFocusLabel(period, focus);

      // ── Warmup: stays synchronous ──
      if (sessionType === 'warmup') {
        const res = await fetch('/api/programs/generate-warmup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
          body: JSON.stringify({ playerId, date, dayGoal, days, focus, notes, workspace }),
        });
        let data;
        try { data = await res.json(); } catch (_) {
          throw new Error(res.status === 504
            ? 'Превышено время ожидания — попробуйте ещё раз (обычно 2-я попытка быстрее из-за кэша)'
            : 'Ошибка соединения — попробуйте ещё раз');
        }
        if (!res.ok) throw new Error(data.error || 'Ошибка генерации');
        setSession(data.session);
        setMeta({ player: data.player, dataSummary: data.dataSummary, date: data.date, dayGoal: data.dayGoal || '', focusLabel: fl, sessionType });
        setTodayWarmup(data.session);
        setShowSummary(false);
        stopGenProgress(true);
        return;
      }

      // ── Gym: async generation path ──
      setAutoSaved(false);
      const warmupSummary = todayWarmup ? summarizeWarmupForGym(todayWarmup) : '';
      const submitRes = await fetch('/api/programs/generate-async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ playerId, date, dayGoal, days, focus, notes, warmupSummary, coachRecovery: recoveryStatus, workspace }),
      });
      let submitData;
      try { submitData = await submitRes.json(); } catch (_) {
        throw new Error('Ошибка соединения — попробуйте ещё раз');
      }
      if (!submitRes.ok) throw new Error(submitData.error || 'Ошибка постановки в очередь');
      const newBatchId = submitData.batchId;
      if (!newBatchId) throw new Error('Сервер не вернул идентификатор задачи');
      // Persist so a tab reload can resume polling and still retrieve the session.
      setBatchId(newBatchId);
      try {
        localStorage.setItem('pending_batch', JSON.stringify({ batchId: newBatchId, playerId, date, focusLabel: fl }));
      } catch (_) {}

      await pollBatchResult(newBatchId, fl);
    } catch (err) {
      setError(err.message);
      stopGenProgress(false);
      try { localStorage.removeItem('pending_batch'); } catch (_) {}
    } finally {
      setBatchId(null);
      setLoading(false);
    }
  }

  // Poll a submitted gym batch until done (or timeout). Used for fresh generation and for
  // resuming a batch saved in localStorage after a tab reload. generate-status persists the
  // session on completion, so on success we mark autoSaved and clear the localStorage marker.
  async function pollBatchResult(batchId, focusLabel) {
    // Poll every 5s, up to 6 minutes (72 attempts).
    const MAX_ATTEMPTS = 72;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      await new Promise(r => setTimeout(r, 5000));
      let statusData;
      try {
        const statusRes = await fetch(`/api/programs/generate-status?batchId=${encodeURIComponent(batchId)}`, {
          headers: { 'x-api-key': apiKey },
        });
        statusData = await statusRes.json();
        if (!statusRes.ok) throw new Error(statusData.error || 'Ошибка проверки статуса');
      } catch (pollErr) {
        // Transient network blip during polling — keep trying until the attempt cap.
        continue;
      }
      if (statusData.status === 'done') {
        setSession(statusData.session);
        setMeta({ player: statusData.player, dataSummary: statusData.dataSummary, date: statusData.date, dayGoal: statusData.dayGoal || '', focusLabel, sessionType: 'gym' });
        setShowSummary(false);
        setAutoSaved(true); // generate-status already saved the session
        stopGenProgress(true);
        try { localStorage.removeItem('pending_batch'); } catch (_) {}
        return;
      }
      // status 'pending' → loop again
    }
    try { localStorage.removeItem('pending_batch'); } catch (_) {}
    throw new Error('Генерация заняла слишком долго, попробуйте ещё раз');
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
      // Generate days sequentially, accumulating used exercises so each new day avoids
      // repeating exercises from earlier days (a cohesive week, not 3 isolated days).
      const usedExercises = [];
      const results = [];
      for (let i = 0; i < focusList.length; i++) {
        const f = focusList[i];
        const data = await fetch('/api/programs/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
          body: JSON.stringify({
            playerId,
            date: dates[i],
            dayGoal,
            days,
            focus: f.focus,
            notes,
            warmupSummary: i === 0 ? warmupSummary : '',
            teamUsedExercises: usedExercises,
            coachRecovery: recoveryStatus,
            workspace,
          }),
        }).then(r => r.json());

        // Collect this day's exercises so subsequent days don't repeat them.
        const dayExercises = (data.session?.blocks || []).flatMap(b => (b.exercises || []).map(e => e.name).filter(Boolean));
        usedExercises.push(...dayExercises);

        results.push({ ...data, planLabel: f.label, planDate: dates[i] });
      }
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
        body: JSON.stringify({ playerId, date: item.date, session: item.session, player: item.player, dataSummary: '', dayGoal: item.label, workspace }),
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
          workspace,
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

  // ── Microcycle templates ──────────────────────────────────────────────────
  async function reloadTemplates() {
    if (!apiKey) return;
    try {
      const r = await fetch('/api/programs/templates', { headers: { 'x-api-key': apiKey } });
      const data = await r.json();
      setTemplates(Array.isArray(data.templates) ? data.templates : []);
    } catch (_) {}
  }

  async function handleSaveTemplate() {
    if (!session?.blocks?.length) return;
    const name = (typeof window !== 'undefined' ? window.prompt('Название шаблона:') : '')?.trim();
    if (!name) return;
    try {
      await fetch('/api/programs/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ action: 'save', name, focus, blocks: session.blocks }),
      });
      await reloadTemplates();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleLoadTemplate(name) {
    setTemplatesOpen(false);
    try {
      const r = await fetch('/api/programs/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ action: 'load', name }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Ошибка загрузки шаблона');
      const t = data.template;
      if (t?.focus) setFocus(t.focus);
      // Drop the loaded blocks into the editable session view.
      setSession(prev => ({
        assessment: prev?.assessment || '',
        periodization_note: prev?.periodization_note || `Загружен шаблон: ${t.name}`,
        warnings: prev?.warnings || '',
        blocks: Array.isArray(t?.blocks) ? t.blocks : [],
      }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteTemplate(name) {
    if (!confirm(`Удалить шаблон "${name}"?`)) return;
    try {
      await fetch(`/api/programs/templates?name=${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: { 'x-api-key': apiKey },
      });
      await reloadTemplates();
    } catch (_) {}
  }

  // ── Plan vs Actual: complete workout ───────────────────────────────────────
  async function handleCompleteWorkout() {
    if (!session || !meta || !pendingSaved) return;
    setSavingActual(true);
    try {
      const exercises = (session.blocks || []).flatMap(b =>
        (b.exercises || []).map(ex => ({
          name: ex.name,
          plannedKg: parseFloat(ex.weightKg) || 0,
          actualKg: parseFloat(ex.actualKg) || 0,
          actualRpe: ex.actualRpe ?? null,
          sets: (ex.targetSets || []).length || parseInt(ex.sets, 10) || 3,
          reps: parseInt((ex.targetSets || [])[0], 10) || parseInt(ex.reps, 10) || 8,
          completed: (parseFloat(ex.actualKg) || 0) > 0,
        }))
      );
      const res = await fetch('/api/programs/save-actual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ playerId, date: meta.date, workspace, exercises }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка');
      const plannedTonnage = exercises.reduce((s, e) => s + e.plannedKg * e.sets * e.reps, 0);
      setCompliance({ percent: data.compliance, actualTonnage: data.actualTonnage, plannedTonnage: Math.round(plannedTonnage) });
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingActual(false);
    }
  }

  // ── Player contraindications ───────────────────────────────────────────────
  async function toggleRestriction(id) {
    if (!playerId) return;
    const next = restrictions.includes(id)
      ? restrictions.filter(r => r !== id)
      : [...restrictions, id];
    setRestrictions(next);
    try {
      await fetch('/api/player/restrictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ playerId, restrictions: next }),
      });
    } catch (_) {}
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

  async function regenerateExercise(blockIdx, exIdx) {
    const res = await fetch('/api/programs/regenerate-exercise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ playerId, date, blockIndex: blockIdx, exerciseIndex: exIdx }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Ошибка генерации');
    if (data.exercise) {
      setSession(prev => ({
        ...prev,
        blocks: prev.blocks.map((b, bi) =>
          bi !== blockIdx
            ? b
            : { ...b, exercises: b.exercises.map((ex, ei) => (ei !== exIdx ? ex : data.exercise)) }
        ),
      }));
    }
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

  return (
    <>
      <Head>
        <title>Nikolay Korenchuk — High Performance Coach</title>
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
              <div className="relative h-10 w-10 shrink-0">
                <div className="absolute -inset-[1.5px] rounded-[14px] bg-gradient-to-br from-accent/60 via-accent/20 to-transparent" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/nk-logo.jpg" alt="NK" className="relative h-10 w-10 rounded-xl object-cover" />
              </div>
              <div>
                <div className="text-[13px] font-black tracking-tight text-white leading-tight">Nikolay Korenchuk</div>
                <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-accent">High Performance Coach</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setKeyPanelOpen(false)}
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
                  Нет подключения
                </>
              )}
            </button>

            {false && keyPanelOpen && (
              <div className="mt-3 animate-fade-in space-y-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder=""
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

          {/* Workspace switcher */}
          {keyConnected && (
            <div className="border-b border-white/[0.05] px-3 pb-2 pt-2">
              <div className="flex rounded-xl bg-white/[0.04] p-0.5 gap-0.5">
                {[
                  { id: 'zarechie', label: 'Заречье', emoji: '🏐', activeClass: 'bg-[#22D3EE]/[0.15] text-[#22D3EE] border-[#22D3EE]/20' },
                  { id: 'nkperf',   label: 'NK Performance', emoji: '💪', activeClass: 'bg-emerald-500/[0.15] text-emerald-400 border-emerald-500/20' },
                ].map(w => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => switchWorkspace(w.id)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[10px] font-bold transition-all border ${
                      workspace === w.id ? w.activeClass : 'border-transparent text-slate-600 hover:text-slate-400'
                    }`}
                  >
                    <span>{w.emoji}</span><span>{w.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Section switcher — 2×3 grid */}
          {keyConnected && (
            <div className="border-b border-white/[0.05] px-3 pb-2 pt-2 space-y-0.5">
              {[
                [
                  { id: 'readiness', label: 'Готовность', icon: <Activity size={12} />,    activeClass: 'bg-emerald-500/[0.15] text-emerald-400 border-emerald-500/20' },
                  { id: 'workouts',  label: 'Зал',        icon: <Dumbbell size={12} />,    activeClass: 'bg-white/[0.10] text-white border-white/10' },
                  { id: 'warmup',    label: 'Разминка',   icon: <Zap size={12} />,          activeClass: 'bg-cyan-500/[0.15] text-cyan-400 border-cyan-500/20' },
                ],
                [
                  { id: 'tonnage',  label: 'Нагрузка', icon: <BarChart2 size={12} />,      activeClass: 'bg-amber-500/[0.15] text-amber-400 border-amber-500/20' },
                  { id: 'calendar', label: 'Неделя',   icon: <CalendarDays size={12} />,   activeClass: 'bg-violet-500/[0.15] text-violet-400 border-violet-500/20' },
                  { id: 'planner',  label: 'Месяц',    icon: <CalendarRange size={12} />,  activeClass: 'bg-sky-500/[0.15] text-sky-400 border-sky-500/20' },
                ],
              ].map((row, ri) => (
                <div key={ri} className="flex gap-0.5">
                  {row.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => { setMainSection(s.id); if (s.id === 'warmup') loadWarmupHistory(); }}
                      className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg border py-1.5 text-[10px] font-semibold transition-all ${
                        mainSection === s.id
                          ? s.activeClass
                          : 'border-transparent text-slate-600 hover:text-slate-400 hover:bg-white/[0.03]'
                      }`}
                    >
                      {s.icon}
                      <span className="leading-none">{s.label}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Library quick-access */}
          {keyConnected && (
            <div className="border-b border-white/[0.05] px-3 pb-2 pt-1.5">
              <a
                href="/library"
                className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] font-semibold text-slate-500 transition-all hover:border-[#22D3EE]/20 hover:bg-[#22D3EE]/[0.05] hover:text-[#22D3EE]"
              >
                <BookOpen size={12} />
                Библиотека упражнений
              </a>
            </div>
          )}

          {/* Tab switcher: Players | Day (workouts section only) */}
          {mainSection === 'workouts' && keyConnected && players.length > 0 && (
            <div className="border-b border-white/[0.05] px-3 pb-2 pt-2">
              <div className="flex rounded-lg bg-white/[0.04] p-0.5">
                {[{ id: 'players', label: 'Игроки' }, { id: 'day', label: 'День' }].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setLeftTab(tab.id)}
                    className={`flex-1 rounded-md py-1.5 text-[11px] font-semibold transition-all ${
                      leftTab === tab.id ? 'bg-white/[0.10] text-white' : 'text-slate-600 hover:text-slate-400'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Warmup sidebar panel */}
          {mainSection === 'warmup' && keyConnected && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* Date */}
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-slate-600">Дата</label>
                <DatePicker value={warmupDate} onChange={setWarmupDate} size="sm" />
              </div>

              {/* Phase */}
              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-slate-600">Фаза сборов</label>
                <div className="flex gap-1.5">
                  {[1, 2, 3].map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setWarmupPhase(p)}
                      className={`flex-1 rounded-xl border py-2 text-[11px] font-bold transition-all ${
                        warmupPhase === p
                          ? 'border-cyan-500/50 bg-cyan-500/[0.15] text-cyan-400'
                          : 'border-white/[0.08] bg-white/[0.03] text-slate-600 hover:text-slate-300'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-slate-600">
                  {warmupPhase === 1 ? 'Эксцентрика · нед. 1-3' : warmupPhase === 2 ? 'Изометрика · нед. 4-5' : 'Взрыв · нед. 6'}
                </p>
              </div>

              {/* Generate button */}
              <button
                type="button"
                onClick={generateWarmup}
                disabled={warmupLoading}
                className="w-full rounded-xl bg-cyan-500 py-2.5 text-[12px] font-bold text-[#060a0e] transition hover:bg-cyan-400 disabled:opacity-50"
              >
                {warmupLoading ? 'Генерирую...' : 'Сгенерировать разминку'}
              </button>

              {warmupError && (
                <p className="rounded-xl border border-rose-500/20 bg-rose-500/[0.07] px-3 py-2 text-[11px] text-rose-400">{warmupError}</p>
              )}

              {/* History */}
              {warmupHistory.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">История</p>
                  <div className="space-y-0.5">
                    {warmupHistory.slice(0, 10).map(d => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => loadWarmupByDate(d)}
                        className={`w-full rounded-lg px-2.5 py-1.5 text-left text-[11px] font-semibold transition-all ${
                          d === warmupDate
                            ? 'bg-cyan-500/[0.12] text-cyan-400'
                            : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-300'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Readiness sidebar: date picker + refresh + summary */}
          {mainSection === 'readiness' && keyConnected && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <p className="px-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-700">Утренний экран</p>
              <DatePicker value={readinessDate} onChange={setReadinessDate} maxDate={todayISO()} size="sm" className="w-full" />
              <button
                type="button"
                onClick={() => {
                  setReadinessLoading(true);
                  fetch(`/api/team/readiness?date=${readinessDate}`, { headers: { 'x-api-key': apiKey } })
                    .then(r => r.json()).then(d => setReadinessData(d))
                    .catch(() => setReadinessData({ players: [] }))
                    .finally(() => setReadinessLoading(false));
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] py-2 text-[11px] font-bold text-emerald-400 transition hover:bg-emerald-500/[0.12]"
              >
                <RefreshCw size={12} /> Обновить
              </button>
              {readinessData?.players && !readinessLoading && (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-700">Сводка</p>
                  {['red', 'yellow', 'green'].map(s => {
                    const cnt = readinessData.players.filter(p => p.status === s).length;
                    const dot = s === 'red' ? '🔴' : s === 'yellow' ? '🟡' : '🟢';
                    const lbl = s === 'red' ? 'Красный' : s === 'yellow' ? 'Жёлтый' : 'Зелёный';
                    return (
                      <div key={s} className="flex items-center gap-2 text-[12px]">
                        <span>{dot}</span>
                        <span className="text-slate-500">{lbl}</span>
                        <span className="ml-auto font-bold text-slate-300">{cnt}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {readinessLoading && (
                <div className="flex justify-center py-4">
                  <Loader2 size={16} className="animate-spin text-slate-600" />
                </div>
              )}
            </div>
          )}

          {/* Calendar sidebar: week navigation */}
          {mainSection === 'calendar' && keyConnected && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <p className="px-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-700">Навигация</p>
              {/* Prev / current / next week */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCalWeekStart(addDaysToStr(calWeekStart, -7))}
                  className="grid h-8 w-8 place-items-center rounded-xl text-slate-500 hover:bg-white/[0.06] hover:text-slate-200 transition"
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setCalWeekStart(getMondayOf(todayISO()))}
                  className={`flex-1 rounded-xl py-2 text-[11px] font-bold transition ${
                    calWeekStart === getMondayOf(todayISO())
                      ? 'bg-violet-500/[0.12] text-violet-400'
                      : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-300'
                  }`}
                >
                  Текущая
                </button>
                <button
                  type="button"
                  onClick={() => setCalWeekStart(addDaysToStr(calWeekStart, 7))}
                  className="grid h-8 w-8 place-items-center rounded-xl text-slate-500 hover:bg-white/[0.06] hover:text-slate-200 transition"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
              {/* Week date range label */}
              {calWeekStart && (
                <p className="text-center text-[11px] font-semibold text-slate-600">
                  {calWeekStart.slice(5).replace('-', '/')} — {addDaysToStr(calWeekStart, 6).slice(5).replace('-', '/')}
                </p>
              )}
              {/* Session count summary */}
              {calData && !calLoading && (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-700">Итог недели</p>
                  <p className="text-[22px] font-black text-violet-400 leading-none">
                    {Object.values(calData.sessions).reduce((s, arr) => s + arr.length, 0)}
                    <span className="ml-1 text-[11px] font-semibold text-slate-600">тр.</span>
                  </p>
                  <p className="text-[10px] text-slate-700">из {calData.players.length} игроков</p>
                </div>
              )}
              {calLoading && (
                <div className="flex justify-center py-4">
                  <Loader2 size={16} className="animate-spin text-slate-600" />
                </div>
              )}
            </div>
          )}

          {/* Planner sidebar: month navigation + autoplan + legend */}
          {mainSection === 'planner' && keyConnected && (
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              <p className="px-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-700">Месяц</p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPlannerMonth(shiftMonth(plannerMonth, -1))}
                  className="grid h-8 w-8 place-items-center rounded-xl text-slate-500 hover:bg-white/[0.06] hover:text-slate-200 transition"
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setPlannerMonth(todayISO().slice(0, 7))}
                  className={`flex-1 rounded-xl py-2 text-[11px] font-bold transition ${
                    plannerMonth === todayISO().slice(0, 7)
                      ? 'bg-cyan-500/[0.12] text-cyan-400'
                      : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-300'
                  }`}
                >
                  {monthLabel(plannerMonth)}
                </button>
                <button
                  type="button"
                  onClick={() => setPlannerMonth(shiftMonth(plannerMonth, 1))}
                  className="grid h-8 w-8 place-items-center rounded-xl text-slate-500 hover:bg-white/[0.06] hover:text-slate-200 transition"
                >
                  <ChevronRight size={15} />
                </button>
              </div>

              <button
                type="button"
                onClick={runPlannerAutoplan}
                disabled={plannerLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 py-2.5 text-[12px] font-bold text-[#060a0e] transition hover:bg-cyan-400 disabled:opacity-50"
              >
                {plannerLoading ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                Авто-план
              </button>

              <div>
                <p className="mb-1.5 px-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-700">Легенда</p>
                <div className="space-y-1">
                  {[
                    { icon: <Swords size={11} />,   label: 'Игра',          cls: PLANNER_CELL.game },
                    { icon: <Plane size={11} />,    label: 'Перелёт',       cls: PLANNER_CELL.travel },
                    { icon: <Coffee size={11} />,   label: 'Выходной',      cls: PLANNER_CELL.rest },
                    { icon: <Dumbbell size={11} />, label: 'Силовая',       cls: PLANNER_FOCUS_CELL.inseason_strength },
                    { icon: <Zap size={11} />,      label: 'Мощностная',    cls: PLANNER_FOCUS_CELL.inseason_power },
                    { icon: <Shield size={11} />,   label: 'Профилактика',  cls: PLANNER_FOCUS_CELL.inseason_prophylaxis },
                    { icon: <RotateCcw size={11} />,label: 'Deload',        cls: PLANNER_FOCUS_CELL.inseason_deload },
                    { icon: <Dumbbell size={11} />, label: 'Тейпер',        cls: PLANNER_FOCUS_CELL.inseason_taper },
                    { icon: <Dumbbell size={11} />, label: 'Накопление',    cls: PLANNER_FOCUS_CELL.inseason_accumulation },
                    { icon: <Dumbbell size={11} />, label: 'Конверсия',     cls: PLANNER_FOCUS_CELL.inseason_conversion },
                  ].map((it, i) => (
                    <div key={i} className={`flex items-center gap-2 rounded-lg border px-2 py-1 text-[11px] font-semibold ${it.cls}`}>
                      {it.icon}<span>{it.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Player list (workouts section only) */}
          {mainSection === 'workouts' && (
          <div className="flex-1 overflow-y-auto p-2">
            {!keyConnected && (
              <p className="px-3 py-5 text-[11px] text-slate-600">Введи ключ чтобы загрузить состав</p>
            )}
            {keyConnected && players.length === 0 && (
              <p className="px-3 py-5 text-[11px] text-slate-600">Загрузка состава...</p>
            )}
            {/* ── Вкладка: День ── */}
            {leftTab === 'day' && keyConnected && (
              <div className="space-y-1">

                {/* Date + refresh */}
                <div className="mb-2 flex items-center gap-2 px-1">
                  <DatePicker value={date} onChange={setDate} maxDate={addDaysToStr(todayISO(), 1)} size="sm" className="flex-1" />
                  <button type="button" onClick={loadTeamStatus} disabled={teamStatusLoading} className="shrink-0 text-slate-600 hover:text-accent transition" title="Обновить">
                    <RefreshCw size={11} className={teamStatusLoading ? 'animate-spin' : ''} />
                  </button>
                </div>

                {/* Generation parameters */}
                <div className="mb-2 space-y-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
                  {/* Period pills */}
                  <div className="flex gap-1">
                    {PERIODS.map(p => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => { setPeriod(p.value); setFocus(PHASES_BY_PERIOD[p.value][0].value); }}
                        className={`flex-1 rounded-lg py-1 text-[9px] font-bold transition-all ${
                          period === p.value
                            ? PERIOD_COLORS[p.value].tab
                            : 'text-slate-600 hover:text-slate-400'
                        }`}
                      >
                        {p.value === 'offseason' ? 'Межс.' : p.label}
                      </button>
                    ))}
                  </div>

                  {/* Phase select */}
                  <select
                    value={focus}
                    onChange={e => setFocus(e.target.value)}
                    className="w-full rounded-lg border border-white/[0.08] bg-[#0a1520] px-2 py-1.5 text-[11px] text-slate-300 outline-none focus:border-accent/40 [color-scheme:dark]"
                  >
                    {PHASES_BY_PERIOD[period].map(ph => (
                      <option key={ph.value} value={ph.value}>{ph.label}</option>
                    ))}
                  </select>

                  {/* Day goal */}
                  <input
                    type="text"
                    value={dayGoal}
                    onChange={e => setDayGoal(e.target.value)}
                    placeholder="Цель дня (необязательно)"
                    className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11px] text-slate-300 placeholder-slate-700 outline-none focus:border-accent/40"
                  />

                  {/* Notes */}
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Комментарии тренера..."
                    className="w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11px] leading-snug text-slate-300 placeholder-slate-700 outline-none focus:border-accent/40"
                  />
                </div>

                {/* Select all / clear */}
                {players.length > 0 && !batchRunning && (
                  <div className="flex items-center justify-between px-1 pb-1">
                    <span className="text-[10px] text-slate-600">
                      {batchSelectedIds.size > 0 ? `Выбрано: ${batchSelectedIds.size}` : 'Выбери игроков'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (batchSelectedIds.size === players.length) setBatchSelectedIds(new Set());
                        else setBatchSelectedIds(new Set(players.map(p => p.id)));
                      }}
                      className="text-[10px] font-semibold text-accent/70 hover:text-accent transition"
                    >
                      {batchSelectedIds.size === players.length ? 'Снять все' : 'Выбрать всех'}
                    </button>
                  </div>
                )}

                {/* Player rows with checkboxes */}
                {players.map(p => {
                  const st = teamStatus[p.id];
                  const fb = st?.feedback;
                  const sel = batchSelectedIds.has(p.id);
                  const batchRow = batchResults.find(r => r.playerId === p.id);
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-2 rounded-xl px-2 py-2 transition-all ${
                        sel ? 'bg-accent/[0.07] ring-1 ring-inset ring-accent/20' :
                        playerId === p.id ? 'bg-white/[0.04]' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <button
                        type="button"
                        onClick={() => !batchRunning && toggleBatchPlayer(p.id)}
                        disabled={batchRunning}
                        className="shrink-0 transition"
                      >
                        {sel
                          ? <CheckSquare size={14} className="text-accent" />
                          : <Square size={14} className="text-slate-700 hover:text-slate-500" />}
                      </button>

                      {/* Player info — click to open */}
                      <button
                        type="button"
                        onClick={() => selectPlayer(p)}
                        className="flex flex-1 min-w-0 items-center gap-2 text-left"
                      >
                        <span className={`shrink-0 h-1.5 w-1.5 rounded-full ${positionDot(p.position)}`} />
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-[12px] font-semibold leading-tight text-slate-200">{p.name.split(' ')[0]}</div>
                          <div className="text-[10px] text-slate-600">{p.position || '—'}</div>
                        </div>
                      </button>

                      {/* Status badges */}
                      <div className="flex items-center gap-1 shrink-0">
                        {batchRow && (
                          <span className={`text-[10px] font-bold ${
                            batchRow.status === 'done'       ? 'text-emerald-400' :
                            batchRow.status === 'error'      ? 'text-rose-400' :
                            batchRow.status === 'generating' ? 'text-accent' :
                            'text-slate-600'
                          }`}>
                            {batchRow.status === 'done'       ? '✓' :
                             batchRow.status === 'error'      ? '✗' :
                             batchRow.status === 'generating' ? '…' : '·'}
                          </span>
                        )}
                        {!batchRow && fb && (
                          <span className={`rounded px-1 py-0.5 text-[9px] font-black ${
                            fb.rpe >= 9 ? 'bg-red-500/20 text-red-400' :
                            fb.rpe >= 7 ? 'bg-amber-500/20 text-amber-400' :
                            'bg-emerald-500/20 text-emerald-400'
                          }`}>
                            {fb.rpe}
                          </span>
                        )}
                        {!batchRow && st && !batchRunning && (
                          <span className={`text-[11px] ${st.hasSession ? 'text-emerald-500' : 'text-slate-700'}`}>
                            {st.hasSession ? '✓' : '—'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Generate button */}
                {batchSelectedIds.size > 0 && !batchRunning && (
                  <div className="pt-2 px-1">
                    <button
                      type="button"
                      onClick={async () => {
                        setBatchResults([]);
                        await runBatchGeneration();
                        loadTeamStatus();
                      }}
                      disabled={!apiKey}
                      className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-accent/90 py-2.5 text-[12px] font-bold text-[#060a0e] transition hover:bg-accent disabled:opacity-30"
                    >
                      <Zap size={12} strokeWidth={2.5} />
                      Сгенерировать для {batchSelectedIds.size} {batchSelectedIds.size === 1 ? 'игрока' : batchSelectedIds.size < 5 ? 'игроков' : 'игроков'}
                    </button>
                  </div>
                )}

                {/* Running indicator */}
                {batchRunning && (
                  <div className="pt-2 px-1 flex items-center gap-2 text-[11px] text-slate-500">
                    <Loader2 size={11} className="animate-spin text-accent" />
                    Генерирую {batchResults.filter(r => r.status === 'done').length} / {batchResults.length}...
                  </div>
                )}

                {/* Done summary */}
                {!batchRunning && batchResults.length > 0 && (
                  <div className="pt-1 px-1 flex items-center justify-between">
                    <span className="text-[10px] text-emerald-400">
                      ✓ {batchResults.filter(r => r.status === 'done').length} сохранено
                      {batchResults.some(r => r.status === 'error') && ` · ${batchResults.filter(r => r.status === 'error').length} ошибок`}
                    </span>
                    <button
                      type="button"
                      onClick={() => { setBatchResults([]); setBatchSelectedIds(new Set()); }}
                      className="text-[10px] text-slate-600 hover:text-slate-400 transition"
                    >
                      Сбросить
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Вкладка: Игроки ── */}
            {leftTab === 'players' && keyConnected && players.length > 0 && (
              <div className="px-1 pb-2">
                {/* Player search */}
                <div className="relative mb-2">
                  <input
                    type="text"
                    value={playerSearch}
                    onChange={e => setPlayerSearch(e.target.value)}
                    placeholder="Поиск игрока..."
                    className="w-full rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-[11px] text-slate-300 outline-none transition placeholder:text-slate-700 focus:border-accent/40"
                  />
                  {playerSearch && (
                    <button
                      type="button"
                      onClick={() => setPlayerSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              </div>
            )}
            {leftTab === 'players' && keyConnected && players.length > 0 && (
              <div className="flex flex-wrap gap-1 px-1 pb-2">
                {[
                  { key: 'all', label: 'Все' },
                  { key: 'diagonal', label: 'Диаг', cls: 'bg-violet-400' },
                  { key: 'outside', label: 'Доигр', cls: 'bg-cyan-400' },
                  { key: 'middle', label: 'Центр', cls: 'bg-amber-400' },
                  { key: 'setter', label: 'Связ', cls: 'bg-emerald-400' },
                  { key: 'libero', label: 'Либеро', cls: 'bg-rose-400' },
                ].map(({ key, label, cls }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPositionFilter(key)}
                    className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold transition-all ${
                      positionFilter === key ? 'bg-white/[0.10] text-white' : 'text-slate-600 hover:text-slate-400'
                    }`}
                  >
                    {cls && <span className={`h-1.5 w-1.5 rounded-full ${cls}`} />}
                    {label}
                  </button>
                ))}
              </div>
            )}
            {leftTab === 'players' && filteredPlayers.map(p => (
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
                <div className="relative shrink-0 h-8 w-8">
                  {p.photo ? (
                    <img src={p.photo} alt="" className="h-8 w-8 rounded-xl object-cover object-top" />
                  ) : (
                    <div className={`h-8 w-8 flex items-center justify-center rounded-xl text-[11px] font-black transition-colors ${
                      playerId === p.id
                        ? 'bg-accent text-[#060a0e]'
                        : 'bg-white/[0.07] text-slate-400 group-hover:bg-white/[0.10]'
                    }`}>
                      {initials(p.name)}
                    </div>
                  )}
                  <span className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-[#060c15] ${positionDot(p.position)}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <div className="text-[12.5px] font-semibold leading-tight truncate">{p.name}</div>
                    {p.lastSessionDate === date && (
                      <span title="Тренировка сохранена на эту дату" className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.7)]" />
                    )}
                    {playerFeedbacks[p.id] && (
                      <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-black leading-none ${
                        playerFeedbacks[p.id].rpe >= 9 ? 'bg-red-500/20 text-red-400' :
                        playerFeedbacks[p.id].rpe >= 7 ? 'bg-amber-500/20 text-amber-400' :
                        'bg-emerald-500/20 text-emerald-400'
                      }`}>
                        RPE {playerFeedbacks[p.id].rpe}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-600 truncate leading-tight">
                    {p.position || '—'}
                    {p.lastSessionDate && (
                      <span className="ml-1.5 opacity-50">
                        {p.lastSessionDate.slice(5).replace('-', '/')}
                      </span>
                    )}
                  </div>
                </div>
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
                      setLinkCopied(p.id);
                      setTimeout(() => setLinkCopied(null), 2500);
                    } catch (_) {}
                  }}
                  className="shrink-0 rounded-lg p-1 transition opacity-0 group-hover:opacity-100 hover:text-accent"
                  title="Скопировать ссылку игрока"
                >
                  {linkCopied === p.id
                    ? <Check size={11} className="text-emerald-400 opacity-100" />
                    : <Link2 size={11} className="text-slate-500" />}
                </button>
              </button>
            ))}
          </div>
          )} {/* end workouts player list */}

          {/* NK Performance sync button */}
          {workspace === 'nkperf' && keyConnected && (
            <div className="border-t border-white/[0.05] px-3 py-2">
              <button
                type="button"
                disabled={nkSyncing}
                onClick={async () => {
                  setNkSyncing(true);
                  await loadNKPlayers(true);
                  setNkSyncing(false);
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl py-1.5 text-[10px] font-semibold text-emerald-400/70 hover:text-emerald-400 hover:bg-emerald-500/[0.07] transition-all disabled:opacity-40"
              >
                <RefreshCw size={10} className={nkSyncing ? 'animate-spin' : ''} />
                {nkSyncing ? 'Синхронизация...' : 'Синхр. с NK Performance'}
              </button>
            </div>
          )}

          {/* Library link */}
          <div className="border-t border-white/[0.05] p-3">
            <a
              href="/library"
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-semibold text-slate-500 transition hover:bg-white/[0.04] hover:text-accent"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>
              </svg>
              Библиотека упражнений
            </a>
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/nk-logo.jpg" alt="NK" className="h-9 w-9 shrink-0 rounded-xl object-cover" />
                <div>
                  <div className="text-[13px] font-black tracking-tight text-white leading-tight">Nikolay Korenchuk</div>
                  <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-accent">High Performance Coach</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setKeyPanelOpen(false)}
                className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-semibold transition-all ${focusRing} ${
                  keyConnected
                    ? 'border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-400'
                    : 'border-white/[0.07] bg-white/[0.03] text-slate-500'
                }`}
              >
                {keyConnected ? (
                  <><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Подключено</>
                ) : (
                  <><span className="h-1.5 w-1.5 rounded-full bg-slate-700" />Нет подключения</>
                )}
              </button>
              {false && keyPanelOpen && (
                <div className="mt-3">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder=""
                    className={`${inputBase} text-[12px] ${focusRing}`}
                  />
                </div>
              )}
            </div>
            {/* Mobile library link */}
            <div className="border-b border-white/[0.06] px-5 py-2">
              <a
                href="/library"
                className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] font-semibold text-slate-500 transition hover:border-[#22D3EE]/20 hover:text-[#22D3EE]"
              >
                <BookOpen size={12} />
                Библиотека упражнений
              </a>
            </div>

            {/* Mobile player grid */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex flex-wrap gap-1 mb-3 -mt-1">
                {[
                  { key: 'all', label: 'Все' },
                  { key: 'diagonal', label: 'Диаг', cls: 'bg-violet-400' },
                  { key: 'outside', label: 'Доигр', cls: 'bg-cyan-400' },
                  { key: 'middle', label: 'Центр', cls: 'bg-amber-400' },
                  { key: 'setter', label: 'Связ', cls: 'bg-emerald-400' },
                  { key: 'libero', label: 'Либеро', cls: 'bg-rose-400' },
                ].map(({ key, label, cls }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPositionFilter(key)}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                      positionFilter === key ? 'bg-white/[0.10] text-white' : 'text-slate-600 hover:text-slate-400'
                    }`}
                  >
                    {cls && <span className={`h-1.5 w-1.5 rounded-full ${cls}`} />}
                    {label}
                  </button>
                ))}
              </div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-600">Состав команды</p>
              <div className="grid grid-cols-2 gap-3">
                {filteredPlayers.map(p => (
                  <div key={p.id} className="relative">
                    <button
                      type="button"
                      onClick={() => selectPlayer(p)}
                      className="w-full flex flex-col items-center gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 text-center transition active:scale-95"
                    >
                      <div className="relative h-12 w-12">
                        {p.photo ? (
                          <img src={p.photo} alt="" className="h-12 w-12 rounded-2xl object-cover object-top" />
                        ) : (
                          <div className={`h-12 w-12 flex items-center justify-center rounded-2xl text-sm font-black ${
                            playerId === p.id ? 'bg-accent text-[#060a0e]' : 'bg-white/[0.07] text-slate-300'
                          }`}>
                            {initials(p.name)}
                          </div>
                        )}
                        <span className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[#060c15] ${positionDot(p.position)}`} />
                      </div>
                      <div>
                        <div className="text-[12px] font-bold text-slate-200 leading-tight">{p.name}</div>
                        <div className="text-[10px] text-slate-600 mt-0.5">{p.position || '—'}</div>
                      </div>
                    </button>
                    {/* Share link — bottom-right corner */}
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
                          setLinkCopied(p.id);
                          setTimeout(() => setLinkCopied(null), 2500);
                        } catch (_) {}
                      }}
                      className="absolute bottom-2.5 right-2.5 rounded-lg p-1 text-slate-600 transition hover:text-accent"
                      title="Скопировать ссылку"
                    >
                      {linkCopied === p.id
                        ? <Check size={12} className="text-emerald-400" />
                        : <Link2 size={12} />}
                    </button>
                  </div>
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

          {/* ── Warmup workspace ── */}
          {mainSection === 'warmup' && (
            <div className="mx-auto w-full max-w-5xl px-6 py-8 sm:px-10">
              {warmupLoading && (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                  <div className="h-8 w-8 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin" />
                  <p className="text-[13px] text-slate-500">Генерирую разминку...</p>
                </div>
              )}
              {!warmupLoading && !warmupPlan && (
                <div className="flex flex-col items-center justify-center py-24 gap-3">
                  <div className="text-4xl opacity-20">🏃</div>
                  <h2 className="text-[18px] font-black text-slate-600">Командная разминка</h2>
                  <p className="text-[13px] text-slate-700">Выберите дату и фазу — затем нажмите «Сгенерировать» в панели слева</p>
                </div>
              )}
              {!warmupLoading && warmupPlan && (
                <div>
                  <div className="mb-7">
                    <h1 className="text-[24px] font-black tracking-tight text-white leading-tight">Командная разминка</h1>
                    <div className="mt-1.5 flex items-center gap-3">
                      <span className="text-[12px] text-slate-500">{warmupPlan.date}</span>
                      <span className="h-1 w-1 rounded-full bg-slate-700" />
                      <span className="text-[12px] text-cyan-400/80">{WARMUP_PHASE_MAP[warmupPlan.phase]}</span>
                      {warmupPlan.morningFocus && warmupPlan.morningFocus !== 'general' && WARMUP_FOCUS_MAP[warmupPlan.morningFocus] && (
                        <>
                          <span className="h-1 w-1 rounded-full bg-slate-700" />
                          <span className="text-[12px] text-slate-500">{WARMUP_FOCUS_MAP[warmupPlan.morningFocus]}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {(warmupPlan.sections || []).map((section, si) => {
                      const st = WARMUP_SECTION_STYLES[section.id] || WARMUP_SECTION_STYLES.speed;
                      return (
                        <div key={si} className="rounded-2xl border border-white/[0.06] bg-[#0d1520] p-5">
                          <div className="mb-4 flex items-center gap-3">
                            <span className={`h-7 w-1 rounded-full ${st.bar}`} />
                            <span className={`text-base ${st.text}`}>{st.icon}</span>
                            <h3 className={`text-[14px] font-bold ${st.text}`}>{section.label}</h3>
                          </div>
                          <ul className="space-y-2.5">
                            {(section.exercises || []).map((ex, i) => (
                              <li key={i} className={`rounded-xl border p-3 ${st.chip}`}>
                                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                                  <div className="min-w-0">
                                    <span className="text-[13px] font-semibold text-white">{ex.name}</span>
                                    {ex.nameEn && (
                                      <span className="ml-1.5 text-[11px] font-normal text-white/35">{ex.nameEn}</span>
                                    )}
                                  </div>
                                  <span className="text-[12px] font-bold text-white/70">{ex.reps}</span>
                                </div>
                                {ex.note && <p className="mt-1 text-[11px] leading-snug text-white/40">{ex.note}</p>}
                                <div className="mt-2">
                                  <ExerciseVideoLink name={ex.nameEn || ex.name} apiKey={apiKey} />
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Team readiness (Feature 1) ── */}
          {mainSection === 'readiness' && (
            <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-xl font-black tracking-tight text-white">
                    <Activity size={20} className="text-emerald-400" /> Готовность команды
                  </h2>
                  <p className="mt-0.5 text-[12px] text-slate-600">{readinessDate}</p>
                </div>
                {readinessLoading && <Loader2 size={16} className="animate-spin text-slate-600" />}
              </div>

              {readinessLoading && (
                <div className="flex items-center justify-center py-20 text-[13px] text-slate-600">
                  <Loader2 size={18} className="mr-2 animate-spin" /> Загрузка...
                </div>
              )}

              {!readinessLoading && (!readinessData?.players || readinessData.players.length === 0) && (
                <div className="rounded-2xl border border-white/[0.07] bg-[#0d1520] p-10 text-center text-[13px] text-slate-600">
                  Нет данных по составу. Проверьте ключ <code className="text-slate-500">coach:roster</code>.
                </div>
              )}

              {!readinessLoading && readinessData?.players?.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {[...readinessData.players]
                    .sort((a, b) => {
                      const order = { red: 0, yellow: 1, green: 2 };
                      const statusDiff = (order[a.status] ?? 3) - (order[b.status] ?? 3);
                      return statusDiff !== 0 ? statusDiff : (b.riskScore ?? 0) - (a.riskScore ?? 0);
                    })
                    .map(p => {
                      const ring = p.status === 'red' ? 'border-rose-500/40' : p.status === 'yellow' ? 'border-amber-500/40' : 'border-emerald-500/30';
                      const circleBg = p.status === 'red' ? 'bg-rose-500/15 text-rose-400 ring-rose-500/40' : p.status === 'yellow' ? 'bg-amber-500/15 text-amber-400 ring-amber-500/40' : 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30';
                      const dot = p.status === 'red' ? '🔴' : p.status === 'yellow' ? '🟡' : '🟢';
                      const riskColor = p.riskScore == null ? 'text-slate-500' : p.riskScore >= 60 ? 'text-rose-400' : p.riskScore >= 30 ? 'text-amber-400' : 'text-emerald-400';
                      const domainDot = (v) => v === 'red' ? 'bg-rose-500' : v === 'yellow' ? 'bg-amber-500' : 'bg-emerald-500/50';
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => { setPlayerId(p.id); setDate(readinessDate); setMainSection('workouts'); }}
                          className={`group flex flex-col rounded-2xl border ${ring} bg-gradient-to-b from-white/[0.04] to-white/[0.015] p-4 text-left transition hover:from-white/[0.06] hover:to-white/[0.025]`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-full ring-1 ring-inset ${circleBg}`}>
                              <span className="text-[15px] font-black leading-none tabular-nums">{p.recovery != null ? p.recovery : '—'}</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[13px]">{dot}</span>
                                    <span className="truncate text-[14px] font-bold text-white">{p.name}</span>
                                  </div>
                                  {p.domains && (
                                    <div className="mt-1 flex items-center gap-1">
                                      <span title="Автономный" className={`h-[3px] w-[3px] rounded-full ${domainDot(p.domains.autonomic)}`} />
                                      <span title="Нейромышечный" className={`h-[3px] w-[3px] rounded-full ${domainDot(p.domains.neuromuscular)}`} />
                                      <span title="Субъективный" className={`h-[3px] w-[3px] rounded-full ${domainDot(p.domains.subjective)}`} />
                                    </div>
                                  )}
                                  {p.position && <div className="text-[11px] text-slate-600">{p.position}</div>}
                                  <div className="mt-0.5 text-[10px] text-slate-700">Recovery {p.recovery != null ? `${p.recovery}%` : '—'}</div>
                                </div>
                                {p.riskScore != null && (
                                  <div className="flex shrink-0 items-baseline gap-1 leading-none">
                                    <span className={`text-[16px] font-black tabular-nums ${riskColor}`}>{p.riskScore}</span>
                                    <span className="text-[9px] text-slate-600">риск</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
                            {/* CMJ + delta */}
                            <span className="flex items-center gap-1 text-slate-400">
                              <span className="text-slate-600">CMJ</span>
                              <span className="font-bold text-slate-200 tabular-nums">{p.cmj != null ? `${p.cmj}` : '—'}</span>
                              {p.cmjDrop != null && (
                                <span className={`font-semibold ${p.cmjDrop < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                  {p.cmjDrop < 0 ? '↓' : '↑'}{p.cmjDrop > 0 ? '+' : ''}{p.cmjDrop}%
                                </span>
                              )}
                            </span>
                            {/* LSI symmetry */}
                            {p.lsi != null && (
                              <span className="flex items-center gap-1 text-slate-400">
                                <span className="text-slate-600">LSI</span>
                                <span className={`font-bold tabular-nums ${p.lsi < 85 ? 'text-rose-400' : 'text-slate-200'}`}>{p.lsi}%</span>
                              </span>
                            )}
                            {/* Sleep */}
                            <span className="flex items-center gap-1 text-slate-400">
                              <span className="text-slate-600">🌙</span>
                              <span className="font-semibold text-slate-300 tabular-nums">{p.sleep_hours != null ? `${p.sleep_hours}ч` : '—'}</span>
                            </span>
                            {/* DOMS */}
                            <span className="flex items-center gap-1 text-slate-400">
                              <span className="text-slate-600">DOMS</span>
                              <span className={`font-semibold tabular-nums ${p.doms != null && p.doms >= 5 ? 'text-rose-400' : 'text-slate-300'}`}>{p.doms != null ? `${p.doms}/5` : '—'}</span>
                            </span>
                            {/* Readiness */}
                            {p.readiness != null && (
                              <span className="flex items-center gap-1 text-slate-400">
                                <span className="text-slate-600">Гот.</span>
                                <span className={`font-semibold tabular-nums ${p.readiness <= 2 ? 'text-rose-400' : p.readiness === 3 ? 'text-amber-400' : 'text-slate-300'}`}>{p.readiness}/5</span>
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* ── Team calendar ── */}
          {mainSection === 'calendar' && (
            <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8">
              {/* Header */}
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black tracking-tight text-white">Неделя команды</h2>
                  <p className="mt-0.5 text-[12px] text-slate-600">
                    {calWeekStart && `${calWeekStart.slice(5).replace('-', '/')} — ${addDaysToStr(calWeekStart, 6).slice(5).replace('-', '/')}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {calLoading && <Loader2 size={14} className="animate-spin text-slate-600" />}
                  <button
                    type="button"
                    onClick={() => setCalWeekStart(addDaysToStr(calWeekStart, -7))}
                    className="grid h-8 w-8 place-items-center rounded-xl border border-white/[0.07] text-slate-500 hover:bg-white/[0.05] hover:text-white transition"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalWeekStart(getMondayOf(todayISO()))}
                    className="rounded-xl border border-white/[0.07] px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-white/[0.05] hover:text-white transition"
                  >
                    Сегодня
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalWeekStart(addDaysToStr(calWeekStart, 7))}
                    className="grid h-8 w-8 place-items-center rounded-xl border border-white/[0.07] text-slate-500 hover:bg-white/[0.05] hover:text-white transition"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>

              {calData && calData.players.length > 0 ? (
                <div className="overflow-x-auto rounded-2xl border border-white/[0.07] bg-white/[0.02]">
                  <table className="w-full min-w-[580px] border-collapse">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className="w-44 px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-700">Игрок</th>
                        {(calData.dates || []).map(d => {
                          const dow = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'][new Date(d + 'T12:00:00Z').getUTCDay()];
                          const isToday = d === todayISO();
                          return (
                            <th key={d} className={`px-1 py-3 text-center ${isToday ? 'text-accent' : 'text-slate-700'}`}>
                              <div className="text-[10px] font-black uppercase tracking-wide">{dow}</div>
                              <div className={`mt-0.5 text-[9px] font-semibold ${isToday ? 'text-accent/60' : 'text-slate-800'}`}>
                                {d.slice(5).replace('-', '/')}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {calData.players.map((p, pi) => (
                        <tr key={p.id} className={`border-b border-white/[0.03] transition hover:bg-white/[0.02] ${pi % 2 !== 0 ? 'bg-white/[0.01]' : ''}`}>
                          <td className="px-4 py-2">
                            <button
                              type="button"
                              onClick={() => { const fp = players.find(x => x.id === p.id); if (fp) { selectPlayer(fp); setMainSection('workouts'); } }}
                              className="flex items-center gap-2.5 text-left transition hover:opacity-80"
                            >
                              <div className={`h-7 w-7 shrink-0 flex items-center justify-center rounded-lg text-[10px] font-black ${
                                playerId === p.id ? 'bg-accent text-[#060a0e]' : 'bg-white/[0.07] text-slate-500'
                              }`}>{initials(p.name)}</div>
                              <div className="min-w-0">
                                <div className="text-[12px] font-semibold text-slate-300 truncate">{p.name}</div>
                                <div className="text-[9px] text-slate-700 truncate">{p.position}</div>
                              </div>
                            </button>
                          </td>
                          {(calData.dates || []).map(d => {
                            const hasSesh = (calData.sessions[p.id] || []).includes(d);
                            const isToday = d === todayISO();
                            return (
                              <td key={d} className={`px-1 py-2 text-center ${isToday ? 'bg-accent/[0.025]' : ''}`}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const fp = players.find(x => x.id === p.id);
                                    if (fp) { selectPlayer(fp); setDate(d); setMainSection('workouts'); }
                                  }}
                                  title={`${p.name} · ${d}`}
                                  className={`mx-auto flex h-8 w-8 items-center justify-center rounded-xl transition ${
                                    hasSesh
                                      ? 'bg-emerald-500/[0.15] text-emerald-400 hover:bg-emerald-500/[0.25]'
                                      : 'text-slate-800 hover:bg-white/[0.05] hover:text-slate-500'
                                  }`}
                                >
                                  {hasSesh ? <Check size={13} strokeWidth={2.5} /> : <span className="text-[10px]">·</span>}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : !calLoading ? (
                <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
                  <CalendarDays size={40} className="text-slate-800" />
                  <p className="text-[14px] font-semibold text-slate-600">Нет данных о тренировках</p>
                  <p className="text-[12px] text-slate-700">Сначала добавь игроков и сохрани тренировки</p>
                </div>
              ) : null}
            </div>
          )}

          {/* ── Monthly planner workspace ── */}
          {mainSection === 'planner' && (
            <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black tracking-tight text-white">План месяца</h2>
                  <p className="mt-0.5 text-[12px] text-slate-600">{monthLabel(plannerMonth)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {plannerLoading && <Loader2 size={14} className="animate-spin text-slate-600" />}
                  <button type="button" onClick={() => setPlannerMonth(shiftMonth(plannerMonth, -1))} className="grid h-8 w-8 place-items-center rounded-xl border border-white/[0.07] text-slate-500 hover:bg-white/[0.05] hover:text-white transition">
                    <ChevronLeft size={15} />
                  </button>
                  <button type="button" onClick={() => setPlannerMonth(todayISO().slice(0, 7))} className="rounded-xl border border-white/[0.07] px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-white/[0.05] hover:text-white transition">
                    Сегодня
                  </button>
                  <button type="button" onClick={() => setPlannerMonth(shiftMonth(plannerMonth, 1))} className="grid h-8 w-8 place-items-center rounded-xl border border-white/[0.07] text-slate-500 hover:bg-white/[0.05] hover:text-white transition">
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d => (
                  <div key={d} className="pb-1 text-center text-[10px] font-black uppercase tracking-wide text-slate-700">{d}</div>
                ))}
                {getMonthGrid(plannerMonth).map((dateStr, i) => {
                  if (!dateStr) return <div key={`e${i}`} />;
                  const day = plannerDayFor(dateStr);
                  const isToday = dateStr === todayISO();
                  const dnum = parseInt(dateStr.slice(8), 10);
                  return (
                    <div key={dateStr} className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          if (day && day.type === 'training') { setDate(dateStr); setMainSection('workouts'); }
                          else setPlannerEditDate(plannerEditDate === dateStr ? null : dateStr);
                        }}
                        className={`flex min-h-[68px] w-full flex-col rounded-xl border p-1.5 text-left transition hover:brightness-125 ${plannerCellClass(day)} ${isToday ? 'ring-1 ring-cyan-400/60' : ''}`}
                      >
                        <span className="text-[11px] font-black opacity-80">{dnum}</span>
                        <span className="mt-auto flex items-center gap-1 text-[10px] font-bold leading-tight">
                          {day?.type === 'game' && <><Swords size={10} /> Игра</>}
                          {day?.type === 'travel' && <><Plane size={10} /> Перелёт</>}
                          {day?.type === 'rest' && <>—</>}
                          {day?.type === 'training' && <span className="truncate">{PLANNER_FOCUS_SHORT[day.focus] || 'Трен.'}</span>}
                        </span>
                        {day?.note && <span className="mt-0.5 truncate text-[9px] font-medium opacity-60">{day.note}</span>}
                      </button>

                      {plannerEditDate === dateStr && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setPlannerEditDate(null)} />
                          <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-xl border border-white/[0.1] bg-[#0b1320] p-2 shadow-2xl">
                            <p className="mb-1 px-1 text-[9px] font-black uppercase tracking-wider text-slate-600">{dateStr.slice(5)}</p>
                            <div className="space-y-0.5">
                              {PLANNER_TYPES.map(t => (
                                <button
                                  key={t.value}
                                  type="button"
                                  onClick={() => { savePlannerDay(dateStr, { type: t.value }); setPlannerEditDate(null); }}
                                  className={`block w-full rounded-lg px-2 py-1 text-left text-[11px] font-semibold transition ${
                                    day?.type === t.value ? 'bg-cyan-500/[0.15] text-cyan-300' : 'text-slate-400 hover:bg-white/[0.05]'
                                  }`}
                                >
                                  {t.label}
                                </button>
                              ))}
                            </div>
                            <input
                              type="text"
                              defaultValue={day?.note || ''}
                              placeholder="Заметка..."
                              onBlur={e => savePlannerDay(dateStr, { note: e.target.value })}
                              className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[11px] text-slate-200 outline-none focus:border-cyan-400/50"
                            />
                            {day && (
                              <button
                                type="button"
                                onClick={() => { savePlannerDay(dateStr, null); setPlannerEditDate(null); }}
                                className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-lg py-1 text-[10px] font-semibold text-rose-400 hover:bg-rose-500/[0.1]"
                              >
                                <X size={10} /> Очистить
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="mt-4 text-center text-[11px] text-slate-700">
                Клик по дню — выбор типа · клик по тренировочному дню — открыть сессию
              </p>
            </div>
          )}

          {/* ── Tonnage dashboard ── */}
          {mainSection === 'tonnage' && (
            <div className="mx-auto w-full max-w-5xl px-6 py-8 sm:px-10">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-xl font-black tracking-tight text-white">Нагрузка команды</h2>
                <button
                  type="button"
                  onClick={() => {
                    if (tonnageTab === 'tonnage') {
                      setTonnageData(null); setTonnageLoading(true);
                      fetch('/api/players/team-tonnage?days=7', { headers: { 'x-api-key': apiKey } }).then(r => r.json()).then(d => setTonnageData(d)).catch(() => {}).finally(() => setTonnageLoading(false));
                    } else {
                      loadTeamStatus();
                    }
                  }}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] font-semibold text-slate-400 transition hover:text-white"
                >
                  Обновить
                </button>
              </div>

              {/* Sub-tab toggle */}
              <div className="mb-6 flex rounded-xl bg-white/[0.03] p-0.5 border border-white/[0.06]">
                {[
                  { id: 'tonnage', label: 'Тоннаж 7 дн.' },
                  { id: 'status', label: 'Статус сегодня' },
                ].map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTonnageTab(t.id)}
                    className={`flex-1 rounded-[9px] py-2 text-[12px] font-semibold transition-all ${
                      tonnageTab === t.id ? 'bg-white/[0.09] text-white shadow-sm' : 'text-slate-600 hover:text-slate-400'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* ── Tonnage table ── */}
              {tonnageTab === 'tonnage' && tonnageLoading && (
                <div className="flex items-center justify-center py-20 text-[13px] text-slate-600">
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-amber-400" />
                  Загрузка данных…
                </div>
              )}

              {tonnageTab === 'tonnage' && !tonnageLoading && tonnageData && (
                <div className="overflow-x-auto rounded-2xl border border-white/[0.07] bg-[#0d1520]">
                  <table className="w-full min-w-[540px] border-collapse text-[12px]">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className="sticky left-0 z-10 bg-[#0d1520] px-4 py-3 text-left font-semibold text-slate-400">Игрок</th>
                        {(tonnageData.dates || []).map(d => {
                          const dt = new Date(d + 'T00:00:00Z');
                          const day = dt.toLocaleDateString('ru', { weekday: 'short', timeZone: 'UTC' });
                          const num = dt.toLocaleDateString('ru', { day: 'numeric', month: 'numeric', timeZone: 'UTC' });
                          return (
                            <th key={d} className="px-3 py-3 text-center font-semibold text-slate-400">
                              <div className="capitalize">{day}</div>
                              <div className="text-[10px] text-slate-600">{num}</div>
                            </th>
                          );
                        })}
                        <th className="px-4 py-3 text-center font-semibold text-slate-400">Σ неделя</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(tonnageData.players || []).map((p, pi) => {
                        const weekTotal = Object.values(p.byDay || {}).reduce((s, v) => s + v, 0);
                        return (
                          <tr key={p.id} className={`border-b border-white/[0.04] transition hover:bg-white/[0.02] ${pi % 2 === 0 ? '' : 'bg-white/[0.01]'}`}>
                            <td className="sticky left-0 z-10 bg-inherit px-4 py-2.5 font-semibold text-slate-200">
                              <div className="truncate max-w-[120px]">{p.name}</div>
                              {p.position && <div className="text-[10px] text-slate-600">{p.position}</div>}
                            </td>
                            {(tonnageData.dates || []).map(d => {
                              const v = p.byDay?.[d] || 0;
                              const colorClass = v === 0 ? 'text-slate-700' : v < 5000 ? 'text-amber-400/60' : v < 12000 ? 'text-emerald-400/80' : 'text-rose-400/80';
                              const bgClass = v === 0 ? '' : v < 5000 ? 'bg-amber-400/[0.05]' : v < 12000 ? 'bg-emerald-400/[0.07]' : 'bg-rose-400/[0.07]';
                              return (
                                <td key={d} className={`px-3 py-2.5 text-center ${bgClass}`}>
                                  <span className={`font-semibold ${colorClass}`}>
                                    {v === 0 ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)}т` : `${v}кг`}
                                  </span>
                                </td>
                              );
                            })}
                            <td className="px-4 py-2.5 text-center font-bold text-slate-300">
                              {weekTotal === 0 ? '—' : weekTotal >= 1000 ? `${(weekTotal / 1000).toFixed(1)}т` : `${weekTotal}кг`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Legend */}
                  <div className="flex flex-wrap gap-3 border-t border-white/[0.05] px-4 py-3 text-[10px] text-slate-600">
                    <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-amber-400/40" /> &lt; 5 т — лёгкая</span>
                    <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-emerald-400/50" /> 5–12 т — рабочая</span>
                    <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-rose-400/50" /> &gt; 12 т — высокая</span>
                  </div>
                </div>
              )}

              {tonnageTab === 'tonnage' && !tonnageLoading && !tonnageData && (
                <div className="rounded-2xl border border-white/[0.07] bg-[#0d1520] p-10 text-center text-[13px] text-slate-600">
                  Нет данных. Убедитесь что программы сохранены с весом упражнений.
                </div>
              )}

              {/* ── Status today ── */}
              {tonnageTab === 'status' && (
                <div className="space-y-2">
                  {teamStatusLoading && (
                    <div className="flex items-center justify-center py-16 text-[13px] text-slate-600">
                      <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-amber-400" />
                      Загрузка...
                    </div>
                  )}
                  {!teamStatusLoading && players.length === 0 && (
                    <div className="py-16 text-center text-[13px] text-slate-600">Нет игроков</div>
                  )}
                  {!teamStatusLoading && players.length > 0 && players.map(p => {
                    const st = teamStatus[p.id];
                    const hasSess = st?.hasSession;
                    const fb = st?.feedback;
                    return (
                      <div
                        key={p.id}
                        onClick={() => { selectPlayer(p); setMainSection('workouts'); }}
                        className={`flex items-center gap-3 rounded-2xl border px-4 py-3 cursor-pointer transition-all hover:border-white/[0.14] ${
                          hasSess ? 'border-emerald-500/20 bg-emerald-500/[0.04]' : 'border-white/[0.07] bg-white/[0.02]'
                        }`}
                      >
                        {p.photo ? (
                          <img src={p.photo} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover object-top" />
                        ) : (
                          <div className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg bg-white/[0.07] text-[10px] font-black text-slate-400">
                            {(p.name || '').split(' ').map(w => w[0]).join('').slice(0, 2)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-slate-200 truncate">{p.name}</p>
                          {p.position && <p className="text-[10px] text-slate-600">{p.position}</p>}
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          {fb?.feel && (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              fb.feel <= 3 ? 'bg-rose-500/20 text-rose-400' : fb.feel <= 6 ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
                            }`}>
                              {fb.feel}/10
                            </span>
                          )}
                          <span className={`text-[11px] font-semibold ${hasSess ? 'text-emerald-400' : 'text-slate-700'}`}>
                            {hasSess ? 'Сохранено' : 'Нет тр.'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {mainSection === 'workouts' && (<>
          <div className="mx-auto w-full max-w-5xl px-6 py-8 sm:px-10">

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
              {/* Prev/Next player navigation */}
              <div className="hidden sm:flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => prevPlayer && selectPlayer(prevPlayer)}
                  disabled={!prevPlayer}
                  title={prevPlayer ? `← ${prevPlayer.name} (Alt ←)` : undefined}
                  className="h-8 w-8 grid place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-slate-500 transition hover:border-white/[0.14] hover:text-slate-200 disabled:opacity-25 disabled:cursor-default"
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => nextPlayer && selectPlayer(nextPlayer)}
                  disabled={!nextPlayer}
                  title={nextPlayer ? `${nextPlayer.name} → (Alt →)` : undefined}
                  className="h-8 w-8 grid place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-slate-500 transition hover:border-white/[0.14] hover:text-slate-200 disabled:opacity-25 disabled:cursor-default"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
              <div
                className="relative group/avatar shrink-0 cursor-pointer h-14 w-14"
                onClick={() => { setEditPhotoFor(selectedPlayer.id); setPhotoInput(selectedPlayer.photo || ''); }}
                title="Изменить фото"
              >
                {/* Gradient ring */}
                <div className="absolute -inset-[2px] rounded-[18px] bg-gradient-to-br from-accent/70 via-accent/30 to-transparent" />
                {selectedPlayer.photo ? (
                  <img src={selectedPlayer.photo} alt="" className="relative h-14 w-14 rounded-2xl object-cover object-top" />
                ) : (
                  <div className="relative h-14 w-14 flex items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-cyan-600 text-[15px] font-black text-[#060a0e]">
                    {initials(selectedPlayer.name)}
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 opacity-0 group-hover/avatar:opacity-100 transition-opacity text-[14px]">📷</div>
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-[24px] font-black tracking-tight text-white leading-tight truncate">{selectedPlayer.name}</h1>
                <div className="mt-1 flex items-center gap-2">
                  {selectedPlayer.position && (
                    <span className="inline-flex items-center rounded-md border border-white/[0.10] bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                      {selectedPlayer.position}
                    </span>
                  )}
                </div>
              </div>
              {selectedPlayer.lastSessionDate && (
                <div className="hidden sm:block shrink-0 text-right">
                  <p className="text-[9px] uppercase tracking-wider text-slate-700">Последняя тр.</p>
                  <p className="text-[11px] font-semibold text-slate-500">{selectedPlayer.lastSessionDate}</p>
                </div>
              )}
            </div>
          ) : !playerId && (
            <></>
          )}

          {/* ── Workspace tabs: Программа / История ── */}
          {playerId && selectedPlayer && (
            <div className="mb-5 flex rounded-xl bg-white/[0.03] p-0.5 print:hidden border border-white/[0.06]">
              {[
                { id: 'program', label: 'Программа', icon: <Dumbbell size={12} /> },
                { id: 'history', label: 'История', icon: <History size={12} /> },
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setWorkspaceTab(t.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-[9px] py-2 text-[12px] font-semibold transition-all duration-200 ${
                    workspaceTab === t.id
                      ? 'bg-white/[0.09] text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-400'
                  }`}
                >
                  {t.icon}{t.label}
                </button>
              ))}
            </div>
          )}

          {/* ── Player contraindications (only on program tab) ── */}
          {playerId && selectedPlayer && workspaceTab === 'program' && (
            <div className={`mb-5 rounded-2xl border p-4 print:hidden transition-colors duration-300 ${
              restrictions.length > 0
                ? 'border-rose-500/25 bg-rose-500/[0.05]'
                : 'border-white/[0.07] bg-white/[0.02]'
            }`}>
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle size={12} className={restrictions.length > 0 ? 'text-rose-400' : 'text-slate-600'} />
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Ограничения</span>
                {restrictions.length > 0 && (
                  <span className="ml-auto rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-400">{restrictions.length} активно</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {RESTRICTIONS.map(r => {
                  const active = restrictions.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggleRestriction(r.id)}
                      title={r.desc}
                      className={`rounded-xl border px-3 py-1.5 text-[11px] font-semibold transition-all duration-200 active:scale-95 ${
                        active
                          ? 'border-rose-500/50 bg-rose-500/[0.18] text-rose-300 shadow-[0_0_12px_rgba(239,68,68,0.12)]'
                          : 'border-white/[0.07] bg-transparent text-slate-600 hover:border-white/[0.14] hover:text-slate-300'
                      }`}
                    >
                      {active && <span className="mr-1 text-rose-400">⚡</span>}{r.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── История тренировок ── */}
          {workspaceTab === 'history' && playerId && selectedPlayer && (
            <div className="print:hidden">
              {historyLoading && (
                <div className="flex items-center justify-center py-20 text-[13px] text-slate-600">
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-accent" />
                  Загрузка истории...
                </div>
              )}
              {!historyLoading && historyData && (historyData.sessions || []).length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <BookOpen size={32} className="mb-3 text-slate-700" />
                  <p className="text-[14px] font-semibold text-slate-600">Нет сохранённых тренировок</p>
                  <p className="mt-1 text-[12px] text-slate-700">Сохраните первую тренировку в разделе «Программа»</p>
                </div>
              )}
              {!historyLoading && historyData && (historyData.sessions || []).length > 0 && (
                <div className="space-y-3">
                  {/* Tonnage trend mini-chart */}
                  {historyData.sessions.filter(s => s.tonnage > 0).length >= 3 && (
                    <div className="mb-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-600">Тоннаж по тренировкам</span>
                        <span className="text-[10px] text-slate-700">{historyData.sessions.length} сессий</span>
                      </div>
                      <div className="flex items-end gap-1.5 h-10">
                        {[...historyData.sessions].reverse().map((s, i) => {
                          const maxTon = Math.max(...historyData.sessions.map(x => x.tonnage));
                          const h = maxTon > 0 ? Math.max(4, Math.round((s.tonnage / maxTon) * 40)) : 4;
                          return (
                            <div key={s.date} className="flex flex-col items-center gap-0.5 flex-1 min-w-0" title={`${s.date}: ${s.tonnage} кг`}>
                              <div
                                className={`w-full rounded-sm transition-all ${s.tonnage > 0 ? 'bg-accent/50' : 'bg-white/[0.04]'}`}
                                style={{ height: h }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Exercise progress — top recurring lifts */}
                  {Object.keys(exProgressData).length > 0 && (
                    <div className="mb-2">
                      <div className="mb-2.5 flex items-center gap-2 px-1">
                        <TrendingUp size={12} className="text-accent" />
                        <span className="text-[10px] font-black uppercase tracking-[0.20em] text-slate-600">Прогресс упражнений</span>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {Object.entries(exProgressData).map(([name, hist]) => {
                          if (!hist || hist.length < 2) return null;
                          const start = hist[0].kg;
                          const now = hist[hist.length - 1].kg;
                          const pct = start > 0 ? Math.round(((now - start) / start) * 100) : 0;
                          const up = now > start, flat = now === start;
                          return (
                            <div key={name} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
                              <div className="mb-2 flex items-start justify-between gap-2">
                                <span className="text-[12px] font-semibold text-slate-300 leading-tight line-clamp-2">{name}</span>
                                <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black tabular-nums ${
                                  flat ? 'bg-white/[0.05] text-slate-500'
                                       : up ? 'bg-emerald-500/[0.12] text-emerald-400'
                                            : 'bg-rose-500/[0.12] text-rose-400'
                                }`}>{flat ? '0%' : `${up ? '+' : ''}${pct}%`}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-1.5 text-[11px] tabular-nums">
                                  <span className="text-slate-600">{start}</span>
                                  <ArrowRight size={10} className="text-slate-700" />
                                  <span className="font-bold text-slate-200">{now}<span className="ml-0.5 text-[9px] font-normal text-slate-500">кг</span></span>
                                </div>
                                <Sparkline values={hist.map(e => e.kg)} width={50} height={18} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Session cards */}
                  {historyData.sessions.map(s => {
                    const isOpen = historyExpanded === s.date;
                    const dt = new Date(s.date + 'T00:00:00Z');
                    const label = dt.toLocaleDateString('ru', { day: 'numeric', month: 'long', weekday: 'short', timeZone: 'UTC' });
                    return (
                      <div key={s.date} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden transition-all hover:border-white/[0.12]">
                        <button
                          type="button"
                          onClick={() => setHistoryExpanded(isOpen ? null : s.date)}
                          className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                        >
                          <div className="shrink-0 h-9 w-9 flex items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.07]">
                            <History size={14} className="text-slate-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-slate-200 capitalize">{label}</p>
                            {s.dayGoal && <p className="mt-0.5 text-[11px] text-slate-500 truncate">{s.dayGoal}</p>}
                          </div>
                          <div className="shrink-0 text-right mr-2">
                            <p className="text-[13px] font-bold text-slate-300">
                              {s.tonnage > 0 ? (s.tonnage >= 1000 ? `${(s.tonnage / 1000).toFixed(1)}т` : `${s.tonnage}кг`) : '—'}
                            </p>
                            <p className="text-[10px] text-slate-600">{s.exerciseCount} упр.</p>
                          </div>
                          {isOpen ? <ChevronUp size={14} className="shrink-0 text-slate-600" /> : <ChevronDown size={14} className="shrink-0 text-slate-600" />}
                        </button>

                        {isOpen && (
                          <div className="border-t border-white/[0.06] px-4 pb-4 pt-3">
                            {s.exercises && s.exercises.length > 0 ? (
                              <div className="space-y-1.5">
                                {s.exercises.map((ex, ei) => {
                                  const blockColors = { A: 'text-amber-400', B: 'text-orange-400', C: 'text-sky-400', D: 'text-teal-400', E: 'text-violet-400' };
                                  const blockLetter = (ex.blockCode || '')[0] || '';
                                  const histEntries = exHistoryMap[ex.name] || [];
                                  return (
                                    <div key={ei} className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 hover:bg-white/[0.03]">
                                      {blockLetter && (
                                        <span className={`shrink-0 text-[10px] font-black w-4 ${blockColors[blockLetter] || 'text-slate-500'}`}>{blockLetter}</span>
                                      )}
                                      <span className="flex-1 text-[12px] text-slate-300 truncate">{ex.name}</span>
                                      {ex.kg > 0 ? (
                                        <div className="shrink-0 flex items-center gap-2">
                                          {histEntries.length >= 2 && (
                                            <Sparkline values={histEntries.map(e => e.kg)} width={36} height={12} />
                                          )}
                                          <span className="text-[11px] font-semibold text-slate-400">{ex.kg} кг</span>
                                        </div>
                                      ) : (
                                        <span className="shrink-0 text-[10px] text-slate-700">—</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-[12px] text-slate-600">Нет данных об упражнениях</p>
                            )}
                            {s.assessment && (
                              <div className="mt-3 overflow-hidden rounded-xl border border-accent/[0.12] bg-accent/[0.04]">
                                <div className="flex">
                                  <div className="w-1 shrink-0 bg-accent/40" />
                                  <div className="px-3.5 py-3">
                                    <div className="mb-1 text-[9px] font-black uppercase tracking-[0.22em] text-accent/60">Оценка состояния</div>
                                    <p className="text-[12px] leading-relaxed text-slate-300">{s.assessment}</p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {workspaceTab === 'program' && !playerId && (
            <div className="hidden sm:flex flex-col items-center justify-center min-h-[65vh] text-center print:hidden">
              <div className="mb-3 text-6xl opacity-10">🏋</div>
              <h2 className="text-[18px] font-black text-slate-600">Выберите игрока</h2>
              <p className="mt-1 text-sm text-slate-700">Состав — в панели слева</p>
            </div>
          )}

          {/* ── Schedule panel ── */}
          {workspaceTab === 'program' && keyConnected && playerId && (
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

          {/* ── Form + Results (only when player is selected, program tab) ── */}
          {workspaceTab === 'program' && playerId && <>
          <form
            onSubmit={handleGenerate}
            className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.06),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl sm:p-6 print:hidden"
          >
            {/* Session type toggle */}
            <div className="mb-5 flex rounded-2xl border border-white/[0.08] bg-white/[0.025] p-1">
              {[
                { value: 'gym', label: 'Тренажёрный зал', icon: <Dumbbell size={13} /> },
                { value: 'warmup', label: 'Разминка', icon: <Zap size={13} /> },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setSessionType(opt.value); setSession(null); setMeta(null); setError(''); }}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all duration-200 ${
                    sessionType === opt.value
                      ? 'bg-accent text-[#060a0e] shadow-[0_2px_16px_rgba(34,211,238,0.25)]'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>

            <div>
              <SectionLabel icon={<CalendarDays size={11} />} text="Дата тренировки" />
              <DatePicker value={date} onChange={setDate} maxDate={addDaysToStr(todayISO(), 1)} />
              <div className="mt-2 flex items-center gap-1.5">
                {[
                  { label: 'Вчера', offset: -1 },
                  { label: 'Сег.', offset: 0 },
                  { label: 'Завтра', offset: 1 },
                ].map(({ label, offset }) => {
                  const target = offset === 0 ? todayISO() : addDaysToStr(todayISO(), offset);
                  const active = date === target;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setDate(target)}
                      className={`rounded-lg border px-2 py-1 text-[10px] font-bold transition ${
                        active
                          ? 'border-accent/30 bg-accent/[0.07] text-accent'
                          : 'border-white/[0.07] bg-white/[0.02] text-slate-600 hover:border-white/[0.12] hover:text-slate-400'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {date > todayISO() && (
                <p className="mt-1.5 text-[10px] text-accent/70">
                  Данные сегодняшнего вечера будут использованы для генерации завтрашней тренировки
                </p>
              )}
            </div>

            {/* Recovery status */}
            {playerId && (
              <div className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-600">Состояние игрока</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { v: 'green',  emoji: '🟢', label: 'Норма',  on: 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300' },
                    { v: 'yellow', emoji: '🟡', label: '−25%',   on: 'border-amber-400/50 bg-amber-400/10 text-amber-300' },
                    { v: 'red',    emoji: '🔴', label: 'Тонус',  on: 'border-rose-400/50 bg-rose-400/10 text-rose-300' },
                  ].map(b => (
                    <button
                      key={b.v}
                      type="button"
                      onClick={() => changeRecovery(b.v)}
                      className={`flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2 text-[10px] font-semibold transition ${
                        recoveryStatus === b.v ? b.on : 'border-white/[0.07] text-slate-500 hover:border-white/[0.14] hover:text-slate-300'
                      }`}
                    >
                      <span className="text-[15px] leading-none">{b.emoji}</span>
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

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
                    <p className="mb-3 text-[10px] text-slate-600">Тестовые максимумы — система рассчитает точные кг в программе</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {ONE_RM_FIELDS.map(f => {
                        const fieldHistory = rmHistory.map(h => h[f.key]).filter(Boolean);
                        return (
                          <div key={f.key}>
                            <div className="mb-1 flex items-center justify-between gap-1">
                              <label className="block text-[10px] font-semibold text-slate-500">{f.label}</label>
                              <Sparkline values={fieldHistory} />
                            </div>
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
                        );
                      })}
                    </div>
                    <RMChart history={rmHistory} fields={ONE_RM_FIELDS} />
                  </div>
                )}

                {/* Load + neuro trends (Feature 2) */}
                <button
                  type="button"
                  onClick={() => setTrendsOpen(o => !o)}
                  className={`mt-2 flex w-full items-center gap-2.5 rounded-xl border px-4 py-2.5 text-left text-xs font-semibold transition-all duration-200 ${focusRing} ${
                    trendsOpen
                      ? 'border-accent/30 bg-accent/[0.07] text-accent'
                      : 'border-white/[0.07] bg-white/[0.025] text-slate-400 hover:border-white/[0.12] hover:text-slate-200'
                  }`}
                >
                  <TrendingUp size={12} className={trendsOpen ? 'text-accent' : 'text-slate-600'} />
                  <span>Нагрузка и нейро</span>
                  <ChevronDown size={12} className={`ml-auto shrink-0 transition-transform duration-200 ${trendsOpen ? 'rotate-180' : ''}`} />
                </button>
                {trendsOpen && (
                  <div className="animate-fade-in">
                    {trendsLoading ? (
                      <div className="mt-3 flex items-center justify-center py-6 text-[11px] text-slate-600">
                        <Loader2 size={14} className="mr-2 animate-spin" /> Загрузка...
                      </div>
                    ) : (
                      <TrendCharts data={trendsData} />
                    )}
                    {/* LSI — jump limb-symmetry index (manual entry) */}
                    <div className="mt-3 flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-black/20 px-3 py-2.5">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">LSI</span>
                      <span className="text-[10px] text-slate-600">симметрия прыжка L/R</span>
                      <input
                        type="number"
                        placeholder="—%"
                        min="50"
                        max="100"
                        className="ml-auto w-14 border-b border-white/[0.07] bg-transparent text-center text-[11px] text-slate-300 outline-none"
                        value={lsiValue}
                        onChange={e => handleLSIChange(e.target.value)}
                      />
                      {lsiValue !== '' && Number(lsiValue) < 85 && (
                        <span className="text-[9px] font-semibold text-rose-400">⚠ {lsiValue}%</span>
                      )}
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
                    className={`rounded-xl border px-3.5 py-3 text-left transition-all duration-200 active:scale-[0.98] ${
                      focus === ph.value
                        ? `${PERIOD_COLORS[period].card}`
                        : 'border-white/[0.07] text-slate-400 hover:border-white/[0.13] hover:bg-white/[0.025]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`shrink-0 rounded-full transition-all duration-200 ${focus === ph.value ? `h-2 w-2 ${PERIOD_COLORS[period].dot} shadow-[0_0_6px_currentColor]` : 'h-1.5 w-1.5 bg-slate-700'}`} />
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

              {autoFocusNote && (
                <div className="mb-2 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2">
                  <Check size={12} className="shrink-0 text-emerald-400" />
                  <span className="text-[11px] text-emerald-300">Фокус применён автоматически: {autoFocusNote}</span>
                </div>
              )}

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
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] px-4 py-2.5">
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
                        ? 'bg-accent/[0.15] text-accent/90'
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

            {/* Microcycle templates */}
            {sessionType === 'gym' && apiKey && (
              <div className="relative mt-5">
                <button
                  type="button"
                  onClick={() => setTemplatesOpen(o => !o)}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-slate-300 transition-all hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white ${focusRing}`}
                >
                  <Layers size={14} />
                  Шаблоны микроциклов
                  {templates.length > 0 && (
                    <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] text-slate-400">{templates.length}</span>
                  )}
                  <ChevronDown size={13} className={`ml-auto transition-transform ${templatesOpen ? 'rotate-180' : ''}`} />
                </button>
                {templatesOpen && (
                  <div className="absolute left-0 right-0 z-20 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-white/[0.10] bg-[#0b1622] p-1.5 shadow-2xl">
                    {templates.length === 0 ? (
                      <div className="px-3 py-3 text-center text-[11px] text-slate-600">Нет сохранённых шаблонов</div>
                    ) : (
                      templates.map(t => (
                        <div key={t.name} className="flex items-center gap-2 rounded-lg px-2.5 py-2 transition hover:bg-white/[0.05]">
                          <button
                            type="button"
                            onClick={() => handleLoadTemplate(t.name)}
                            className="flex-1 text-left"
                          >
                            <div className="text-xs font-semibold text-slate-200">{t.name}</div>
                            <div className="text-[10px] text-slate-600">{t.exerciseCount} упр.{t.focus ? ` · ${t.focus}` : ''}</div>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTemplate(t.name)}
                            className="rounded p-1 text-slate-600 transition hover:bg-rose-500/10 hover:text-rose-400"
                            title="Удалить шаблон"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            <div className={`mt-6 ${sessionType === 'gym' ? 'flex gap-3' : ''}`}>
            <button
              type="submit"
              disabled={loading || weekPlanLoading || !apiKey || !playerId}
              className={`flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-b from-cyan-400 to-cyan-500 px-5 py-4 text-[15px] font-black text-[#04212b] shadow-[0_2px_20px_-4px_rgba(34,211,238,0.45)] transition-all duration-200 hover:from-cyan-300 hover:to-cyan-400 hover:shadow-[0_4px_28px_-4px_rgba(34,211,238,0.55)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none ${focusRing} ${sessionType === 'gym' ? 'flex-1' : 'w-full'}`}
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
            {sessionType === 'gym' && apiKey && players.length > 0 && (
              <button
                type="button"
                onClick={() => { setBatchOpen(o => !o); setBatchResults([]); }}
                disabled={loading || weekPlanLoading || batchRunning}
                className={`flex items-center justify-center gap-2 rounded-xl border ${batchOpen ? 'border-accent/40 bg-accent/10 text-accent' : 'border-white/[0.10] bg-white/[0.04] text-slate-300'} px-4 py-3.5 text-sm font-semibold transition-all hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-30 ${focusRing}`}
                title="Сгенерировать тренировки для всей команды сразу"
              >
                <Users size={15} />
                <span className="hidden sm:inline">Команда</span>
              </button>
            )}
            </div>
          </form>

          {/* ── Batch generation panel ── */}
          {batchOpen && sessionType === 'gym' && (
            <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 backdrop-blur-xl print:hidden">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Users size={14} className="text-accent" />
                  <span className="text-sm font-bold text-white">Генерация для команды</span>
                  {batchSelectedIds.size > 0 && (
                    <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-bold text-accent">{batchSelectedIds.size}</span>
                  )}
                </div>
                <button onClick={() => { setBatchOpen(false); setBatchResults([]); setBatchRunning(false); }} className="text-slate-600 hover:text-slate-400 transition">
                  <X size={16} />
                </button>
              </div>

              {/* Player checkboxes — hidden when running or results shown */}
              {!batchRunning && batchResults.length === 0 && (
                <>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">Выбери игроков для сегодняшней тренировки</span>
                    <button
                      type="button"
                      onClick={toggleAllBatch}
                      className="text-[11px] font-semibold text-accent hover:text-accent/70 transition"
                    >
                      {batchSelectedIds.size === players.length ? 'Снять все' : 'Выбрать всех'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {players.map(p => {
                      const sel = batchSelectedIds.has(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggleBatchPlayer(p.id)}
                          className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-all ${
                            sel
                              ? 'border-accent/40 bg-accent/10'
                              : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'
                          }`}
                        >
                          {sel ? <CheckSquare size={13} className="shrink-0 text-accent" /> : <Square size={13} className="shrink-0 text-slate-600" />}
                          <div className="min-w-0">
                            <div className={`truncate text-[12px] font-semibold leading-tight ${sel ? 'text-white' : 'text-slate-400'}`}>{p.name.split(' ')[0]}</div>
                            <div className="text-[10px] text-slate-600 truncate">{p.position || '—'}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={runBatchGeneration}
                      disabled={batchSelectedIds.size === 0 || !apiKey}
                      className={`flex w-full items-center justify-center gap-2 rounded-xl bg-accent/90 px-5 py-3 text-sm font-bold text-[#060a0e] transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30 ${focusRing}`}
                    >
                      <Zap size={14} strokeWidth={2.5} />
                      Запустить для {batchSelectedIds.size} {batchSelectedIds.size === 1 ? 'игрока' : batchSelectedIds.size < 5 ? 'игроков' : 'игроков'}
                    </button>
                    <p className="mt-2 text-center text-[10px] text-slate-600">Дата: {date} · Фаза: {focus} · Сессии сохранятся автоматически</p>
                  </div>
                </>
              )}

              {/* Progress grid */}
              {(batchRunning || batchResults.length > 0) && (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {batchResults.map(r => (
                      <div key={r.playerId} onClick={() => r.status === 'done' && setPlayerId(r.playerId)} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-all ${r.status === 'done' ? 'cursor-pointer hover:border-emerald-500/50' : ''} ${
                        r.status === 'done'       ? 'border-emerald-500/30 bg-emerald-500/[0.07]' :
                        r.status === 'error'      ? 'border-rose-500/30 bg-rose-500/[0.07]' :
                        r.status === 'generating' ? 'border-accent/30 bg-accent/[0.06]' :
                        'border-white/[0.05] bg-white/[0.015]'
                      }`}>
                        <div className="shrink-0">
                          {r.status === 'done'       && <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400"><Check size={10} strokeWidth={3} /></div>}
                          {r.status === 'error'      && <div className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/20 text-rose-400"><X size={10} strokeWidth={3} /></div>}
                          {r.status === 'generating' && <Loader2 size={14} className="animate-spin text-accent" />}
                          {r.status === 'queued'     && <div className="h-5 w-5 rounded-full border border-white/[0.08]" />}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-semibold leading-tight text-slate-200">{r.name.split(' ')[0]}</div>
                          <div className={`text-[10px] truncate ${
                            r.status === 'done'       ? 'text-emerald-400' :
                            r.status === 'error'      ? 'text-rose-400' :
                            r.status === 'generating' ? 'text-accent' :
                            'text-slate-600'
                          }`}>
                            {r.status === 'done'       ? 'Сохранено' :
                             r.status === 'error'      ? (r.error || 'Ошибка') :
                             r.status === 'generating' ? 'Генерирую...' : 'В очереди'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {!batchRunning && (
                    <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                      <span className="text-[11px] text-slate-500">
                        {batchResults.filter(r => r.status === 'done').length} из {batchResults.length} готово
                        {batchResults.some(r => r.status === 'error') && ` · ${batchResults.filter(r => r.status === 'error').length} ошибок`}
                      </span>
                      <div className="flex items-center gap-3">
                        {batchResults.some(r => r.status === 'error') && (
                          <button
                            type="button"
                            onClick={retryFailedBatch}
                            className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-400 hover:text-rose-300 transition"
                          >
                            <RefreshCw size={11} />
                            Повторить ошибки ({batchResults.filter(r => r.status === 'error').length})
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => { setBatchResults([]); setBatchSelectedIds(new Set()); }}
                          className="flex items-center gap-1.5 text-[11px] font-semibold text-accent hover:text-accent/70 transition"
                        >
                          <RefreshCw size={11} />
                          Новый запуск
                        </button>
                      </div>
                    </div>
                  )}
                  {batchRunning && (
                    <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
                      <Loader2 size={11} className="animate-spin" />
                      Генерирую последовательно — упражнения не пересекаются между игроками
                    </div>
                  )}
                </>
              )}
            </div>
          )}

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

          {/* ── Generation progress ── */}
          {loading && !session && (
            <div className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 backdrop-blur-xl print:hidden">
              {/* Stage + progress bar */}
              <div className="mb-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Loader2 size={14} className="animate-spin text-accent shrink-0" />
                    <span className="text-[13px] font-semibold text-slate-300 transition-all duration-500">
                      {resuming ? 'Продолжаю генерацию...' : (genStage || 'Запускаю генерацию...')}
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-slate-600 tabular-nums">
                    {genProgress}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-1.5 rounded-full bg-accent transition-all duration-700 ease-out"
                    style={{ width: `${genProgress}%` }}
                  />
                </div>
              </div>

              {/* Skeleton blocks */}
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="h-7 w-7 animate-pulse rounded-lg bg-accent/10" />
                  <div className="h-3.5 w-28 animate-pulse rounded-lg bg-white/[0.06]" />
                  <div className="h-px flex-1 bg-white/[0.04]" />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[1,2,3].map(i => (
                    <div key={i} className="h-48 animate-pulse rounded-2xl bg-white/[0.04]" style={{ animationDelay: `${i * 80}ms` }} />
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-7 w-7 animate-pulse rounded-lg bg-accent/10" style={{ animationDelay: '240ms' }} />
                  <div className="h-3.5 w-24 animate-pulse rounded-lg bg-white/[0.06]" style={{ animationDelay: '240ms' }} />
                  <div className="h-px flex-1 bg-white/[0.04]" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[1,2].map(i => (
                    <div key={i} className="h-48 animate-pulse rounded-2xl bg-white/[0.04]" style={{ animationDelay: `${(i+3)*80}ms` }} />
                  ))}
                </div>
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
                  {/* Icon-only secondary actions */}
                  <div className="flex items-center rounded-xl border border-white/[0.07] bg-white/[0.025] p-1 gap-0.5">
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className={`grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.07] hover:text-slate-200 ${focusRing}`}
                      title="Печать"
                    >
                      <Printer size={14} />
                    </button>
                    {session?.blocks?.length > 0 && (
                      <button
                        type="button"
                        onClick={handleSaveTemplate}
                        className={`grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.07] hover:text-slate-200 ${focusRing}`}
                        title="Сохранить как шаблон микроцикла"
                      >
                        <Layers size={14} />
                      </button>
                    )}
                    {(justSaved || autoSaved || pendingSaved) && (
                      <button
                        type="button"
                        onClick={() => setCopyModalOpen(true)}
                        className={`grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.07] hover:text-slate-200 ${focusRing}`}
                        title="Скопировать тренировку другому игроку"
                      >
                        <Copy size={14} />
                      </button>
                    )}
                  </div>
                  {/* Primary save */}
                  {autoSaved && meta.sessionType === 'gym' ? (
                    <span className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.10] px-3.5 py-2 text-xs font-bold text-emerald-400">
                      <Check size={13} strokeWidth={3} />
                      Сохранено
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className={`flex items-center gap-1.5 rounded-xl bg-cyan-500 px-3.5 py-2 text-xs font-bold text-[#04212b] shadow-[0_2px_12px_-2px_rgba(34,211,238,0.35)] transition hover:bg-cyan-400 disabled:opacity-50 ${focusRing}`}
                    >
                      {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                      {justSaved ? 'Сохранено ✓' : 'Сохранить'}
                    </button>
                  )}
                  {pendingSaved && session && (
                    <button
                      type="button"
                      onClick={handleCompleteWorkout}
                      disabled={savingActual}
                      className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-50"
                    >
                      {savingActual ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      Завершить
                    </button>
                  )}
                </div>
              </div>

              {/* Plan vs Actual compliance summary */}
              {compliance && (
                <div className="mt-3 mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-2.5 text-[11px] animate-fade-in print:hidden">
                  <span className="font-black text-emerald-400 text-[15px]">{compliance.percent}%</span>
                  <span className="text-slate-500">выполнено</span>
                  <span className="text-slate-600">·</span>
                  <span className="text-slate-400">план <span className="text-slate-200 font-semibold">{Math.round(compliance.plannedTonnage / 1000 * 10) / 10}т</span></span>
                  <span className="text-slate-600">→</span>
                  <span className="text-slate-400">факт <span className={`font-semibold ${compliance.actualTonnage / compliance.plannedTonnage < 0.8 ? 'text-rose-400' : 'text-emerald-400'}`}>{Math.round(compliance.actualTonnage / 1000 * 10) / 10}т</span></span>
                </div>
              )}

              {/* Volume stats bar */}
              {volumeStats && volumeStats.sessions > 0 && (
                <div className="mb-4 rounded-2xl border border-white/[0.05] bg-white/[0.02] px-4 py-3 print:hidden">
                  <div className="mb-2.5 flex items-center gap-2">
                    <BarChart2 size={10} className="text-slate-600" />
                    <span className="text-[9px] font-black uppercase tracking-[0.20em] text-slate-600">Объём за 7д</span>
                    <span className="ml-auto text-[9px] text-slate-700">{volumeStats.sessions} сессий</span>
                  </div>
                  <div className="flex items-end gap-2.5">
                    {['A', 'B', 'C', 'D', 'E'].map(label => {
                      const val = volumeStats.byBlock[label];
                      if (!val) return null;
                      const bc = blockCfg(label);
                      const maxVal = Math.max(...['A','B','C','D','E'].map(l => volumeStats.byBlock[l] || 0));
                      const pct = Math.max(8, Math.round((val / maxVal) * 100));
                      return (
                        <div key={label} className="flex flex-1 flex-col items-center gap-1.5">
                          <span className="text-[10px] font-bold text-slate-400 tabular-nums">{val}</span>
                          <div className="relative h-14 w-full max-w-[28px] overflow-hidden rounded-md bg-white/[0.04]">
                            <div className={`absolute inset-x-0 bottom-0 rounded-md ${bc.circle} transition-all duration-500`} style={{ height: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] font-black text-slate-500">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Assessment */}
              {session.assessment && (
                <div className="mb-3 overflow-hidden rounded-2xl border border-accent/[0.12] bg-accent/[0.04] print:hidden">
                  <div className="flex gap-0">
                    <div className="w-1 shrink-0 bg-accent/40" />
                    <div className="px-4 py-4">
                      <div className="mb-1.5 text-[9px] font-black uppercase tracking-[0.22em] text-accent/60">Оценка состояния</div>
                      <p className="text-[14px] leading-relaxed text-slate-200">{session.assessment}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Periodization note */}
              {session.periodization_note && (
                <div className="mb-5 overflow-hidden rounded-2xl border border-white/[0.05] bg-white/[0.015] print:hidden">
                  <div className="flex gap-0">
                    <div className="w-1 shrink-0 bg-slate-600/50" />
                    <div className="px-4 py-4">
                      <div className="mb-1.5 text-[9px] font-black uppercase tracking-[0.22em] text-slate-600">Логика периодизации</div>
                      <p className="text-[14px] leading-relaxed text-slate-500">{session.periodization_note}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Camp methodology violations */}
              {methodViolations.length > 0 && (
                <div className="mb-4 rounded-2xl border border-rose-500/25 bg-rose-500/[0.06] p-4 print:hidden">
                  <div className="mb-2 flex items-center gap-2">
                    <AlertTriangle size={13} className="text-rose-400" />
                    <span className="text-[11px] font-black uppercase tracking-wider text-rose-400">Нарушение методики сборов</span>
                  </div>
                  <div className="space-y-1">
                    {methodViolations.map((v, i) => (
                      <p key={i} className="text-[12px] text-rose-300/80">· {v.name} — запрещён в фазе сборов ({v.label})</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Recovery status warning */}
              {recoveryStatus === 'yellow' && (
                <div className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-2.5 print:hidden">
                  <AlertTriangle size={13} className="shrink-0 text-amber-400" />
                  <span className="text-[12px] font-bold text-amber-300">Объём −25% · умеренная нагрузка</span>
                </div>
              )}
              {recoveryStatus === 'red' && (
                <div className="mb-4 flex items-center gap-3 rounded-2xl border border-rose-500/25 bg-rose-500/[0.06] px-4 py-2.5 print:hidden">
                  <AlertTriangle size={13} className="shrink-0 text-rose-400" />
                  <span className="text-[12px] font-bold text-rose-300">Только тонус · профилактика · без тяжёлого</span>
                </div>
              )}

              {/* Camp evening-conditioning info (weeks 1-3) */}
              {period === 'camp' && campEveningNote(date) && (
                <div className="mb-4 flex items-center gap-2.5 rounded-2xl border border-slate-500/20 bg-slate-500/[0.05] px-4 py-2 print:hidden">
                  <Info size={13} className="shrink-0 text-slate-400" />
                  <span className="text-[12px] font-medium text-slate-400">{campEveningNote(date)}</span>
                </div>
              )}

              {/* Volume stats bar */}
              {sessionVolume && (
                <div className="mb-6 flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 print:hidden">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">Упр.</span>
                    <span className="text-[18px] font-black text-slate-200">{sessionVolume.exCount}</span>
                  </div>
                  <div className="h-6 w-px bg-white/[0.06]" />
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">Подх.</span>
                    <span className="text-[18px] font-black text-slate-200">{sessionVolume.sets}</span>
                  </div>
                  {sessionVolume.tonnes && (
                    <>
                      <div className="h-6 w-px bg-white/[0.06]" />
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">Тоннаж</span>
                        <span className="text-[18px] font-black text-accent">~{sessionVolume.tonnes}т</span>
                      </div>
                    </>
                  )}
                  {jumpVolume && (
                    <>
                      <div className="h-6 w-px bg-white/[0.06]" />
                      <div className={`flex items-center gap-1.5 ${jumpVolume.sets > 12 ? 'text-amber-400' : ''}`}>
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">Прыжки</span>
                        <span className={`text-[18px] font-black ${jumpVolume.sets > 12 ? 'text-amber-400' : 'text-slate-200'}`}>{jumpVolume.sets}</span>
                        <span className="text-[10px] text-slate-700">под.</span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* High jump volume warning */}
              {jumpVolume && jumpVolume.sets > 12 && (
                <div className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] px-4 py-2.5 print:hidden">
                  <Zap size={13} className="shrink-0 text-amber-400" />
                  <div>
                    <span className="text-[12px] font-bold text-amber-300">Высокий прыжковый объём</span>
                    <span className="ml-2 text-[11px] text-amber-400/70">{jumpVolume.exCount} упр. · {jumpVolume.sets} под. — проверь суставную нагрузку</span>
                  </div>
                </div>
              )}

              {/* Blocks — screen only */}
              <div className="space-y-10 print:hidden">
                {(session.blocks || []).map((block, bi) => (
                  <div key={bi}>
                    {(() => {
                      const bc = blockCfg(block.label);
                      const isCollapsed = collapsedBlocks.has(block.label);
                      return (
                        <button
                          type="button"
                          onClick={() => toggleBlock(block.label)}
                          className={`mb-4 flex w-full items-center gap-3.5 text-left rounded-xl py-1 transition-opacity hover:opacity-90 ${focusRing}`}
                        >
                          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${bc.circle} text-base font-black text-[#04212b] ring-1 ring-inset ring-white/20`}>
                            {block.label}
                          </span>
                          <div className="min-w-0">
                            <div className={`text-[11px] font-black uppercase tracking-[0.18em] ${bc.sub}`}>Блок {block.label}</div>
                            {block.rest_note && (
                              <div className="text-[13px] leading-none text-slate-500 mt-0.5">⏱ {block.rest_note}</div>
                            )}
                          </div>
                          {isCollapsed && (
                            <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-bold text-slate-500">
                              {(block.exercises || []).length} упр.
                            </span>
                          )}
                          <div className={`h-px flex-1 bg-gradient-to-r ${bc.line} to-transparent`} />
                          <span className="shrink-0 grid h-7 w-7 place-items-center rounded-lg text-slate-600 transition hover:text-slate-300 print:hidden">
                            {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                          </span>
                        </button>
                      );
                    })()}
                    {!collapsedBlocks.has(block.label) && (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {(block.exercises || []).map((ex, ei) => (
                        <ExerciseCard
                          key={ex.code || ei}
                          apiKey={apiKey}
                          code={ex.code}
                          name={ex.name}
                          targetSets={ex.targetSets || []}
                          weightNote={ex.weightNote || ''}
                          weightKg={ex.weightKg != null ? ex.weightKg : parseKgFromNote(ex.weightNote)}
                          tempo={ex.tempo || ''}
                          autoReg={ex.autoReg || ''}
                          cue={ex.cue || ''}
                          focus={focus}
                          week={weekFromFocus(focus)}
                          oneRM={oneRM}
                          position={selectedPlayer?.position || null}
                          prevKg={progressionMap[ex.name]?.kg || null}
                          prevRpe={progressionMap[ex.name]?.rpe || null}
                          suggestedKg={progressionMap[ex.name]?.suggestedKg || null}
                          restrictions={restrictions}
                          exHistory={exHistoryMap[ex.name] || []}
                          actualKg={ex.actualKg ?? null}
                          onActualKgChange={pendingSaved ? (v => updateExercise(bi, ei, { actualKg: v })) : undefined}
                          actualRpe={ex.actualRpe ?? null}
                          onActualRpeChange={pendingSaved ? (v => updateExercise(bi, ei, { actualRpe: v })) : undefined}
                          onChangeName={v => updateExercise(bi, ei, { name: v })}
                          onChangeSet={(si, v) => updateSet(bi, ei, si, v)}
                          onAddSet={() => addSetRow(bi, ei)}
                          onChangeWeight={v => updateExercise(bi, ei, { weightNote: v })}
                          onChangeWeightKg={v => updateExercise(bi, ei, {
                            weightKg: v,
                            weightNote: v != null ? `${v} кг` : (ex.weightNote || ''),
                          })}
                          onChangeTempo={v => updateExercise(bi, ei, { tempo: v })}
                          onChangeAutoReg={v => updateExercise(bi, ei, { autoReg: v })}
                          onChangeCue={v => updateExercise(bi, ei, { cue: v })}
                          onRegenerate={() => regenerateExercise(bi, ei)}
                        />
                      ))}
                    </div>
                    )}
                    {/* Quick-add exercise */}
                    {!collapsedBlocks.has(block.label) && (
                      addExBlock === bi ? (
                        <div className="mt-3 flex items-center gap-2 print:hidden">
                          <input
                            type="text"
                            autoFocus
                            value={addExQuery}
                            onChange={e => setAddExQuery(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.preventDefault(); addExerciseToBlock(bi, addExQuery); }
                              if (e.key === 'Escape') { setAddExBlock(null); setAddExQuery(''); }
                            }}
                            placeholder="Название упражнения..."
                            className="flex-1 rounded-xl border border-accent/30 bg-white/[0.04] px-3 py-2 text-[13px] text-slate-200 outline-none placeholder:text-slate-700 focus:border-accent/50"
                          />
                          <button
                            type="button"
                            onClick={() => addExerciseToBlock(bi, addExQuery)}
                            className="shrink-0 rounded-xl bg-accent/10 px-3 py-2 text-[12px] font-bold text-accent transition hover:bg-accent/20"
                          >
                            Добавить
                          </button>
                          <button
                            type="button"
                            onClick={() => { setAddExBlock(null); setAddExQuery(''); }}
                            className="shrink-0 rounded-xl p-2 text-slate-600 transition hover:text-slate-400"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setAddExBlock(bi); setAddExQuery(''); }}
                          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/[0.08] py-2.5 text-[12px] font-semibold text-slate-700 transition hover:border-accent/30 hover:text-accent print:hidden"
                        >
                          <Plus size={13} />
                          Добавить упражнение
                        </button>
                      )
                    )}
                  </div>
                ))}
              </div>

              {/* Warnings — screen only */}
              {session.warnings && (
                <div className="mt-6 rounded-2xl border border-amber-500/25 bg-gradient-to-b from-amber-500/[0.08] to-amber-500/[0.03] p-5 print:hidden">
                  <div className="mb-2.5 flex items-center gap-2">
                    <span className="text-base">⚠️</span>
                    <span className="text-[9px] font-black uppercase tracking-[0.24em] text-amber-400/80">Предостережения</span>
                  </div>
                  <p className="text-[13px] leading-relaxed text-amber-200/75">{session.warnings}</p>
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
              <span className="text-[11px] text-white/[0.10]">powered by AI</span>
            </footer>
          )}

          </div>
          </>)} {/* end workouts section */}
        </div>{/* /workspace */}
      </div>{/* /flex */}

      {/* ── Copy program modal ── */}
      {copyModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setCopyModalOpen(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl border border-white/[0.1] bg-[#0d1e30] p-5 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="mb-1 text-sm font-bold text-white">Скопировать тренировку</h3>
            <p className="mb-4 text-[11px] text-slate-500">Кому скопировать программу на {date}?</p>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {players.filter(p => p.id !== playerId).map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => copyTo(p.id)}
                  disabled={copying}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.06] disabled:opacity-50"
                >
                  {p.photo ? (
                    <img src={p.photo} alt="" className="h-7 w-7 shrink-0 rounded-lg object-cover object-top" />
                  ) : (
                    <div className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg bg-white/[0.07] text-[10px] font-black text-slate-400">
                      {initials(p.name)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-slate-200 truncate">{p.name}</div>
                    <div className="text-[10px] text-slate-600">{p.position || '—'}</div>
                  </div>
                  <span className={`h-2 w-2 rounded-full ${positionDot(p.position)}`} />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setCopyModalOpen(false)}
              className="mt-3 w-full rounded-xl border border-white/[0.07] py-2 text-xs text-slate-500 hover:text-slate-300 transition"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* ── Copy done toast ── */}
      {copyDone && (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl border border-emerald-500/30 bg-[#0d2010] px-4 py-3 text-sm font-semibold text-emerald-300 shadow-xl animate-fade-in">
          ✓ Скопировано → {copyDone}
        </div>
      )}

      {/* ── Photo edit modal ── */}
      {editPhotoFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => { if (!photoUploading) setEditPhotoFor(null); }}
        >
          <div
            className="w-full max-w-xs rounded-2xl border border-white/[0.1] bg-[#0d1e30] p-5 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="mb-4 text-sm font-bold text-white">Фото профиля</h3>

            {/* File upload — primary */}
            <button
              type="button"
              onClick={() => photoFileRef.current?.click()}
              disabled={photoUploading}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-accent/30 bg-accent/[0.05] py-4 text-[13px] font-semibold text-accent transition hover:border-accent/60 hover:bg-accent/[0.10] disabled:opacity-50"
            >
              {photoUploading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
                  Загружаю…
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Выбрать фото с компьютера
                </>
              )}
            </button>
            <input
              ref={photoFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadPlayerPhoto(f); e.target.value = ''; }}
            />

            {/* URL fallback */}
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">или ссылка</div>
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://..."
                value={photoInput}
                onChange={e => setPhotoInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && savePhoto()}
                className="min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none focus:border-accent/40"
              />
              <button
                type="button"
                onClick={() => savePhoto()}
                disabled={!photoInput.trim() || photoUploading}
                className="rounded-xl bg-accent/20 px-3 py-2 text-sm font-semibold text-accent transition hover:bg-accent/30 disabled:opacity-40"
              >
                ОК
              </button>
            </div>

            <div className="mt-3 flex justify-between gap-2">
              {players.find(p => p.id === editPhotoFor)?.photo && (
                <button
                  type="button"
                  onClick={() => savePhoto('')}
                  disabled={photoUploading}
                  className="rounded-xl border border-white/[0.07] px-3 py-2 text-xs text-slate-500 hover:text-rose-400 transition disabled:opacity-40"
                >
                  Удалить фото
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditPhotoFor(null)}
                disabled={photoUploading}
                className="ml-auto rounded-xl border border-white/[0.07] px-3 py-2 text-xs text-slate-500 hover:text-slate-300 transition disabled:opacity-40"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard shortcuts hint bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 hidden items-center justify-center gap-4 border-t border-white/[0.04] bg-[#060c15]/80 px-4 py-1.5 backdrop-blur-sm sm:flex print:hidden">
        <span className="flex items-center gap-1.5 text-[10px] text-slate-700">
          <kbd className="rounded px-1 py-0.5 border border-white/[0.08] bg-white/[0.04] font-mono text-[9px] text-slate-600">G</kbd>
          Генерация
        </span>
        <span className="text-slate-800">·</span>
        <span className="flex items-center gap-1.5 text-[10px] text-slate-700">
          <kbd className="rounded px-1 py-0.5 border border-white/[0.08] bg-white/[0.04] font-mono text-[9px] text-slate-600">S</kbd>
          Сохранить
        </span>
        <span className="text-slate-800">·</span>
        <span className="flex items-center gap-1.5 text-[10px] text-slate-700">
          <kbd className="rounded px-1 py-0.5 border border-white/[0.08] bg-white/[0.04] font-mono text-[9px] text-slate-600">Alt</kbd>
          <kbd className="rounded px-1 py-0.5 border border-white/[0.08] bg-white/[0.04] font-mono text-[9px] text-slate-600">← →</kbd>
          Игрок
        </span>
      </div>
    </>
  );
}
