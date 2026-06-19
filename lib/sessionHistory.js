// lib/sessionHistory.js
// Fetches the most recent saved sessions for a player and converts them into a compact
// text summary that fits in the Claude prompt without blowing the token budget.
// Each saved session is ~50-80 tokens in this format — 10 sessions ≈ 600-800 tokens.

import { redis, redisPipeline } from './redis';

export async function getRecentSessionSummaries(playerId, maxSessions = 10) {
  // Get the N most recent session dates from the sorted set (ascending by score = date int)
  const dates = await redis('zrange', `coach:sessions:${playerId}`, -maxSessions, -1);
  if (!dates || dates.length === 0) return [];

  // Batch-fetch all session records in one pipeline round-trip
  const results = await redisPipeline(dates.map(d => ['get', `coach:session:${playerId}:${d}`]));

  const summaries = [];
  for (let i = 0; i < dates.length; i++) {
    const raw = results[i]?.result;
    if (!raw) continue;
    try {
      const record = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const summary = formatSummary(record);
      if (summary) summaries.push(summary);
    } catch (_) {
      // Skip malformed records
    }
  }

  return summaries; // oldest first (chronological)
}

function formatSummary(record) {
  const { session, date, dayGoal } = record;
  if (!session || !date) return null;

  const header = dayGoal ? `${date} (цель: «${dayGoal}»):` : `${date}:`;
  const blockLines = (session.blocks || []).map(block => {
    const restHint = block.rest_note ? ` [${block.rest_note}]` : '';
    const exercises = (block.exercises || [])
      .map(ex => {
        const sets = ex.targetSets?.length ?? 0;
        const reps = ex.targetSets?.[0] ?? '';
        const weight = ex.weightNote ? ` @${ex.weightNote}` : '';
        const tempo = ex.tempo && ex.tempo !== 'контролируемый' ? ` темп:${ex.tempo}` : '';
        return `${ex.name} (${sets}×${reps}${weight}${tempo})`;
      })
      .join(', ');
    return `  ${block.label}${restHint}: ${exercises}`;
  });

  return [header, ...blockLines].join('\n');
}
