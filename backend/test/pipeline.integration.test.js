'use strict';
// End-to-end detect -> incident -> AI analysis -> policy -> execute -> verify -> resolved, using the REAL Python AI
// engine over HTTP. Only the platform edge is simulated (executor + health probe), because Docker/Kubernetes are not
// available in CI. Time is virtual so verification windows run instantly.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { createOrchestrator } = require('../pipeline/orchestrator');
const { createAiClient } = require('../pipeline/ai-client');
const { createExecutorRegistry } = require('../pipeline/executors');
const policyDoc = require('../pipeline/policy.default.json');

const AI_PORT = 4900 + Math.floor(Math.random() * 90);
let engine;
test.before(async () => {
  engine = spawn('python3', [path.join(__dirname, '../../services/ai-engine/app.py')], { env: { ...process.env, PORT: String(AI_PORT), LLM_PROVIDER: '', LLM_API_KEY: '' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${AI_PORT}/health`)).ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('AI engine did not start');
});
test.after(() => engine?.kill());

function harness({ policyPatch = (p) => p, healsOnRestart = true, aiUrl = `http://127.0.0.1:${AI_PORT}`, config = {}, supports = () => true, ctx = {} } = {}) {
  let clock = Date.parse('2026-03-02T10:00:00Z');
  const incidents = new Map(); const calls = []; const notifications = []; const auditLog = [];
  const down = new Set(['products', 'gateway', 'orders']);
  const store = { get: (id) => incidents.get(id), save: (i) => incidents.set(i.id, i), list: () => [...incidents.values()] };
  const executor = { name: 'docker', supports, execute: async (r) => { if (!supports(r.action)) throw new Error(`cannot ${r.action}`); calls.push(r); if (healsOnRestart && !r.dryRun) down.delete(r.service); return { ok: true, dryRun: !!r.dryRun, detail: `${r.dryRun ? 'dry ' : ''}${r.action} ${r.service}` }; } };
  let n = 0;
  const policy = policyDoc && JSON.parse(JSON.stringify(policyDoc)); policy.defaults.cooldownSeconds = 0;
  const o = createOrchestrator({
    store, ai: createAiClient({ url: aiUrl, timeoutMs: 3000 }), getPolicy: () => policyPatch(policy),
    executors: createExecutorRegistry([executor]), notifier: { notify: async (e) => { notifications.push(e); } },
    probe: async (s) => !down.has(s), audit: (e) => auditLog.push(e), newId: () => `inc-${++n}`,
    context: async () => ({ signals: { status: 'DOWN', lastError: 'Connection refused - nothing is listening', containerRunning: false }, metrics: {}, logs: [], events: [], dependencies: [], ...ctx }),
    config: { now: () => clock, sleep: async (ms) => { clock += ms; }, verifyWindowMs: 20000, verifyIntervalMs: 2000, verifyPasses: 2, maxAttempts: 2, ...config }
  });
  return { o, store, calls, notifications, auditLog, down };
}
const signal = (service, extra = {}) => ({ source: 'healthcheck', service, type: 'service_down', severity: 'high', message: `${service} is down`, ...extra });
const types = (inc) => inc.timeline.map((t) => t.type);

test('auto-heal within policy: full pipeline ends resolved with an auditable trail', async () => {
  const h = harness();
  const { incident } = h.o.handleSignal(signal('products'));
  assert.equal(await h.o.process(incident.id), 'resolved');
  const inc = h.store.get(incident.id);
  assert.equal(inc.lifecycle, 'resolved');
  assert.equal(inc.analysis.mode, 'rules'); assert.equal(inc.analysis.analysis.category, 'process_down'); assert.match(inc.analysis.label, /suggestion/i);
  assert.equal(inc.policyDecisions[0].decision, 'allow'); assert.equal(inc.policyDecisions[0].rule, 'P11 auto-heal');
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].action, 'restart');
  assert.equal(inc.attempts[0].verified, true);
  const order = types(inc);
  for (const [a, b] of [['detected', 'ai_analysis'], ['ai_analysis', 'policy_decision'], ['policy_decision', 'action_executed'], ['action_executed', 'state_change']]) assert.ok(order.indexOf(a) < order.lastIndexOf(b), `${a} before ${b}`);
  assert.deepEqual(inc.timeline.filter((t) => t.type === 'state_change').map((t) => t.to), ['investigating', 'recovering', 'verifying', 'resolved']);
  assert.ok(h.auditLog.some((a) => a.action === 'execute_restart') && h.auditLog.some((a) => a.action === 'policy_allow'));
  assert.deepEqual(h.notifications.map((n) => n.type), ['incident_opened', 'incident_resolved']);
});

test('critical service waits for a person; approval then resolves it', async () => {
  const h = harness();
  const { incident } = h.o.handleSignal(signal('gateway', { severity: 'critical' }));
  assert.equal(await h.o.process(incident.id), 'investigating');
  assert.equal(h.calls.length, 0);
  assert.equal(h.store.get(incident.id).policyDecisions[0].rule, 'P8 critical-approval');
  assert.ok(h.store.get(incident.id).pendingApproval);
  assert.ok(h.notifications.some((n) => n.type === 'approval_needed'));
  assert.equal(await h.o.approve(incident.id, 'ops@example.com'), 'resolved');
  const inc = h.store.get(incident.id);
  assert.equal(inc.attempts[0].approvedBy, 'ops@example.com'); assert.equal(inc.pendingApproval, undefined);
  assert.equal(h.calls.length, 1);
});

test('approve without a pending action is rejected', async () => {
  const h = harness(); const { incident } = h.o.handleSignal(signal('products'));
  await assert.rejects(h.o.approve(incident.id, 'a@b.c'), /waiting for approval/);
});

test('policy hard-deny wins even over an operator approval', async () => {
  const h = harness({ policyPatch: (p) => { p.services.gateway.maxRestartsPerHour = 0; return p; } });
  const { incident } = h.o.handleSignal(signal('gateway'));
  assert.equal(await h.o.process(incident.id), 'failed');
  assert.equal(h.store.get(incident.id).policyDecisions[0].rule, 'P5 restart-budget');
  assert.equal(h.calls.length, 0);
  assert.ok(h.notifications.some((n) => n.type === 'escalated'));
});

test('dependency failure: AI says investigate first, so nothing is restarted behind its back', async () => {
  const h = harness({ ctx: { signals: { status: 'DOWN', lastError: 'upstream 503' }, dependencies: [{ service: 'auth', status: 'DOWN' }] } });
  const { incident } = h.o.handleSignal(signal('products'));
  await h.o.process(incident.id);
  const inc = h.store.get(incident.id);
  assert.equal(inc.analysis.analysis.category, 'dependency_failure');
  assert.equal(inc.analysis.analysis.suggestions[0].action, 'investigate');
  assert.equal(h.calls.length, 0);
  assert.equal(inc.lifecycle, 'investigating'); assert.ok(types(inc).includes('needs_person'));
  assert.ok(h.notifications.some((n) => n.type === 'needs_attention'));
});

test('failed verification retries once within policy, then escalates', async () => {
  const h = harness({ healsOnRestart: false });
  const { incident } = h.o.handleSignal(signal('products'));
  assert.equal(await h.o.process(incident.id), 'failed');
  const inc = h.store.get(incident.id);
  assert.equal(h.calls.length, 2); assert.equal(inc.attempts.length, 2);
  assert.ok(inc.attempts.every((a) => a.verified === false));
  assert.match(inc.timeline.at(-1).message, /Manual intervention/);
  assert.ok(h.notifications.some((n) => n.type === 'escalated'));
});

test('restart budget stops an endless loop of failing restarts', async () => {
  const h = harness({ healsOnRestart: false, config: { maxAttempts: 5 }, policyPatch: (p) => { p.services.products.maxRestartsPerHour = 2; return p; } });
  const { incident } = h.o.handleSignal(signal('products'));
  assert.equal(await h.o.process(incident.id), 'failed');
  assert.equal(h.calls.length, 2);
  assert.equal(h.store.get(incident.id).policyDecisions.at(-1).rule, 'P5 restart-budget');
});

test('dry run executes nothing and leaves the incident for a person', async () => {
  const h = harness({ config: { dryRun: true } });
  const { incident } = h.o.handleSignal(signal('products'));
  await h.o.process(incident.id);
  const inc = h.store.get(incident.id);
  assert.equal(h.calls[0].dryRun, true); assert.equal(inc.attempts[0].executed, false);
  assert.equal(inc.lifecycle, 'failed'); assert.ok(h.down.has('products'));
});

test('monitor-only service is detected and analysed but never acted on', async () => {
  const h = harness({ policyPatch: (p) => { p.services.products.approvalMode = 'monitor_only'; return p; } });
  const { incident } = h.o.handleSignal(signal('products'));
  await h.o.process(incident.id);
  assert.equal(h.calls.length, 0); assert.equal(h.store.get(incident.id).policyDecisions[0].decision, 'monitor_only');
});

test('duplicate signals for one service update one incident (deduplication)', () => {
  const h = harness();
  const a = h.o.handleSignal(signal('products')); const b = h.o.handleSignal(signal('products', { source: 'prometheus' }));
  assert.equal(a.created, true); assert.equal(b.created, false); assert.equal(a.incident.id, b.incident.id);
  assert.equal(h.store.list().length, 1); assert.equal(a.incident.signals.length, 2);
  assert.equal(h.o.handleSignal(signal('products'), 'other-workspace').created, true);
});

test('AI engine down: pipeline degrades to a labelled fallback and still recovers', async () => {
  const h = harness({ aiUrl: 'http://127.0.0.1:9' });
  const { incident } = h.o.handleSignal(signal('products'));
  assert.equal(await h.o.process(incident.id), 'resolved');
  const inc = h.store.get(incident.id);
  assert.equal(inc.analysis.mode, 'fallback'); assert.match(inc.analysis.label, /Fallback/);
});

test('executor that cannot perform the action fails the incident and escalates', async () => {
  const h = harness({ supports: () => false });
  const { incident } = h.o.handleSignal(signal('products'));
  assert.equal(await h.o.process(incident.id), 'failed');
  const inc = h.store.get(incident.id);
  assert.match(inc.attempts[0].error, /cannot restart/); assert.equal(inc.attempts[0].executed, false);
  assert.ok(h.notifications.some((n) => n.type === 'recovery_failed'));
});

test('a missing executor for the platform is reported, not swallowed', async () => {
  const h = harness();
  const o = createOrchestrator({ store: h.store, ai: createAiClient({ url: null }), getPolicy: () => policyDoc, executors: createExecutorRegistry([]), notifier: null, probe: async () => true, newId: () => 'x', context: async () => ({ signals: { status: 'DOWN' } }), config: { now: () => 0, sleep: async () => {} } });
  const { incident } = o.handleSignal(signal('products'));
  await assert.rejects(o.process(incident.id), /No executor/);
});
