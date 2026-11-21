'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, validatePolicy } = require('../pipeline/policy');
const base = require('../pipeline/policy.default.json');

const NOW = Date.parse('2026-03-02T10:00:00Z'); // Monday
const policy = (patch = {}) => ({ ...JSON.parse(JSON.stringify(base)), ...patch });
const req = (o = {}) => ({ service: 'products', action: 'restart', environment: 'production', now: NOW, ...o });
const none = { actions: [], activeRecoveries: 0 };

test('default policy file is valid', () => assert.deepEqual(validatePolicy(base), []));
test('validation reports bad input', () => {
  const bad = policy({ version: 0, services: { Bad_Name: { approvalMode: 'yolo', allowedActions: ['format-disk'] } } });
  const errors = validatePolicy(bad);
  assert.ok(errors.length >= 4);
  assert.ok(errors.some((e) => e.includes('approvalMode')));
});
test('auto service within limits is allowed and names its rule', () => {
  const d = evaluate(policy(), req(), none);
  assert.equal(d.decision, 'allow'); assert.equal(d.rule, 'P11 auto-heal'); assert.equal(d.policyVersion, 1);
});
test('critical service in production requires approval', () => {
  const p = policy(); p.services.gateway.approvalMode = 'auto';
  assert.equal(evaluate(p, req({ service: 'gateway' }), none).rule, 'P8 critical-approval');
});
test('critical service in development can be auto-healed', () => {
  const p = policy(); p.services.gateway.approvalMode = 'auto';
  assert.equal(evaluate(p, req({ service: 'gateway', environment: 'development' }), none).decision, 'allow');
});
test('manual mode requires approval', () => {
  const p = policy(); p.services.products.approvalMode = 'manual';
  assert.equal(evaluate(p, req(), none).rule, 'P9 manual-mode');
});
test('monitor-only never acts', () => {
  const p = policy(); p.services.products.approvalMode = 'monitor_only';
  assert.equal(evaluate(p, req(), none).decision, 'monitor_only');
});
test('actions outside the allow list are denied', () => {
  const d = evaluate(policy(), req({ action: 'scale', replicas: 2 }), none);
  assert.equal(d.decision, 'deny'); assert.equal(d.rule, 'P1 allowed-actions');
  assert.equal(evaluate(policy(), req({ action: 'drop-database' }), none).decision, 'deny');
});
test('unregistered service falls back to approval (fail-safe)', () => {
  assert.equal(evaluate(policy(), req({ service: 'mystery' }), none).rule, 'P2 unregistered-service');
});
test('cooldown blocks a second action too soon', () => {
  const h = { actions: [{ service: 'products', action: 'restart', at: NOW - 10000 }], activeRecoveries: 0 };
  assert.equal(evaluate(policy(), req(), h).rule, 'P4 cooldown');
});
test('restart budget per hour escalates', () => {
  const h = { actions: [1, 2, 3].map((n) => ({ service: 'products', action: 'restart', at: NOW - n * 600000 })), activeRecoveries: 0 };
  assert.equal(evaluate(policy(), req(), h).rule, 'P5 restart-budget');
});
test('old restarts fall out of the hourly budget', () => {
  const h = { actions: [1, 2, 3].map((n) => ({ service: 'products', action: 'restart', at: NOW - 3600000 - n * 1000 })), activeRecoveries: 0 };
  assert.equal(evaluate(policy(), req(), h).decision, 'allow');
});
test('blast radius limits concurrent recoveries', () => {
  assert.equal(evaluate(policy(), req(), { actions: [], activeRecoveries: 2 }).rule, 'P7 blast-radius');
});
test('scale cap', () => {
  const p = policy(); p.services.products.allowedActions = ['scale'];
  assert.equal(evaluate(p, req({ action: 'scale', replicas: 9 }), none).rule, 'P6 scale-cap');
  assert.equal(evaluate(p, req({ action: 'scale', replicas: 3 }), none).decision, 'allow');
});
test('auto-heal window: inside allows, outside asks a person', () => {
  const p = policy(); p.services.products.autoHealWindow = { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 18, utcOffsetMinutes: 0 };
  assert.equal(evaluate(p, req({ now: NOW }), none).decision, 'allow');
  assert.equal(evaluate(p, req({ now: Date.parse('2026-03-02T22:00:00Z') }), none).rule, 'P10 outside-auto-heal-window');
  assert.equal(evaluate(p, req({ now: Date.parse('2026-03-01T10:00:00Z') }), none).rule, 'P10 outside-auto-heal-window');
});
