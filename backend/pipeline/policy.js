'use strict';
// Policy Engine: validates a proposed recovery action against declarative, versioned rules BEFORE it runs.
// Pure functions: the caller supplies the policy document, the action history and the clock, so every decision
// is reproducible and unit-testable. Each decision names the rule that produced it.
const APPROVAL_MODES = ['manual', 'auto', 'monitor_only'];
const ACTIONS = ['restart', 'scale', 'rollback'];
const CRITICALITY = ['critical', 'standard'];

function validatePolicy(p) {
  const errors = [];
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (!isObj(p)) return ['policy must be an object'];
  if (!Number.isInteger(p.version) || p.version < 1) errors.push('version must be a positive integer');
  if (typeof p.name !== 'string' || !p.name) errors.push('name is required');
  const checkSet = (where, s) => {
    if (!isObj(s)) { errors.push(`${where} must be an object`); return; }
    if (s.approvalMode !== undefined && !APPROVAL_MODES.includes(s.approvalMode)) errors.push(`${where}.approvalMode must be one of ${APPROVAL_MODES.join(', ')}`);
    if (s.criticality !== undefined && !CRITICALITY.includes(s.criticality)) errors.push(`${where}.criticality must be one of ${CRITICALITY.join(', ')}`);
    if (s.allowedActions !== undefined && (!Array.isArray(s.allowedActions) || s.allowedActions.some((a) => !ACTIONS.includes(a)))) errors.push(`${where}.allowedActions must list only ${ACTIONS.join(', ')}`);
    for (const k of ['maxRestartsPerHour', 'cooldownSeconds', 'maxScaleReplicas']) {
      if (s[k] !== undefined && (!Number.isInteger(s[k]) || s[k] < 0)) errors.push(`${where}.${k} must be a non-negative integer`);
    }
    const w = s.autoHealWindow;
    if (w !== undefined && w !== null) {
      const okDays = Array.isArray(w.days) && w.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
      const okHours = Number.isInteger(w.startHour) && Number.isInteger(w.endHour) && w.startHour >= 0 && w.endHour <= 24 && w.startHour < w.endHour;
      if (!okDays || !okHours) errors.push(`${where}.autoHealWindow needs days (0-6), startHour < endHour (0-24) and optional utcOffsetMinutes`);
    }
  };
  checkSet('defaults', p.defaults || {});
  if (!isObj(p.services)) errors.push('services must be an object');
  else for (const [name, s] of Object.entries(p.services)) { if (!/^[a-z0-9-]+$/.test(name)) errors.push(`service name "${name}" is invalid`); checkSet(`services.${name}`, s); }
  if (p.limits && (!Number.isInteger(p.limits.maxConcurrentRecoveries) || p.limits.maxConcurrentRecoveries < 1)) errors.push('limits.maxConcurrentRecoveries must be a positive integer');
  return errors;
}

function resolveService(policy, service) {
  const own = policy.services[service];
  return own ? { registered: true, ...policy.defaults, ...own } : { registered: false, ...policy.defaults };
}

function insideWindow(window, now) {
  if (!window) return true;
  const shifted = new Date(now + (window.utcOffsetMinutes || 0) * 60000);
  const hour = shifted.getUTCHours() + shifted.getUTCMinutes() / 60;
  return window.days.includes(shifted.getUTCDay()) && hour >= window.startHour && hour < window.endHour;
}

/**
 * @param policy   validated policy document
 * @param request  { service, action, environment, replicas, now }
 * @param history  { actions: [{service, action, at}], activeRecoveries: number }
 * @returns { decision: 'allow'|'require_approval'|'deny'|'monitor_only', rule, reason, policyVersion }
 */
function evaluate(policy, request, history = { actions: [], activeRecoveries: 0 }) {
  const { service, action, environment = 'production' } = request;
  const now = request.now ?? Date.now();
  const cfg = resolveService(policy, service);
  const out = (decision, rule, reason) => ({ decision, rule, reason, policyVersion: policy.version, policyName: policy.name, service, action, criticality: cfg.criticality });
  const mine = history.actions.filter((a) => a.service === service);

  if (!ACTIONS.includes(action) || !cfg.allowedActions.includes(action)) return out('deny', 'P1 allowed-actions', `"${action}" is not an allowed action for ${service} (allowed: ${cfg.allowedActions.join(', ')}).`);
  if (!cfg.registered) return out('require_approval', 'P2 unregistered-service', `${service} has no policy entry, so a person must approve (fail-safe).`);
  if (cfg.approvalMode === 'monitor_only') return out('monitor_only', 'P3 monitor-only', `${service} is monitor-only: Sentinel detects and reports but never acts.`);
  const last = mine.reduce((m, a) => Math.max(m, a.at), 0);
  if (last && now - last < cfg.cooldownSeconds * 1000) return out('deny', 'P4 cooldown', `The last action on ${service} was ${Math.round((now - last) / 1000)}s ago; cooldown is ${cfg.cooldownSeconds}s.`);
  const restarts = mine.filter((a) => a.action === 'restart' && now - a.at < 3600000).length;
  if (action === 'restart' && restarts >= cfg.maxRestartsPerHour) return out('deny', 'P5 restart-budget', `${restarts} restarts in the last hour (limit ${cfg.maxRestartsPerHour}). Repeated restarts are not fixing it; escalate to a person.`);
  if (action === 'scale' && Number(request.replicas) > cfg.maxScaleReplicas) return out('deny', 'P6 scale-cap', `${request.replicas} replicas exceeds the maximum of ${cfg.maxScaleReplicas}.`);
  const maxConcurrent = policy.limits?.maxConcurrentRecoveries ?? 2;
  if (history.activeRecoveries >= maxConcurrent) return out('deny', 'P7 blast-radius', `${history.activeRecoveries} recoveries are already running (limit ${maxConcurrent}).`);
  if (cfg.criticality === 'critical' && policy.environments?.[environment]?.criticalRequiresApproval) return out('require_approval', 'P8 critical-approval', `${service} is critical in ${environment}; a person must approve.`);
  if (cfg.approvalMode === 'manual') return out('require_approval', 'P9 manual-mode', `${service} is set to manual approval.`);
  if (!insideWindow(cfg.autoHealWindow, now)) return out('require_approval', 'P10 outside-auto-heal-window', `Outside the auto-heal window for ${service}; a person must approve.`);
  return out('allow', 'P11 auto-heal', `${action} on ${service} is allowed automatically (auto mode, within limits).`);
}

module.exports = { validatePolicy, evaluate, resolveService, APPROVAL_MODES, ACTIONS };
