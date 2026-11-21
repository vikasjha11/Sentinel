'use strict';
// Mounts the AI + policy + analytics layer on the Sentinel API.
// What runs where:
//   * Docker incidents are still created and verified by docker-monitor.js. This layer ADDS: AI analysis, policy
//     decisions (with the rule that caused each), optional auto-heal, notifications, an audit trail and analytics.
//   * Prometheus/Alertmanager alerts arrive at POST /api/alerts/webhook and become a second detection signal.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validatePolicy, evaluate } = require('./policy');
const { createAiClient } = require('./ai-client');
const { createNotifier } = require('./notifications');
const { computeAnalytics, incidentsCsv } = require('./analytics');
const { signalsFromAlertmanager } = require('./alerts');

const DEFAULT_POLICY_FILE = path.join(__dirname, 'policy.default.json');
const safeEqual = (a, b) => { const x = crypto.createHash('sha256').update(String(a)).digest(); const y = crypto.createHash('sha256').update(String(b)).digest(); return crypto.timingSafeEqual(x, y); };
const log = (level, event, f = {}) => process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), service: 'sentinel-api', level, event, ...f })}\n`);

function loadPolicy(file) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const errors = validatePolicy(doc);
  if (errors.length) throw new Error(`Invalid policy ${file}: ${errors.join('; ')}`);
  return doc;
}

function createPipeline({ app, auth, db, saveDb, newId, monitor, env = process.env, fetchImpl = fetch }) {
  const cfg = {
    enabled: env.PIPELINE_ENABLED !== 'false',
    autoHeal: env.PIPELINE_AUTOHEAL === 'true',
    environment: env.SENTINEL_ENVIRONMENT || 'production',
    policyFile: env.POLICY_FILE || DEFAULT_POLICY_FILE,
    aiUrl: env.AI_ENGINE_URL || '',
    alertToken: env.ALERT_WEBHOOK_TOKEN || '',
    allowPrivateNotify: env.NOTIFY_ALLOW_PRIVATE === 'true'
  };
  if (!fs.existsSync(cfg.policyFile)) { fs.mkdirSync(path.dirname(cfg.policyFile), { recursive: true }); fs.copyFileSync(DEFAULT_POLICY_FILE, cfg.policyFile); }
  let policy = loadPolicy(cfg.policyFile);
  const ai = createAiClient({ url: cfg.aiUrl, fetchImpl });
  let channels = [];
  if (env.NOTIFY_CHANNELS_FILE) channels = JSON.parse(fs.readFileSync(env.NOTIFY_CHANNELS_FILE, 'utf8'));
  const notifier = createNotifier({ channels, allowPrivate: cfg.allowPrivateNotify, fetchImpl });
  db.auditLog ||= [];
  const actions = []; // executed recovery actions, used by policy cooldown / restart budget

  const audit = (entry) => { db.auditLog.push({ id: newId(), at: new Date().toISOString(), ...entry }); if (db.auditLog.length > 5000) db.auditLog.splice(0, db.auditLog.length - 5000); saveDb(); };
  const stamp = (inc, type, message) => { (inc.timeline ||= []).push({ at: new Date().toISOString(), type, message }); };
  const isOwner = (req) => !req.user.role || req.user.role === 'owner';
  const notify = (inc, type, message) => notifier.notify({ type, severity: inc.severity || 'medium', title: `${inc.serviceName || inc.service}: ${inc.title}`, message, incidentId: inc.id, service: inc.serviceKey }).catch(() => {});
  const policyHistory = () => ({ actions, activeRecoveries: db.incidents.filter((i) => i.status === 'open' && ['requested', 'restarting', 'verifying'].includes(i.recovery?.state)).length });
  const decide = (inc, action = 'restart') => evaluate(policy, { service: inc.serviceKey, action, environment: cfg.environment }, policyHistory());

  // ---- hooks called by docker-monitor.js ------------------------------------------------------------------------
  async function onIncidentOpened(inc) {
    if (!cfg.enabled || inc.source !== 'docker') return;
    audit({ actor: 'sentinel', action: 'incident_opened', incidentId: inc.id, service: inc.serviceKey, workspaceId: inc.workspaceId });
    notify(inc, 'incident_opened', inc.failureReason || inc.description);
    const result = await ai.diagnose({ service: inc.serviceKey, incident: { id: inc.id, severity: inc.severity, type: inc.detectionSource || 'healthcheck' }, ...(await monitor.incidentContext(inc)) });
    inc.analysis = result;
    stamp(inc, 'ai_analysis', `AI analysis (${result.mode}): ${result.analysis.rootCause} Confidence ${Math.round(result.analysis.confidence * 100)}%. Suggestion only.`);
    const top = result.analysis.suggestions[0];
    if (top && top.action !== 'investigate') {
      const d = decide(inc, top.action);
      (inc.policyDecisions ||= []).push({ at: new Date().toISOString(), ...d });
      stamp(inc, 'policy_decision', `Policy v${d.policyVersion}: ${d.decision} for ${top.action} (${d.rule}). ${d.reason}`);
      audit({ actor: 'policy-engine', action: `policy_${d.decision}`, incidentId: inc.id, service: inc.serviceKey, rule: d.rule, reason: d.reason });
      if (d.decision === 'require_approval') notify(inc, 'approval_needed', `Approve ${top.action} for ${inc.serviceName}.`);
      if (d.decision === 'allow' && cfg.autoHeal && top.action === 'restart' && top.confidence >= 0.5) {
        audit({ actor: 'sentinel', action: 'auto_heal_started', incidentId: inc.id, service: inc.serviceKey });
        await monitor.recoverIncident(inc, { id: 'sentinel', name: 'Sentinel auto-heal', email: 'auto-heal@sentinel' });
      }
    } else stamp(inc, 'needs_person', 'The analysis recommends investigation rather than an automatic action.');
    saveDb();
  }
  // Policy hard-denials also bind people: an operator cannot approve a restart that breaches the restart budget.
  function beforeRecovery(inc, user) {
    const d = decide(inc, 'restart');
    if (d.decision === 'deny' || d.decision === 'monitor_only') { audit({ actor: user.email, action: `approve_blocked`, incidentId: inc.id, service: inc.serviceKey, rule: d.rule, reason: d.reason }); return { allowed: false, reason: d.reason, rule: d.rule }; }
    audit({ actor: user.email, action: 'approve', incidentId: inc.id, service: inc.serviceKey, rule: d.rule });
    return { allowed: true };
  }
  function onRecoveryExecuted(inc, user) { actions.push({ service: inc.serviceKey, action: 'restart', at: Date.now() }); audit({ actor: user.email, action: 'execute_restart', incidentId: inc.id, service: inc.serviceKey }); }
  function onIncidentResolved(inc) { audit({ actor: inc.resolvedBy || 'sentinel', action: 'incident_resolved', incidentId: inc.id, service: inc.serviceKey, resolution: inc.resolutionType }); notify(inc, 'incident_resolved', `Resolved (${inc.resolutionType}).`); }

  // ---- routes ----------------------------------------------------------------------------------------------------
  app.post('/api/alerts/webhook', (req, res) => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!cfg.alertToken || !m || !safeEqual(m[1], cfg.alertToken)) return res.status(401).json({ error: 'Unauthorized.' });
    let signals; try { signals = signalsFromAlertmanager(req.body); } catch (e) { return res.status(400).json({ error: e.message }); }
    const accepted = signals.map((s) => ({ service: s.service, ...monitor.ingestAlert(s) }));
    res.json({ received: signals.length, accepted });
  });
  app.get('/api/pipeline/status', auth, (req, res) => res.json({ enabled: cfg.enabled, autoHeal: cfg.autoHeal, environment: cfg.environment, policy: { name: policy.name, version: policy.version }, aiEngineConfigured: !!cfg.aiUrl, notificationChannels: notifier.channels().length }));
  app.get('/api/pipeline/policy', auth, (req, res) => res.json(policy));
  app.post('/api/pipeline/policy/validate', auth, (req, res) => { const errors = validatePolicy(req.body); res.json({ valid: !errors.length, errors }); });
  app.put('/api/pipeline/policy', auth, (req, res) => {
    if (!isOwner(req)) return res.status(403).json({ error: 'Workspace owner access required.' });
    const errors = validatePolicy(req.body);
    if (errors.length) return res.status(400).json({ error: 'Policy is invalid.', errors });
    if (req.body.version <= policy.version) return res.status(409).json({ error: `Policy version must be greater than the current version (${policy.version}).` });
    const tmp = `${cfg.policyFile}.tmp`; fs.writeFileSync(tmp, JSON.stringify(req.body, null, 2)); fs.renameSync(tmp, cfg.policyFile);
    policy = req.body; audit({ actor: req.user.email, action: 'policy_updated', version: policy.version }); log('info', 'policy_updated', { version: policy.version });
    res.json(policy);
  });
  app.get('/api/analytics', auth, (req, res) => res.json(computeAnalytics(db.incidents.filter((i) => i.workspaceId === req.user.workspaceId).map(normalise), { from: req.query.from, to: req.query.to })));
  app.get('/api/analytics/incidents.csv', auth, (req, res) => { res.type('text/csv'); res.send(incidentsCsv(db.incidents.filter((i) => i.workspaceId === req.user.workspaceId).map(normalise))); });
  app.get('/api/audit', auth, (req, res) => {
    const rows = db.auditLog.filter((a) => !a.workspaceId || a.workspaceId === req.user.workspaceId).slice(-500).reverse();
    if (req.query.format === 'csv') { res.type('text/csv'); return res.send(['at,actor,action,service,incidentId,rule', ...rows.map((r) => [r.at, r.actor, r.action, r.service || '', r.incidentId || '', r.rule || ''].map((v) => `"${String(v).replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`).join(','))].join('\n')); }
    res.json(rows);
  });
  app.get('/api/notifications/channels', auth, (req, res) => res.json({ channels: notifier.channels(), deliveries: notifier.deliveryLog().slice(0, 50) }));
  app.post('/api/notifications/test', auth, async (req, res) => {
    if (!isOwner(req)) return res.status(403).json({ error: 'Workspace owner access required.' });
    const channel = channels.find((c) => c.name === req.body?.channel);
    if (!channel) return res.status(404).json({ error: 'Unknown channel.' });
    res.json(await notifier.testSend(channel));
  });

  return { onIncidentOpened, beforeRecovery, onRecoveryExecuted, onIncidentResolved, notifier, getPolicy: () => policy };
}

// Existing Docker incidents use different field names; map them for analytics without changing stored data.
function normalise(i) {
  return { id: i.id, service: i.serviceKey || i.projectName, severity: i.severity, lifecycle: i.status === 'resolved' ? 'resolved' : (i.recovery?.state === 'failed' ? 'failed' : 'open'), detectedAt: i.firstDetectedAt || i.createdAt, firstFailureAt: i.firstFailureAt || i.firstDetectedAt || i.createdAt, resolvedAt: i.resolvedAt, attempts: (i.recovery?.history || []).map((h) => ({ executed: !!h.restartedAt })) };
}

module.exports = { createPipeline, loadPolicy };
