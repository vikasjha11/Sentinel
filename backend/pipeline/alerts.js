'use strict';
// Converts an Alertmanager webhook payload into Sentinel signals. Only firing alerts that carry a
// "service" label become signals; anything else is ignored (never guessed).
const SEVERITY = new Set(['low', 'medium', 'high', 'critical']);
function signalsFromAlertmanager(payload) {
  if (!payload || !Array.isArray(payload.alerts)) throw new Error('Not an Alertmanager webhook payload.');
  return payload.alerts.filter((a) => a.status === 'firing' && a.labels?.service).map((a) => ({
    source: 'prometheus', service: String(a.labels.service), type: String(a.labels.alertname || 'alert'),
    severity: SEVERITY.has(a.labels.severity) ? a.labels.severity : 'medium',
    message: String(a.annotations?.summary || a.annotations?.description || a.labels.alertname || 'Prometheus alert').slice(0, 300),
    firstFailureAt: a.startsAt || null
  }));
}
module.exports = { signalsFromAlertmanager };
