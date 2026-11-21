'use strict';
// Orchestrator: wires the proposal pipeline together.
//   signal -> incident -> AI analysis -> policy decision -> (approval) -> execution -> verification -> resolved/failed
// Every collaborator is injected (store, AI client, policy provider, executors, notifier, health probe, clock), so the
// same flow runs against real services in production and against fakes in tests.
const lifecycle = require('./lifecycle');
const { evaluate } = require('./policy');

function createOrchestrator({ store, ai, getPolicy, executors, notifier, probe, context, audit = () => {}, newId, platformFor = () => 'docker', config = {} }) {
  const cfg = { dryRun: false, minActionConfidence: 0.5, verifyWindowMs: 90000, verifyIntervalMs: 2000, verifyPasses: 2, maxAttempts: 2, environment: 'production', sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: () => Date.now(), ...config };
  const iso = () => new Date(cfg.now()).toISOString();
  const running = new Set();
  const actionHistory = [];

  const historyFor = () => ({ actions: actionHistory, activeRecoveries: store.list().filter((i) => ['recovering', 'verifying'].includes(i.lifecycle)).length });
  const save = (inc) => store.save(inc);
  const note = (inc, type, message, extra) => lifecycle.stamp(inc, type, message, extra, iso());
  const emit = (inc, type, message) => notifier?.notify({ type, severity: inc.severity, title: `${inc.service}: ${inc.title}`, message, incidentId: inc.id, service: inc.service }).catch(() => {});

  function handleSignal(signal, workspaceId = 'default') {
    const existing = store.list().find((i) => i.workspaceId === workspaceId && i.service === signal.service && lifecycle.isActive(i));
    if (existing) { lifecycle.addSignal(existing, signal, iso()); save(existing); return { incident: existing, created: false }; }
    const inc = lifecycle.createIncident({ id: newId(), workspaceId, service: signal.service, title: signal.title || `${signal.service} is unhealthy`, severity: signal.severity, source: signal.source, detectedAt: iso(), firstFailureAt: signal.firstFailureAt || iso(), description: signal.message });
    lifecycle.addSignal(inc, signal, iso());
    save(inc); audit({ at: iso(), actor: 'sentinel', action: 'incident_opened', incidentId: inc.id, service: inc.service });
    emit(inc, 'incident_opened', signal.message);
    return { incident: inc, created: true };
  }

  async function investigate(inc) {
    lifecycle.transition(inc, 'investigating', { at: iso(), message: 'Collecting context and requesting AI analysis.' });
    save(inc);
    const ctx = await context(inc);
    const result = await ai.diagnose({ service: inc.service, incident: { id: inc.id, severity: inc.severity, type: inc.signals[0]?.type }, ...ctx });
    inc.analysis = result;
    note(inc, 'ai_analysis', `AI analysis (${result.mode}): ${result.analysis.rootCause} Confidence ${Math.round(result.analysis.confidence * 100)}%. This is a suggestion.`);
    save(inc);
    return result.analysis;
  }

  function decide(inc, suggestion) {
    const policy = getPolicy();
    const d = evaluate(policy, { service: inc.service, action: suggestion.action, environment: cfg.environment, replicas: suggestion.params?.replicas, now: cfg.now() }, historyFor());
    inc.policyDecisions = inc.policyDecisions || [];
    inc.policyDecisions.push({ at: iso(), ...d });
    note(inc, 'policy_decision', `Policy v${d.policyVersion}: ${d.decision} (${d.rule}). ${d.reason}`);
    audit({ at: iso(), actor: 'policy-engine', action: `policy_${d.decision}`, incidentId: inc.id, service: inc.service, rule: d.rule, reason: d.reason });
    save(inc);
    return d;
  }

  async function execute(inc, suggestion, { requestedBy = 'sentinel', approvedBy = null } = {}) {
    const platform = platformFor(inc.service);
    const exec = executors.for(platform);
    const attempt = { n: inc.attempts.length + 1, action: suggestion.action, params: suggestion.params || {}, platform, requestedBy, approvedBy, dryRun: cfg.dryRun, startedAt: iso(), executed: false };
    inc.attempts.push(attempt);
    lifecycle.transition(inc, 'recovering', { at: iso(), message: `${cfg.dryRun ? 'DRY RUN: ' : ''}Executing ${suggestion.action} via ${platform}${approvedBy ? ` (approved by ${approvedBy})` : ' (auto-heal within policy)'}.` });
    save(inc);
    try {
      const out = await exec.execute({ service: inc.service, action: suggestion.action, params: suggestion.params, dryRun: cfg.dryRun, incidentId: inc.id, requestedBy: approvedBy || requestedBy });
      attempt.executed = !cfg.dryRun; attempt.result = out.detail; attempt.finishedAt = iso();
      actionHistory.push({ service: inc.service, action: suggestion.action, at: cfg.now() });
      audit({ at: iso(), actor: approvedBy || 'sentinel', action: `execute_${suggestion.action}`, incidentId: inc.id, service: inc.service, dryRun: cfg.dryRun, result: out.detail });
      note(inc, 'action_executed', out.detail);
      if (cfg.dryRun) { lifecycle.transition(inc, 'failed', { at: iso(), message: 'Dry run finished. No change was made; incident stays open for a person.' }); save(inc); return false; }
      save(inc);
      return true;
    } catch (e) {
      attempt.error = e.message; attempt.finishedAt = iso();
      note(inc, 'action_failed', e.message);
      lifecycle.transition(inc, 'failed', { at: iso(), message: `Execution failed: ${e.message}` });
      save(inc); emit(inc, 'recovery_failed', e.message);
      return false;
    }
  }

  async function verify(inc) {
    lifecycle.transition(inc, 'verifying', { at: iso(), message: `Waiting for ${cfg.verifyPasses} consecutive healthy checks (window ${Math.round(cfg.verifyWindowMs / 1000)}s).` });
    save(inc);
    const deadline = cfg.now() + cfg.verifyWindowMs; let passes = 0;
    while (cfg.now() < deadline) {
      await cfg.sleep(cfg.verifyIntervalMs);
      const ok = await probe(inc.service).catch(() => false);
      passes = ok ? passes + 1 : 0;
      if (passes >= cfg.verifyPasses) {
        const attempt = inc.attempts[inc.attempts.length - 1]; attempt.verified = true;
        lifecycle.transition(inc, 'resolved', { at: iso(), message: `${inc.service} passed ${passes} consecutive health checks. Recovery verified.` });
        audit({ at: iso(), actor: 'sentinel', action: 'incident_resolved', incidentId: inc.id, service: inc.service });
        save(inc); emit(inc, 'incident_resolved', 'Recovery verified.');
        return true;
      }
    }
    inc.attempts[inc.attempts.length - 1].verified = false;
    note(inc, 'verification_failed', `${inc.service} did not become healthy within the verification window.`);
    return false;
  }

  // Runs the loop for one incident. Returns the final lifecycle state.
  async function process(incidentId) {
    if (running.has(incidentId)) return 'busy';
    running.add(incidentId);
    try {
      const inc = store.get(incidentId);
      const analysis = inc.analysis ? inc.analysis.analysis : await investigate(inc);
      // Act only on ranked suggestions, in order, and stop at the first "investigate": the analysis is telling a person
      // to look, so lower-ranked automatic actions must not run behind its back. Low-confidence actions never auto-run.
      const actionable = [];
      for (const s of analysis.suggestions) { if (s.action === 'investigate' || s.confidence < cfg.minActionConfidence) break; actionable.push(s); }
      if (!actionable.length) { note(inc, 'needs_person', `No automatic action is recommended (${analysis.suggestions[0]?.action || 'none'}, confidence ${Math.round((analysis.suggestions[0]?.confidence || 0) * 100)}%). A person should investigate: ${analysis.rootCause}`); save(inc); emit(inc, 'needs_attention', analysis.rootCause); return inc.lifecycle; }
      for (let tries = 0; tries < cfg.maxAttempts; tries += 1) {
        const suggestion = actionable[Math.min(tries, actionable.length - 1)];
        const d = decide(inc, suggestion);
        if (d.decision === 'monitor_only') return inc.lifecycle;
        if (d.decision === 'require_approval') { inc.pendingApproval = { suggestion, rule: d.rule, at: iso() }; note(inc, 'awaiting_approval', `Waiting for a person to approve ${suggestion.action}.`); save(inc); emit(inc, 'approval_needed', `Approve ${suggestion.action} for ${inc.service}.`); return inc.lifecycle; }
        if (d.decision === 'deny') { lifecycle.transition(inc, 'failed', { at: iso(), message: `Policy denied ${suggestion.action}: ${d.reason} Escalating to a person.` }); save(inc); emit(inc, 'escalated', d.reason); return 'failed'; }
        if (!(await execute(inc, suggestion))) return inc.lifecycle;
        if (await verify(inc)) return 'resolved';
        if (tries + 1 < cfg.maxAttempts) lifecycle.transition(inc, 'recovering', { at: iso(), message: 'Verification failed; retrying within policy limits.' });
      }
      lifecycle.transition(inc, 'failed', { at: iso(), message: 'Recovery did not succeed within the retry limit. Manual intervention required.' });
      save(inc); emit(inc, 'escalated', 'Automatic recovery failed; manual intervention required.');
      return 'failed';
    } finally { running.delete(incidentId); }
  }

  // A person approves the pending (or a chosen) suggestion. Policy hard denials still apply.
  async function approve(incidentId, user) {
    const inc = store.get(incidentId);
    const suggestion = inc.pendingApproval?.suggestion;
    if (!suggestion) throw Object.assign(new Error('This incident has no action waiting for approval.'), { status: 409 });
    if (running.has(incidentId)) throw Object.assign(new Error('A recovery is already running.'), { status: 409 });
    running.add(incidentId);
    try {
      const d = evaluate(getPolicy(), { service: inc.service, action: suggestion.action, environment: cfg.environment, replicas: suggestion.params?.replicas, now: cfg.now() }, historyFor());
      if (d.decision === 'deny') { note(inc, 'policy_decision', `Policy v${d.policyVersion}: deny (${d.rule}). ${d.reason}`); save(inc); throw Object.assign(new Error(`Policy denies this action: ${d.reason}`), { status: 422 }); }
      inc.policyDecisions.push({ at: iso(), ...d, approvedBy: user });
      delete inc.pendingApproval;
      audit({ at: iso(), actor: user, action: 'approve', incidentId: inc.id, service: inc.service, rule: d.rule });
      if (!(await execute(inc, suggestion, { approvedBy: user }))) return inc.lifecycle;
      return (await verify(inc)) ? 'resolved' : (lifecycle.transition(inc, 'failed', { at: iso(), message: 'Approved recovery did not verify. Manual intervention required.' }), save(inc), 'failed');
    } finally { running.delete(incidentId); }
  }

  return { handleSignal, process, approve, investigate };
}
module.exports = { createOrchestrator };
