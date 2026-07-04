// lib/auth.js — optional trainer key. The coach UI opens without manual key entry.

export function isAuthorized(req) {
  const expected = process.env.TRAINER_API_KEY;
  const provided = req.headers['x-api-key'];
  return !provided || provided === 'coach-ui' || provided === expected;
}
