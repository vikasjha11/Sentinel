'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../pipeline/lifecycle');

const make = () => L.createIncident({ id: 'i1', workspaceId: 'w', service: 'products', title: 't', source: 'healthcheck', detectedAt: '2026-01-01T00:00:00Z' });

test('new incident starts open with a detection timeline entry', () => {
  const i = make(); assert.equal(i.lifecycle, 'open'); assert.equal(i.timeline[0].type, 'detected');
});
test('legal path open -> investigating -> recovering -> verifying -> resolved', () => {
  const i = make();
  for (const s of ['investigating', 'recovering', 'verifying', 'resolved']) L.transition(i, s, { at: '2026-01-01T00:01:00Z' });
  assert.equal(i.lifecycle, 'resolved'); assert.equal(i.resolvedAt, '2026-01-01T00:01:00Z');
  assert.equal(i.timeline.filter((t) => t.type === 'state_change').length, 4);
});
test('illegal transitions throw and leave state unchanged', () => {
  const i = make();
  assert.throws(() => L.transition(i, 'verifying'), /Illegal/);
  assert.equal(i.lifecycle, 'open');
  L.transition(i, 'resolved');
  assert.throws(() => L.transition(i, 'open'), /Illegal/);
  assert.throws(() => L.transition(i, 'bogus'), /Unknown/);
});
test('failed incidents can be retried by a person', () => {
  const i = make(); L.transition(i, 'failed'); L.transition(i, 'investigating'); assert.equal(i.lifecycle, 'investigating');
});
test('verifying can fall back to recovering for a retry', () => {
  const i = make(); L.transition(i, 'recovering'); L.transition(i, 'verifying'); L.transition(i, 'recovering'); assert.equal(i.lifecycle, 'recovering');
});
test('signals are capped and notes are recorded', () => {
  const i = make();
  for (let n = 0; n < 60; n += 1) L.addSignal(i, { source: 'x', type: 't', message: String(n) });
  assert.equal(i.signals.length, 50);
  L.addNote(i, { author: 'a@b.c', text: 'restarted by hand' });
  assert.equal(i.notes.length, 1);
});
test('same-state transition is a no-op and dedupe key is stable', () => {
  const i = make(); const n = i.timeline.length; L.transition(i, 'open'); assert.equal(i.timeline.length, n);
  assert.equal(L.dedupeKey('w', 'products'), 'w:products');
});
