'use strict';
// Runs the REAL docker-monitor.js and pipeline/index.js (no Express: a tiny route registry stands in for it) against
// a real Python AI engine, a fake customer service and a fake Recovery Controller, all over HTTP.
// Flow under test: service dies -> health check detects -> incident -> AI analysis -> policy -> auto-heal restart via the
// controller -> health verification -> resolved, with audit trail. A second outage then proves the policy binds people too.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-it-'));
const wait = async (fn, ms = 20000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('timed out waiting'); await new Promise((r) => setTimeout(r, 100)); } };
const listen = (server, port = 0) => new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server.address().port)));

test('detect -> incident -> AI -> policy -> auto-heal -> verify -> resolved, and policy blocks a hasty second restart', async (t) => {
  // fake customer service that can be killed and revived on the same port
  const svc = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ status: 'ok', startedAt: svcStartedAt, uptimeSeconds: 5 })); });
  let svcStartedAt = new Date().toISOString();
  const svcPort = await listen(svc);
  const killService = () => new Promise((r) => { svc.closeAllConnections?.(); svc.close(r); });
  const reviveService = async () => { svcStartedAt = new Date().toISOString(); await listen(svc, svcPort); };

  const restarts = [];
  const controller = http.createServer(async (req, res) => {
    const send = (c, o) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.headers.authorization !== 'Bearer controller-token-0123456789') return send(401, { error: 'Unauthorized.' });
    if (req.method === 'GET' && req.url === '/v1/services') return send(200, { services: [{ service: 'products', container: 'tilda-products', exists: true, running: svc.listening, status: svc.listening ? 'running' : 'exited', exitCode: svc.listening ? 0 : 1 }] });
    if (req.method === 'GET' && req.url.startsWith('/v1/services/products/logs')) return send(200, { logs: [] });
    if (req.method === 'POST' && req.url === '/v1/services/products/restart') { restarts.push(Date.now()); if (!svc.listening) await reviveService(); return send(200, { ok: true, container: 'tilda-products', startedAt: svcStartedAt }); }
    send(404, { error: 'not found' });
  });
  const controllerPort = await listen(controller);

  const aiPort = 5100 + Math.floor(Math.random() * 400);
  const engine = spawn('python3', [path.join(__dirname, '../../services/ai-engine/app.py')], { env: { ...process.env, PORT: String(aiPort), LLM_PROVIDER: '', LLM_API_KEY: '' }, stdio: 'ignore' });
  await wait(async () => { try { return (await fetch(`http://127.0.0.1:${aiPort}/health`)).ok; } catch { return false; } }, 8000);

  t.after(async () => { engine.kill(); controller.close(); controller.closeAllConnections?.(); if (svc.listening) await killService(); fs.rmSync(tmp, { recursive: true, force: true }); });

  const registryFile = path.join(tmp, 'registry.json');
  fs.writeFileSync(registryFile, JSON.stringify({ stacks: [{ id: 'demo', projectName: 'Demo', description: 'd', services: [{ key: 'products', name: 'Product Service', type: 'Catalogue', container: 'tilda-products', composeService: 'products', healthUrl: `http://localhost:${svcPort}/health`, severity: 'high', incidentDescription: 'Product Service is unreachable.', impact: 'Catalogue unavailable.' }] }] }));
  Object.assign(process.env, {
    SERVICE_REGISTRY_FILE: registryFile, SENTINEL_SERVICE_STATE_PATH: path.join(tmp, 'state.json'), SERVICE_FAILURE_THRESHOLD: '1', SERVICE_RECOVERY_THRESHOLD: '2', SERVICE_STARTUP_GRACE_MS: '0',
    SERVICE_CHECK_TIMEOUT_MS: '1000', RECOVERY_VERIFY_TIMEOUT_MS: '30000', RECOVERY_TOKEN: 'controller-token-0123456789', RECOVERY_CONTROLLER_URL: `http://127.0.0.1:${controllerPort}`,
    PIPELINE_AUTOHEAL: 'true', AI_ENGINE_URL: `http://127.0.0.1:${aiPort}`, SENTINEL_ENVIRONMENT: 'production'
  });
  const { createDockerMonitor } = require('../docker-monitor');
  const { createPipeline } = require('../pipeline');

  const routes = new Map(); const reg = (m) => (p, ...h) => routes.set(`${m} ${p}`, h[h.length - 1]);
  const app = { get: reg('GET'), post: reg('POST'), put: reg('PUT'), delete: reg('DELETE') };
  const db = { users: [], workspaces: [{ id: 'w1' }], projects: [], incidents: [], checks: [] };
  let n = 0; const newId = () => `id-${++n}`; const saveDb = () => {};
  let pipeline = null;
  const monitor = createDockerMonitor({ app, auth: (req, res, next) => next(), db, saveDb, newId, dbPath: path.join(tmp, 'data.json'), getHooks: () => pipeline });
  pipeline = createPipeline({ app, auth: (req, res, next) => next(), db, saveDb, newId, monitor });
  monitor.provisionWorkspace('w1');
  const { cycle } = monitor._internals;

  await cycle(); await cycle();
  assert.equal(monitor._internals.state.services['demo:products'].status, 'HEALTHY');

  // 1) outage -> everything automatic
  await killService();
  await cycle();
  const inc = await wait(() => db.incidents[0]);
  assert.equal(inc.source, 'docker');
  await wait(() => inc.status === 'resolved', 40000);
  assert.equal(inc.analysis.mode, 'rules'); assert.equal(inc.analysis.analysis.category, 'process_down'); assert.match(inc.analysis.label, /suggestion/i);
  assert.equal(inc.policyDecisions[0].decision, 'allow'); assert.equal(inc.policyDecisions[0].rule, 'P11 auto-heal');
  assert.equal(restarts.length, 1); assert.equal(inc.recovery.state, 'verified'); assert.equal(inc.resolutionType, 'verified_recovery');
  const timelineTypes = inc.timeline.map((x) => x.type);
  for (const type of ['detected', 'ai_analysis', 'policy_decision', 'recovery_requested', 'restart_issued', 'resolved_verified']) assert.ok(timelineTypes.includes(type), `timeline has ${type}`);
  const actions = db.auditLog.map((a) => a.action);
  for (const a of ['incident_opened', 'policy_allow', 'auto_heal_started', 'execute_restart', 'incident_resolved']) assert.ok(actions.includes(a), `audit has ${a}`);

  // 2) second outage right away: cooldown policy denies, and an operator cannot override a deny
  await killService();
  await wait(async () => { await cycle(); return db.incidents.length === 2; }, 15000);
  const inc2 = db.incidents[1];
  await wait(() => inc2.policyDecisions?.length, 15000);
  assert.equal(inc2.policyDecisions[0].decision, 'deny'); assert.equal(inc2.policyDecisions[0].rule, 'P4 cooldown');
  assert.equal(restarts.length, 1, 'no second restart was executed');
  const recover = routes.get('POST /api/incidents/:id/recover');
  let status = 0; let body = null;
  await recover({ params: { id: inc2.id }, user: { id: 'u', name: 'Ops', email: 'ops@example.com', workspaceId: 'w1' } }, { status(c) { status = c; return this; }, json(b) { body = b; } });
  assert.equal(status, 409); assert.match(body.error, /Blocked by recovery policy \(P4 cooldown\)/);
  assert.ok(db.auditLog.some((a) => a.action === 'approve_blocked'));

  // 3) Prometheus alert joins the open incident instead of creating a duplicate
  const webhook = routes.get('POST /api/alerts/webhook');
  let wstatus = 0; let wbody = null;
  process.env.ALERT_WEBHOOK_TOKEN = 'unused';
  await webhook({ headers: { authorization: 'Bearer nope' }, body: {} }, { status(c) { wstatus = c; return this; }, json(b) { wbody = b; } });
  assert.equal(wstatus, 401);
  assert.equal(monitor.ingestAlert({ source: 'prometheus', service: 'products', type: 'ServiceDown', message: 'products down' }).attached, 1);
  assert.equal(db.incidents.length, 2);
  assert.equal(monitor.ingestAlert({ service: 'nonexistent', type: 'x', message: 'm' }).accepted, false);
});
