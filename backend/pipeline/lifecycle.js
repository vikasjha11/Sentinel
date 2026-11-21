'use strict';
// Incident lifecycle: a small state machine with an append-only timeline. Pure functions over plain objects.
const STATES = ['open', 'investigating', 'recovering', 'verifying', 'resolved', 'failed'];
const TRANSITIONS = {
  open: ['investigating', 'recovering', 'resolved', 'failed'],
  investigating: ['recovering', 'resolved', 'failed'],
  recovering: ['verifying', 'failed', 'investigating'],
  verifying: ['resolved', 'recovering', 'failed'],
  failed: ['investigating', 'recovering', 'resolved'],
  resolved: []
};

const dedupeKey = (workspaceId, service) => `${workspaceId}:${service}`;
const isActive = (inc) => inc.lifecycle !== 'resolved';

function stamp(inc, type, message, extra = {}, at = new Date().toISOString()) {
  inc.timeline = inc.timeline || [];
  inc.timeline.push({ at, type, message, ...extra });
  return inc;
}

function transition(inc, to, { actor = 'sentinel', message, at = new Date().toISOString() } = {}) {
  if (!STATES.includes(to)) throw new Error(`Unknown incident state "${to}".`);
  const from = inc.lifecycle || 'open';
  if (from === to) return inc;
  if (!TRANSITIONS[from].includes(to)) throw new Error(`Illegal incident transition ${from} -> ${to}.`);
  inc.lifecycle = to;
  inc.lifecycleSince = at;
  if (to === 'resolved') inc.resolvedAt = at;
  stamp(inc, 'state_change', message || `Incident moved from ${from} to ${to}.`, { from, to, actor }, at);
  return inc;
}

function createIncident({ id, workspaceId, service, title, severity = 'medium', source, detectedAt = new Date().toISOString(), firstFailureAt = detectedAt, description = '', runbook = '' }) {
  const inc = { id, workspaceId, service, title, severity, source, description, runbook, lifecycle: 'open', lifecycleSince: detectedAt, detectedAt, firstFailureAt, createdAt: detectedAt, signals: [], timeline: [], notes: [], attempts: [] };
  stamp(inc, 'detected', `Incident opened from ${source} signal.`, {}, detectedAt);
  return inc;
}

function addSignal(inc, signal, at = new Date().toISOString()) {
  inc.signals.push({ at, source: signal.source, type: signal.type, message: signal.message });
  if (inc.signals.length > 50) inc.signals.shift();
  stamp(inc, 'signal', `${signal.source}: ${signal.message}`, {}, at);
  return inc;
}

function addNote(inc, { author, text }, at = new Date().toISOString()) {
  inc.notes.push({ at, author, text: String(text).slice(0, 2000) });
  stamp(inc, 'note', `Runbook note by ${author}.`, {}, at);
  return inc;
}

module.exports = { STATES, TRANSITIONS, dedupeKey, isActive, transition, createIncident, addSignal, addNote, stamp };
