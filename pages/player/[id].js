// pages/player/[id].js
// Individual player training page — shared link, read-only, mobile-first.
// SSR: fetches today's saved session from Redis server-side (no client secrets exposed).

import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { redis } from '../../lib/redis';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
}

export async function getServerSideProps({ params }) {
  const token = params.id;
  const date = todayISO();

  // Resolve token → playerId (never expose playerId to the client)
  const playerId = await redis('get', `coach:share_token:${token}`).catch(() => null);
  if (!playerId) {
    return { props: { session: null, player: null, sessionDate: null, dayGoal: '', isToday: false, notFound: true } };
  }

  let record = null;
  const rawToday = await redis('get', `coach:session:${playerId}:${date}`).catch(() => null);

  if (rawToday) {
    try { record = typeof rawToday === 'string' ? JSON.parse(rawToday) : rawToday; } catch (_) {}
  }

  if (!record) {
    const dates = await redis('zrange', `coach:sessions:${playerId}`, -1, -1).catch(() => []);
    if (dates?.length) {
      const rawLast = await redis('get', `coach:session:${playerId}:${dates[0]}`).catch(() => null);
      if (rawLast) { try { record = typeof rawLast === 'string' ? JSON.parse(rawLast) : rawLast; } catch (_) {} }
    }
  }

  if (!record) {
    return { props: { session: null, player: null, sessionDate: null, dayGoal: '', isToday: false, notFound: false } };
  }

  return {
    props: {
      session: record.session || null,
      player: record.player || null,
      sessionDate: record.date || date,
      dayGoal: record.dayGoal || '',
      isToday: (record.date || '') === date,
      notFound: false,
    },
  };
}

// ── Set button — tappable, turns green when done ─────────────────────────────
function SetBtn({ label, value, done, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex min-w-[58px] flex-col items-center rounded-2xl border px-3 py-2.5 transition-all duration-200 active:scale-95 ${
        done
          ? 'border-emerald-500/50 bg-emerald-500/[0.18] shadow-[0_0_12px_rgba(52,211,153,0.15)]'
          : 'border-white/[0.10] bg-white/[0.04]'
      }`}
    >
      <span className={`text-[10px] font-bold mb-0.5 ${done ? 'text-emerald-400' : 'text-slate-600'}`}>
        {done ? '✓' : label}
      </span>
      <span className={`text-sm font-black leading-none ${done ? 'text-emerald-300' : 'text-slate-200'}`}>
        {value}
      </span>
    </button>
  );
}

// ── Single exercise card ──────────────────────────────────────────────────────
function ExCard({ bi, ei, ex, done, onToggle }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]">
      {/* Header */}
      <div className="flex items-center gap-2.5 bg-gradient-to-r from-[#22d3ee]/[0.14] to-transparent px-4 py-3">
        <span className="shrink-0 rounded-lg bg-[#22d3ee]/20 px-2 py-1 text-[11px] font-black text-[#22d3ee]">
          {ex.code}
        </span>
        {ex.tempo && (
          <span className="shrink-0 rounded-lg border border-blue-500/25 bg-blue-500/[0.10] px-2 py-0.5 text-[10px] font-bold text-blue-400">
            {ex.tempo}
          </span>
        )}
        <span className="text-[15px] font-bold leading-snug text-white">{ex.name}</span>
      </div>

      {/* Sets row */}
      <div className="flex flex-wrap gap-2 px-4 pt-3">
        {(ex.targetSets || []).map((s, si) => (
          <SetBtn
            key={si}
            label={`${si + 1}`}
            value={s}
            done={!!done[`${bi}-${ei}-${si}`]}
            onToggle={() => onToggle(`${bi}-${ei}-${si}`)}
          />
        ))}
      </div>

      {/* Details */}
      <div className="space-y-2 px-4 pb-4 pt-3">
        {ex.weightNote && (
          <div className="text-[15px] font-semibold text-slate-200">{ex.weightNote}</div>
        )}
        {ex.autoReg && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-3 py-2.5">
            <span className="text-base leading-none text-amber-400">⚡</span>
            <span className="text-[13px] leading-snug text-amber-300/90">{ex.autoReg}</span>
          </div>
        )}
        {ex.cue && (
          <p className="text-[13px] leading-snug text-slate-400">{ex.cue}</p>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PlayerPage({ session, player, sessionDate, dayGoal, isToday, notFound }) {
  const [done, setDone] = useState({});
  const [activeBlock, setActiveBlock] = useState(0);
  const blockRefs = useRef([]);

  const blocks = session?.blocks || [];
  const totalSets = blocks.flatMap(b => b.exercises || []).reduce((s, ex) => s + (ex.targetSets?.length || 0), 0);
  const doneCount = Object.values(done).filter(Boolean).length;
  const pct = totalSets > 0 ? Math.round((doneCount / totalSets) * 100) : 0;

  function toggleSet(key) {
    setDone(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function scrollToBlock(idx) {
    setActiveBlock(idx);
    blockRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Track active block on scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const idx = blockRefs.current.indexOf(e.target);
            if (idx !== -1) setActiveBlock(idx);
          }
        }
      },
      { threshold: 0.4 }
    );
    blockRefs.current.forEach(el => el && observer.observe(el));
    return () => observer.disconnect();
  }, [blocks.length]);

  return (
    <>
      <Head>
        <title>{player?.name ? `${player.name} · Тренировка` : 'Тренировка'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="theme-color" content="#07101a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </Head>

      {/* Ambient bg */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-20 -left-20 h-[380px] w-[380px] rounded-full bg-[#22d3ee]/[0.09] blur-[100px]" />
        <div className="absolute bottom-0 right-0 h-[300px] w-[300px] rounded-full bg-blue-600/[0.07] blur-[100px]" />
      </div>

      <div className="min-h-screen bg-[#07101a] text-slate-100">

        {/* ── Sticky header ── */}
        <div className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#07101a]/95 backdrop-blur-xl">
          <div className="px-4 pt-3 pb-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.22em] text-[#22d3ee]/50 mb-0.5">
                  Periodyx · AI Coach
                </div>
                <div className="text-xl font-black leading-none text-white">{player?.name || 'Игрок'}</div>
                {player?.position && (
                  <div className="mt-0.5 text-[11px] text-slate-500">{player.position}</div>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className={`text-[10px] font-bold uppercase tracking-wide ${isToday ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {isToday ? '● Сегодня' : '● Последняя'}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">{formatDate(sessionDate)}</div>
              </div>
            </div>

            {/* Progress bar */}
            {totalSets > 0 && (
              <div className="mt-3">
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] text-slate-600">Подходы</span>
                  <span className="text-[10px] font-semibold text-slate-400">{doneCount}/{totalSets} · {pct}%</span>
                </div>
                <div className="h-[3px] w-full rounded-full bg-white/[0.06]">
                  <div
                    className="h-[3px] rounded-full bg-[#22d3ee] transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Block nav */}
          {blocks.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto px-4 pb-3 no-scrollbar">
              {blocks.map((block, bi) => {
                const blockTotal = (block.exercises || []).reduce((s, ex) => s + (ex.targetSets?.length || 0), 0);
                const blockDone = (block.exercises || []).reduce((s, ex, ei) =>
                  s + (ex.targetSets || []).filter((_, si) => done[`${bi}-${ei}-${si}`]).length, 0);
                const blockComplete = blockTotal > 0 && blockDone === blockTotal;
                return (
                  <button
                    key={bi}
                    type="button"
                    onClick={() => scrollToBlock(bi)}
                    className={`shrink-0 rounded-xl px-4 py-1.5 text-xs font-bold transition-all ${
                      blockComplete
                        ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                        : activeBlock === bi
                        ? 'bg-[#22d3ee] text-[#060a0e] shadow-[0_2px_10px_rgba(34,211,238,0.35)]'
                        : 'border border-white/[0.08] bg-white/[0.03] text-slate-500'
                    }`}
                  >
                    {blockComplete ? `${block.label} ✓` : block.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Invalid token ── */}
        {notFound && (
          <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
            <div className="mb-4 text-5xl">🔒</div>
            <h2 className="mb-2 text-lg font-bold text-slate-200">Ссылка недействительна</h2>
            <p className="text-sm leading-relaxed text-slate-500">
              Запроси актуальную ссылку у тренера.
            </p>
          </div>
        )}

        {/* ── No session ── */}
        {!notFound && !session && (
          <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
            <div className="mb-4 text-5xl">🏋️</div>
            <h2 className="mb-2 text-lg font-bold text-slate-200">Тренировка не готова</h2>
            <p className="text-sm leading-relaxed text-slate-500">
              Тренер ещё не загрузил программу на сегодня.<br />
              Загляни позже или уточни у тренера.
            </p>
          </div>
        )}

        {/* ── Session content ── */}
        {!notFound && session && (
          <div className="px-4 pb-24 pt-4 space-y-6">

            {/* Goal */}
            {dayGoal && (
              <div className="rounded-2xl border border-[#22d3ee]/20 bg-[#22d3ee]/[0.05] px-4 py-3.5">
                <div className="mb-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#22d3ee]/50">
                  Цель тренировки
                </div>
                <div className="text-[14px] font-semibold text-slate-200">{dayGoal}</div>
              </div>
            )}

            {/* Assessment */}
            {session.assessment && (
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-3.5">
                <div className="mb-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-600">
                  Оценка состояния
                </div>
                <p className="text-[13px] leading-relaxed text-slate-300">{session.assessment}</p>
              </div>
            )}

            {/* Blocks */}
            {blocks.map((block, bi) => (
              <div
                key={bi}
                ref={el => (blockRefs.current[bi] = el)}
                style={{ scrollMarginTop: '180px' }}
              >
                {/* Block header */}
                <div className="mb-3 flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#22d3ee] text-sm font-black text-[#060a0e]">
                    {block.label}
                  </span>
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                      Блок {block.label}
                    </div>
                    {block.rest_note && (
                      <div className="text-[11px] text-slate-600">⏱ {block.rest_note}</div>
                    )}
                  </div>
                </div>

                {/* Exercises */}
                <div className="space-y-3">
                  {(block.exercises || []).map((ex, ei) => (
                    <ExCard
                      key={ei}
                      bi={bi}
                      ei={ei}
                      ex={ex}
                      done={done}
                      onToggle={toggleSet}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Warnings */}
            {session.warnings && (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] px-4 py-4">
                <div className="mb-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-amber-400/60">
                  Важно
                </div>
                <p className="text-[13px] leading-relaxed text-amber-200/70">{session.warnings}</p>
              </div>
            )}

            {/* Periodization note — shown only for the player if relevant */}
            {session.periodization_note && (
              <div className="rounded-2xl border border-white/[0.05] bg-white/[0.02] px-4 py-3.5">
                <div className="mb-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-700">
                  Логика периодизации
                </div>
                <p className="text-[12px] leading-relaxed text-slate-600">{session.periodization_note}</p>
              </div>
            )}

            {/* Completion banner */}
            {totalSets > 0 && doneCount === totalSets && (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.09] px-4 py-6 text-center">
                <div className="mb-2 text-3xl">💪</div>
                <div className="text-base font-black text-emerald-300">Тренировка завершена!</div>
                <div className="mt-1 text-xs text-emerald-600">Все {totalSets} подходов выполнены</div>
              </div>
            )}
          </div>
        )}

        {/* ── Footer ── */}
        <div className="fixed bottom-0 left-0 right-0 flex items-center justify-center py-3 bg-[#07101a]/80 backdrop-blur-xl border-t border-white/[0.05]">
          <span className="text-[10px] text-white/[0.15] font-medium tracking-wide">Periodyx · AI Performance Coach</span>
        </div>
      </div>
    </>
  );
}
