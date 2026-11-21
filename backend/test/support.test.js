'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createNotifier, assertSafeUrl, isPrivateIp } = require('../pipeline/notifications');
const { computeAnalytics, incidentsCsv } = require('../pipeline/analytics');
const { signalsFromAlertmanager } = require('../pipeline/alerts');
const { fallback } = require('../pipeline/ai-client');

test('private and loopback destinations are blocked unless allowed', async () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.9', '172.20.0.1', '169.254.169.254', '::1']) assert.equal(isPrivateIp(ip), true, ip);
  assert.equal(isPrivateIp('8.8.8.8'), false);
  await assert.rejects(assertSafeUrl('http://127.0.0.1/hook', false), /blocked/);
  await assert.rejects(assertSafeUrl('http://internal.example/hook', false, async () => [{ address: '10.0.0.5' }]), /blocked/);
  await assert.rejects(assertSafeUrl('ftp://x.example', false), /Only plain http/);
  await assert.rejects(assertSafeUrl('https://user:pw@x.example', false), /Only plain http/);
  assert.ok(await assertSafeUrl('http://127.0.0.1/hook', true));
  assert.ok(await assertSafeUrl('https://hooks.example/x', false, async () => [{ address: '93.184.216.34' }]));
});
test('notifier routes by severity and event, logs deliveries and hides secrets', async () => {
  const sent = [];
  const n = createNotifier({
    channels: [
      { name: 'ops-slack', type: 'slack', url: 'https://hooks.slack.test/services/SECRET', minSeverity: 'high' },
      { name: 'audit-hook', type: 'webhook', url: 'https://hooks.example/audit', minSeverity: 'low', events: ['incident_resolved'] }
    ],
    lookup: async () => [{ address: '93.184.216.34' }],
    fetchImpl: async (url, o) => { sent.push({ url: String(url), body: JSON.parse(o.body) }); return { ok: true }; }
  });
  await n.notify({ type: 'incident_opened', severity: 'medium', title: 't', message: 'm' });
  assert.equal(sent.length, 0);
  await n.notify({ type: 'incident_opened', severity: 'critical', title: 'db', message: 'down' });
  assert.equal(sent.length, 1); assert.ok(sent[0].body.text.includes('[CRITICAL]'));
  await n.notify({ type: 'incident_resolved', severity: 'low', title: 'db', message: 'ok' });
  assert.equal(sent.length, 2); assert.equal(sent[1].body.event, 'incident_resolved');
  assert.equal(n.deliveryLog().length, 2);
  assert.ok(!JSON.stringify(n.channels()).includes('SECRET'));
});
test('notifier records failures instead of throwing', async () => {
  const n = createNotifier({ channels: [{ name: 'x', type: 'webhook', url: 'https://h.example/x' }], lookup: async () => [{ address: '93.184.216.34' }], fetchImpl: async () => ({ ok: false, status: 500 }) });
  const [r] = await n.notify({ type: 'incident_opened', severity: 'high', title: 't', message: 'm' });
  assert.equal(r.ok, false); assert.equal(n.deliveryLog()[0].ok, false);
  const t = await n.testSend({ name: 'bad', type: 'webhook', url: 'http://127.0.0.1/x' });
  assert.equal(t.ok, false);
});
const inc = (o) => ({ id: 'i', service: 'products', severity: 'high', lifecycle: 'resolved', firstFailureAt: '2026-01-01T00:00:00Z', detectedAt: '2026-01-01T00:00:10Z', resolvedAt: '2026-01-01T00:01:10Z', attempts: [{ executed: true }], ...o });
test('analytics: MTTD, MTTR, recovery success rate, top services, range filter', () => {
  const list = [inc({}), inc({ id: 'b', detectedAt: '2026-01-01T01:00:00Z', firstFailureAt: '2026-01-01T00:59:50Z', resolvedAt: '2026-01-01T01:03:00Z' }), inc({ id: 'c', service: 'orders', lifecycle: 'failed', resolvedAt: undefined })];
  const a = computeAnalytics(list);
  assert.equal(a.incidents.total, 3); assert.equal(a.incidents.resolved, 2); assert.equal(a.incidents.failed, 1);
  assert.equal(a.mttdMs, 10000); assert.equal(a.mttrMs, (60000 + 180000) / 2);
  assert.deepEqual(a.recovery, { attempted: 3, succeeded: 2, successRate: 66.7 });
  assert.deepEqual(a.topFailingServices[0], { service: 'products', count: 2 });
  assert.equal(computeAnalytics(list, { from: '2026-01-01T00:30:00Z' }).incidents.total, 1);
  assert.equal(computeAnalytics([]).mttrMs, null);
});
test('csv export escapes quotes and neutralises spreadsheet formulas', () => {
  const csv = incidentsCsv([inc({ id: '=cmd|calc', service: 'a,"b"' })]);
  assert.ok(csv.includes("'=cmd|calc")); assert.ok(csv.includes('"a,""b"""'));
});
test('alertmanager payload becomes signals; resolved and unlabelled alerts are ignored', () => {
  const s = signalsFromAlertmanager({ alerts: [
    { status: 'firing', labels: { alertname: 'ServiceDown', service: 'products', severity: 'critical' }, annotations: { summary: 'products is down' }, startsAt: '2026-01-01T00:00:00Z' },
    { status: 'resolved', labels: { service: 'orders' } }, { status: 'firing', labels: { alertname: 'X' } },
    { status: 'firing', labels: { service: 'media', severity: 'weird' } }] });
  assert.equal(s.length, 2); assert.equal(s[0].severity, 'critical'); assert.equal(s[0].source, 'prometheus'); assert.equal(s[1].severity, 'medium');
  assert.throws(() => signalsFromAlertmanager({}), /Not an Alertmanager/);
});
test('AI fallback is labelled and still suggests restart for a down service', () => {
  const f = fallback({ service: 'x', signals: { status: 'DOWN' } }, 'no engine');
  assert.equal(f.mode, 'fallback'); assert.equal(f.analysis.suggestions[0].action, 'restart'); assert.match(f.label, /Fallback/);
});
