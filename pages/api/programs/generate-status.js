// pages/api/programs/generate-status.js
// GET ?batchId=xxx → polls a queued OpenAI Responses API session.
// While processing: { status: 'pending', processing_status }.
// When done: extracts the build_session function call, persists the session to Redis (same
// layout as save.js), and returns { status: 'done', session, player, dataSummary, date, dayGoal }.

import { isAuthorized } from '../../../lib/auth';
import { redis } from '../../../lib/redis';
import { getPlayerSnapshot } from '../../../lib/playerData';
import { sessionKey, sessionsKey } from '../../../lib/workspacePrefix';
import { SYSTEM_PROMPT } from './generate';

export const config = { maxDuration: 60 };

const OPENAI_SESSION_MODEL = 'gpt-5.5';

function sessionToolForOpenAI(tool) {
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

async function callOpenAIForSession(apiKey, userPrompt, sessionTool) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_SESSION_MODEL,
      instructions: SYSTEM_PROMPT,
      input: userPrompt,
      max_output_tokens: 6500,
      store: false,
      tools: [sessionToolForOpenAI(sessionTool)],
      tool_choice: { type: 'function', name: 'build_session' },
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    return { error: err.error?.message || `OpenAI API error ${response.status}`, status: 502 };
  }
  const data = await response.json();
  const functionCall = findOpenAIFunctionCall(data.output, 'build_session');
  return { session: parseFunctionArguments(functionCall?.arguments) };
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'OPENAI_API_KEY не настроен в переменных среды Vercel' });
  }

  const { batchId } = req.query || {};
  if (!batchId) return res.status(400).json({ error: 'batchId required' });

  // Resolve the queued record saved at submit time.
  let record;
  try {
    const raw = await redis('get', `coach:batch:${batchId}`);
    if (!raw) return res.status(404).json({ error: 'Batch не найден (истёк или неверный id)' });
    record = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  if (record.status === 'done' && record.session) {
    return res.status(200).json({
      status: 'done',
      session: record.session,
      player: record.player || null,
      dataSummary: record.dataSummary || '',
      date: record.date,
      dayGoal: record.dayGoal || '',
    });
  }

  if (record.status === 'running') {
    const started = record.startedAt ? Date.parse(record.startedAt) : 0;
    if (started && Date.now() - started < 90_000) {
      return res.status(200).json({ status: 'pending', processing_status: 'running' });
    }
  }

  const { playerId, date, dayGoal = '', workspace = 'zarechie', userPrompt, sessionTool } = record;
  if (!userPrompt || !sessionTool) {
    return res.status(500).json({ error: 'Неполные данные задачи генерации' });
  }

  try {
    await redis('set', `coach:batch:${batchId}`, JSON.stringify({
      ...record,
      status: 'running',
      startedAt: new Date().toISOString(),
    }), 'EX', 3600).catch(() => {});

    const generated = await callOpenAIForSession(apiKey, userPrompt, sessionTool);
    if (generated.error) return res.status(generated.status || 502).json({ error: generated.error });
    const session = generated.session;
    if (!session) {
      return res.status(502).json({ error: 'Модель не вернула структурированную тренировку' });
    }

    // Persist the session (same Redis layout as pages/api/programs/save.js).
    const snapshot = await getPlayerSnapshot(String(playerId), 7, date, 28, workspace).catch(() => null);
    const player = snapshot?.player || null;

    const record2 = {
      session,
      player,
      dataSummary: '',
      dayGoal: dayGoal || '',
      date,
      savedAt: new Date().toISOString(),
    };
    const dateScore = parseInt(String(date).replace(/-/g, ''), 10);
    await Promise.all([
      redis('set', sessionKey(workspace, playerId, date), JSON.stringify(record2)),
      redis('zadd', sessionsKey(workspace, playerId), dateScore, date),
    ]).catch(e => console.error('Redis save session failed:', e.message));

    await redis('set', `coach:batch:${batchId}`, JSON.stringify({
      ...record,
      status: 'done',
      session,
      player,
      dataSummary: '',
      completedAt: new Date().toISOString(),
    }), 'EX', 3600).catch(() => {});

    return res.status(200).json({
      status: 'done',
      session,
      player,
      dataSummary: '',
      date,
      dayGoal,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
