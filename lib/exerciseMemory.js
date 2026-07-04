// lib/exerciseMemory.js
// Tracks how each player responds to specific exercises (RPE, feel, compliance).
// Stored in Redis: coach:ex_memory:{playerId} → JSON {[normName]: {avgRpe, count, lastFeel, lastDate}}

import { redis } from './redis';
import { pfx } from './workspacePrefix';
import { normExName } from '../pages/api/players/progression';

function memKey(playerId, workspace) {
  return `${pfx(workspace)}:ex_memory:${playerId}`;
}

export async function updateExerciseMemory(playerId, exercises, rpe, feel, date, workspace = 'zarechie') {
  if (!playerId || !Array.isArray(exercises) || !exercises.length) return;
  const rpeNum = Number(rpe);
  if (!Number.isFinite(rpeNum)) return;

  const key = memKey(playerId, workspace);
  const raw = await redis('get', key).catch(() => null);
  const memory = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};

  for (const ex of exercises) {
    if (!ex.name) continue;
    const norm = normExName(ex.name);
    const existing = memory[norm] || { avgRpe: 0, count: 0 };
    const newCount = existing.count + 1;
    const newAvg = (existing.avgRpe * existing.count + rpeNum) / newCount;
    memory[norm] = {
      name: ex.name,
      avgRpe: Math.round(newAvg * 10) / 10,
      count: newCount,
      lastFeel: feel || null,
      lastDate: date,
    };
  }

  await redis('set', key, JSON.stringify(memory)).catch(() => {});
}

// Links evening survey pain/DOMS reports back to the exercises the player
// performed the previous day, building a per-exercise "pain response" profile (#13).
export async function linkPainToExercises(playerId, painAreas = [], sorenessScore = 0, date, workspace = 'zarechie') {
  if (!playerId || !date) return;
  if (!painAreas.length && sorenessScore < 3) return; // nothing notable

  // Read yesterday's saved session to get exercise names.
  const yesterday = (() => {
    const d = new Date(date + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  const sessionRaw = await redis('get', `${pfx(workspace)}:session:${playerId}:${yesterday}`).catch(() => null);
  if (!sessionRaw) return;

  let session;
  try { session = typeof sessionRaw === 'string' ? JSON.parse(sessionRaw) : sessionRaw; } catch { return; }

  const exercises = (session.session?.blocks || [])
    .flatMap(b => b.exercises || [])
    .map(e => e.name)
    .filter(Boolean);
  if (!exercises.length) return;

  // Read current memory.
  const key = memKey(playerId, workspace);
  const raw = await redis('get', key).catch(() => null);
  let memory = {};
  if (raw) { try { memory = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch {} }

  // Record a pain response on each of yesterday's exercises.
  for (const rawName of exercises) {
    const norm = normExName(rawName);
    if (!memory[norm]) {
      memory[norm] = { name: rawName, avgRpe: null, count: 0, painReports: 0, lastDate: null };
    }
    if (!memory[norm].name) memory[norm].name = rawName;
    if (sorenessScore >= 3 || painAreas.length) {
      memory[norm].painReports = (memory[norm].painReports || 0) + 1;
      memory[norm].lastPainDate = date;
      memory[norm].lastPainAreas = painAreas;
    }
  }

  await redis('set', key, JSON.stringify(memory)).catch(() => {});
}

export async function getExerciseMemory(playerId, workspace = 'zarechie') {
  const raw = await redis('get', memKey(playerId, workspace)).catch(() => null);
  if (!raw) return {};
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }
}

function painTag(e) {
  if (!(e.painReports > 0)) return '';
  const areas = e.lastPainAreas?.length ? ' (' + e.lastPainAreas.join(',') + '）' : '';
  return ` ⚠ боль после: ${e.painReports}р${areas}`;
}

export function formatMemoryForPrompt(memory) {
  const entries = Object.values(memory || {});
  if (!entries.length) return null;

  const hard = entries.filter(e => e.avgRpe >= 8.5 && e.count >= 2)
    .sort((a, b) => b.avgRpe - a.avgRpe).slice(0, 5);
  const good = entries.filter(e => e.avgRpe <= 6.5 && e.count >= 2)
    .sort((a, b) => a.avgRpe - b.avgRpe).slice(0, 5);
  const painful = entries.filter(e => e.painReports > 0 && !hard.includes(e) && !good.includes(e))
    .sort((a, b) => (b.painReports || 0) - (a.painReports || 0)).slice(0, 5);

  const lines = [];
  if (hard.length) lines.push(`Тяжело переносит (avg RPE ≥8.5): ${hard.map(e => `${e.name} (RPE ${e.avgRpe}, n=${e.count})${painTag(e)}`).join(', ')}`);
  if (good.length) lines.push(`Хорошо переносит (avg RPE ≤6.5): ${good.map(e => `${e.name} (RPE ${e.avgRpe})${painTag(e)}`).join(', ')}`);
  if (painful.length) lines.push(`Боль/DOMS после: ${painful.map(e => `${e.name}${painTag(e)}`).join(', ')}`);
  return lines.join('\n') || null;
}
