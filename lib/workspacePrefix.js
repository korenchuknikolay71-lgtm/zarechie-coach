// lib/workspacePrefix.js
// Maps workspace ID to Redis key prefixes so Zarechye and NK Performance
// data never collide in the same Redis instance.

export function pfx(workspace) {
  return workspace === 'nkperf' ? 'nkperf' : 'coach';
}

export function sessionKey(workspace, playerId, date) {
  return `${pfx(workspace)}:session:${playerId}:${date}`;
}

export function sessionsKey(workspace, playerId) {
  return `${pfx(workspace)}:sessions:${playerId}`;
}

export function oneRmKey(workspace, playerId) {
  return `${pfx(workspace)}:1rm:${playerId}`;
}

export function rmHistoryKey(workspace, playerId) {
  return `${pfx(workspace)}:rm_history:${playerId}`;
}

export function restrictionsKey(workspace, playerId) {
  return `${pfx(workspace)}:restrictions:${playerId}`;
}

export function shareTokenKey(workspace, token) {
  return `${pfx(workspace)}:share_token:${token}`;
}

export function playerShareKey(workspace, playerId) {
  return `${pfx(workspace)}:player_share:${playerId}`;
}

export function exweightKey(workspace, playerId, norm) {
  return `${pfx(workspace)}:exweight:${playerId}:${norm}`;
}

export function exhistKey(workspace, playerId, norm) {
  return `${pfx(workspace)}:exhist:${playerId}:${norm}`;
}

export function rosterKey(workspace) {
  return workspace === 'nkperf' ? 'nkperf:roster' : 'coach:roster';
}

export function scheduleKey(workspace) {
  return `${pfx(workspace)}:schedule:team`;
}

export function monthlyScheduleKey(workspace, month) {
  return `${pfx(workspace)}:monthly_schedule:${month}`;
}

export function playbookKey(workspace) {
  return `${pfx(workspace)}:playbook`;
}

export function feedbackKey(workspace, playerId, date) {
  return `${pfx(workspace)}:feedback:${playerId}:${date}`;
}

export function manualSnapshotKey(workspace, playerId) {
  return `${pfx(workspace)}:manual:snapshot:${playerId}`;
}

export function annotationsKey(workspace) {
  return `${pfx(workspace)}:annotations:data`;
}

export function injuryLogKey(workspace, playerId) {
  return `${pfx(workspace)}:injury:log:${playerId}`;
}

export function gymTonnageKey(workspace, playerId, date) {
  return `${pfx(workspace)}:gym_tonnage:${playerId}:${date}`;
}

export function gymTonnageDatesKey(workspace, playerId) {
  return `${pfx(workspace)}:gym_tonnage_dates:${playerId}`;
}
