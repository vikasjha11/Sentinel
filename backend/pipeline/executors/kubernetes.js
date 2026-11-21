'use strict';
// Kubernetes executor using the REST API with a ServiceAccount token (no kubectl, no kubeconfig).
// Least privilege: see k8s/sentinel-rbac.yaml, which grants only the verbs used below in ONE namespace.
// Dry run uses the API server's own server-side dry run (?dryRun=All), so it validates against the real cluster.
const fs = require('fs');
const http = require('http');
const https = require('https');

const IN_CLUSTER = {
  tokenFile: '/var/run/secrets/kubernetes.io/serviceaccount/token',
  caFile: '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt',
  nsFile: '/var/run/secrets/kubernetes.io/serviceaccount/namespace'
};

function createKubernetesExecutor({ apiServer, token, caCert, namespace, deploymentFor = (s) => s, requestImpl, timeoutMs = 20000, now = () => new Date() }) {
  const base = new URL(apiServer);
  const request = requestImpl || ((method, path, headers, body) => new Promise((resolve, reject) => {
    const lib = base.protocol === 'https:' ? https : http;
    const req = lib.request({ protocol: base.protocol, hostname: base.hostname, port: base.port, path, method, headers, ca: caCert, timeout: timeoutMs }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* not json */ } resolve({ status: res.statusCode, body: json, text }); });
    });
    req.on('timeout', () => req.destroy(new Error('Kubernetes API timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  }));
  const call = async (method, path, { body, contentType = 'application/json' } = {}) => {
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = contentType;
    const res = await request(method, path, headers, body !== undefined ? JSON.stringify(body) : undefined);
    if (res.status < 200 || res.status >= 300) throw Object.assign(new Error(`Kubernetes API ${method} ${path.split('?')[0]} returned ${res.status}: ${res.body?.message || res.text.slice(0, 160)}`), { code: 'EXECUTION_FAILED', status: res.status });
    return res.body;
  };
  const depPath = (name) => `/apis/apps/v1/namespaces/${encodeURIComponent(namespace)}/deployments/${encodeURIComponent(name)}`;
  const q = (dryRun) => (dryRun ? '?dryRun=All' : '');

  async function restart(name, dryRun) {
    await call('PATCH', depPath(name) + q(dryRun), {
      contentType: 'application/strategic-merge-patch+json',
      body: { spec: { template: { metadata: { annotations: { 'kubectl.kubernetes.io/restartedAt': now().toISOString() } } } } }
    });
    return `${dryRun ? 'Dry run: would roll' : 'Rolled'} deployment ${name} (rolling restart).`;
  }
  async function scale(name, params, dryRun) {
    const current = (await call('GET', `${depPath(name)}/scale`)).spec.replicas;
    const raw = String(params.replicas ?? '+1');
    const target = /^[+-]\d+$/.test(raw) ? current + Number(raw) : Number(raw);
    if (!Number.isInteger(target) || target < 1) throw Object.assign(new Error(`Invalid replica target "${raw}".`), { code: 'INVALID_PARAMS' });
    await call('PATCH', `${depPath(name)}/scale${q(dryRun)}`, { contentType: 'application/merge-patch+json', body: { spec: { replicas: target } } });
    return `${dryRun ? 'Dry run: would scale' : 'Scaled'} ${name} from ${current} to ${target} replicas.`;
  }
  async function rollback(name, dryRun) {
    const dep = await call('GET', depPath(name));
    const selector = Object.entries(dep.spec.selector.matchLabels || {}).map(([k, v]) => `${k}=${v}`).join(',');
    const rsList = await call('GET', `/apis/apps/v1/namespaces/${encodeURIComponent(namespace)}/replicasets?labelSelector=${encodeURIComponent(selector)}`);
    const rev = (rs) => Number(rs.metadata.annotations?.['deployment.kubernetes.io/revision'] || 0);
    const owned = rsList.items.filter((rs) => (rs.metadata.ownerReferences || []).some((o) => o.kind === 'Deployment' && o.name === name)).sort((a, b) => rev(b) - rev(a));
    if (owned.length < 2) throw Object.assign(new Error(`${name} has no previous revision to roll back to.`), { code: 'NO_PREVIOUS_REVISION' });
    const template = JSON.parse(JSON.stringify(owned[1].spec.template));
    delete template.metadata.labels['pod-template-hash'];
    await call('PATCH', depPath(name) + q(dryRun), { contentType: 'application/json-patch+json', body: [{ op: 'replace', path: '/spec/template', value: template }] });
    return `${dryRun ? 'Dry run: would roll' : 'Rolled'} ${name} back to revision ${rev(owned[1])}.`;
  }

  return {
    name: 'kubernetes',
    supports: (action) => ['restart', 'scale', 'rollback'].includes(action),
    async execute({ service, action, params = {}, dryRun = false }) {
      const name = deploymentFor(service);
      const detail = action === 'restart' ? await restart(name, dryRun) : action === 'scale' ? await scale(name, params, dryRun) : action === 'rollback' ? await rollback(name, dryRun) : null;
      if (detail === null) throw Object.assign(new Error(`The Kubernetes executor does not support "${action}".`), { code: 'UNSUPPORTED' });
      return { ok: true, dryRun, detail };
    }
  };
}

function inClusterConfig(env = process.env, fsImpl = fs) {
  const host = env.KUBERNETES_SERVICE_HOST; const port = env.KUBERNETES_SERVICE_PORT || '443';
  if (!host) return null;
  return { apiServer: `https://${host}:${port}`, token: fsImpl.readFileSync(IN_CLUSTER.tokenFile, 'utf8').trim(), caCert: fsImpl.readFileSync(IN_CLUSTER.caFile), namespace: env.K8S_NAMESPACE || fsImpl.readFileSync(IN_CLUSTER.nsFile, 'utf8').trim() };
}

module.exports = { createKubernetesExecutor, inClusterConfig };
