// pages/api/programs/generate-async.js
// POST { playerId, date, dayGoal, days, focus, notes, warmupSummary, teamUsedExercises }
// Queues one gym-session generation for the polling endpoint. The public contract stays
// the same for the UI: return { batchId }, then the client polls generate-status.js.

import { isAuthorized } from '../../../lib/auth';
import { redis } from '../../../lib/redis';
import { buildGenerationInputs, buildSessionTool } from './generate';

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'OPENAI_API_KEY не настроен в переменных среды Vercel' });
  }

  const { playerId, dayGoal = '', workspace = 'zarechie' } = req.body || {};

  // Build the exact same SYSTEM_PROMPT / userPrompt / tool as the synchronous generator.
  const inputs = await buildGenerationInputs(req.body || {});
  if (inputs.error) return res.status(inputs.status || 400).json({ error: inputs.error });
  const { userPrompt, targetDate } = inputs;

  // Keep the full schema for the polled path.
  const sessionTool = buildSessionTool({ includeImgPrompt: true });
  const batchId = `openai-gen-${playerId}-${Date.now()}`;

  try {
    // Track the queued job so generate-status can run OpenAI and persist the result.
    await redis(
      'set',
      `coach:batch:${batchId}`,
      JSON.stringify({
        playerId: String(playerId),
        date: targetDate,
        dayGoal,
        workspace,
        userPrompt,
        sessionTool,
        status: 'pending',
        submittedAt: new Date().toISOString(),
      }),
      'EX',
      3600,
    ).catch(e => console.error('Redis SET batch failed:', e.message));

    return res.status(200).json({ batchId, estimatedMinutes: 2 });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
