'use strict';
// Reliability analytics computed from incident records (no estimated values).
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const ms = (a, b) => Date.parse(b) - Date.parse(a);

function computeAnalytics(incidents, { from, to } = {}) {
  const lo = from ? Date.parse(from) : -Infinity; const hi = to ? Date.parse(to) : Infinity;
  const inRange = incidents.filter((i) => { const t = Date.parse(i.detectedAt); return t >= lo && t <= hi; });
  const resolved = inRange.filter((i) => i.lifecycle === 'resolved' && i.resolvedAt);
  const mttd = inRange.filter((i) => i.firstFailureAt && i.detectedAt).map((i) => ms(i.firstFailureAt, i.detectedAt)).filter((v) => v >= 0);
  const mttr = resolved.map((i) => ms(i.detectedAt, i.resolvedAt)).filter((v) => v >= 0);
  const attempted = inRange.filter((i) => (i.attempts || []).some((a) => a.executed));
  const recovered = attempted.filter((i) => i.lifecycle === 'resolved');
  const perService = new Map();
  for (const i of inRange) perService.set(i.service, (perService.get(i.service) || 0) + 1);
  return {
    range: { from: from || null, to: to || null },
    incidents: { total: inRange.length, resolved: resolved.length, open: inRange.filter((i) => !['resolved', 'failed'].includes(i.lifecycle)).length, failed: inRange.filter((i) => i.lifecycle === 'failed').length },
    mttdMs: mean(mttd) === null ? null : Math.round(mean(mttd)),
    mttrMs: mean(mttr) === null ? null : Math.round(mean(mttr)),
    recovery: { attempted: attempted.length, succeeded: recovered.length, successRate: attempted.length ? Math.round((recovered.length / attempted.length) * 1000) / 10 : null },
    topFailingServices: [...perService.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([service, count]) => ({ service, count }))
  };
}

function incidentsCsv(incidents) {
  const esc = (v) => { let s = v == null ? '' : String(v); if (/^[=+\-@]/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const rows = [['id', 'service', 'severity', 'lifecycle', 'detectedAt', 'resolvedAt', 'mttrSeconds', 'attempts']];
  for (const i of incidents) rows.push([i.id, i.service, i.severity, i.lifecycle, i.detectedAt, i.resolvedAt || '', i.resolvedAt ? Math.round(ms(i.detectedAt, i.resolvedAt) / 1000) : '', (i.attempts || []).length]);
  return rows.map((r) => r.map(esc).join(',')).join('\n');
}
module.exports = { computeAnalytics, incidentsCsv };
