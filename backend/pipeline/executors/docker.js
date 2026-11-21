'use strict';
// Docker Compose executor. It never touches the Docker socket: it asks the Recovery Controller, which only
// exposes an allowlisted stop/start/restart API. Scale and rollback are not supported on Docker Compose.
function createDockerExecutor({ controllerUrl, token, fetchImpl = fetch, timeoutMs = 60000 }) {
  const base = String(controllerUrl).replace(/\/$/, '');
  return {
    name: 'docker',
    supports: (action) => action === 'restart',
    async execute({ service, action, dryRun = false, incidentId, requestedBy = 'sentinel' }) {
      if (action !== 'restart') throw Object.assign(new Error(`The Docker executor does not support "${action}".`), { code: 'UNSUPPORTED' });
      if (dryRun) return { ok: true, dryRun: true, detail: `Dry run: would ask the Recovery Controller to restart "${service}".` };
      if (!token) throw Object.assign(new Error('Recovery Controller token is not configured.'), { code: 'NOT_CONFIGURED' });
      const res = await fetchImpl(`${base}/v1/services/${encodeURIComponent(service)}/restart`, {
        method: 'POST', signal: AbortSignal.timeout(timeoutMs),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestedBy, incidentId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.error || `Recovery Controller returned HTTP ${res.status}.`), { code: 'EXECUTION_FAILED', status: res.status });
      return { ok: true, dryRun: false, detail: `Restarted container ${data.container || service}.`, raw: data };
    }
  };
}
module.exports = { createDockerExecutor };
