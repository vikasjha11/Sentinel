'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createDockerExecutor } = require('../pipeline/executors/docker');
const { createKubernetesExecutor, inClusterConfig } = require('../pipeline/executors/kubernetes');
const { createExecutorRegistry } = require('../pipeline/executors');

test('docker executor calls the recovery controller with the bearer token', async () => {
  const calls = [];
  const ex = createDockerExecutor({ controllerUrl: 'http://rc:7000/', token: 'tok', fetchImpl: async (url, o) => { calls.push({ url, o }); return { ok: true, json: async () => ({ container: 'tilda-products' }) }; } });
  const r = await ex.execute({ service: 'products', action: 'restart', incidentId: 'i1' });
  assert.equal(calls[0].url, 'http://rc:7000/v1/services/products/restart');
  assert.equal(calls[0].o.headers.Authorization, 'Bearer tok');
  assert.equal(r.ok, true);
});
test('docker executor dry run makes no request and rejects unsupported actions', async () => {
  const ex = createDockerExecutor({ controllerUrl: 'http://rc', token: 't', fetchImpl: async () => { throw new Error('must not be called'); } });
  assert.equal((await ex.execute({ service: 'products', action: 'restart', dryRun: true })).dryRun, true);
  await assert.rejects(ex.execute({ service: 'products', action: 'scale' }), /does not support/);
  assert.equal(ex.supports('scale'), false);
});
test('docker executor surfaces controller errors', async () => {
  const ex = createDockerExecutor({ controllerUrl: 'http://rc', token: 't', fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ error: 'not allowlisted' }) }) });
  await assert.rejects(ex.execute({ service: 'x', action: 'restart' }), /not allowlisted/);
});

// A fake Kubernetes API server speaking real HTTP, so the executor's actual requests are exercised.
function fakeK8s() {
  const seen = []; const state = { replicas: 2 };
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, type: req.headers['content-type'], body: body ? JSON.parse(body) : null });
      const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      const u = req.url.split('?')[0];
      if (req.headers.authorization !== 'Bearer sa-token') return send(401, { message: 'Unauthorized' });
      if (u.endsWith('/deployments/shop/scale') && req.method === 'GET') return send(200, { spec: { replicas: state.replicas } });
      if (u.endsWith('/deployments/shop/scale') && req.method === 'PATCH') return send(200, {});
      if (u.endsWith('/deployments/shop') && req.method === 'GET') return send(200, { spec: { selector: { matchLabels: { app: 'shop' } } } });
      if (u.endsWith('/deployments/shop') && req.method === 'PATCH') return send(200, {});
      if (u.endsWith('/replicasets')) {
        const rs = (rev, image) => ({ metadata: { annotations: { 'deployment.kubernetes.io/revision': String(rev) }, ownerReferences: [{ kind: 'Deployment', name: 'shop' }] }, spec: { template: { metadata: { labels: { app: 'shop', 'pod-template-hash': 'h' + rev } }, spec: { containers: [{ name: 'shop', image }] } } } });
        return send(200, { items: [rs(1, 'shop:v1'), rs(2, 'shop:v2')] });
      }
      send(404, { message: 'not found' });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen, url: `http://127.0.0.1:${server.address().port}` })));
}

test('kubernetes executor: restart, scale, rollback and dry run against a fake API server', async (t) => {
  const k = await fakeK8s(); t.after(() => k.server.close());
  const ex = createKubernetesExecutor({ apiServer: k.url, token: 'sa-token', namespace: 'prod', deploymentFor: () => 'shop', now: () => new Date('2026-01-01T00:00:00Z') });

  await ex.execute({ service: 'shop', action: 'restart' });
  const restart = k.seen.find((s) => s.method === 'PATCH' && s.url.startsWith('/apis/apps/v1/namespaces/prod/deployments/shop'));
  assert.equal(restart.type, 'application/strategic-merge-patch+json');
  assert.equal(restart.body.spec.template.metadata.annotations['kubectl.kubernetes.io/restartedAt'], '2026-01-01T00:00:00.000Z');
  assert.ok(!restart.url.includes('dryRun'));

  const scaled = await ex.execute({ service: 'shop', action: 'scale', params: { replicas: '+1' } });
  assert.match(scaled.detail, /from 2 to 3/);
  assert.deepEqual(k.seen.filter((s) => s.method === 'PATCH').pop().body, { spec: { replicas: 3 } });

  const rolled = await ex.execute({ service: 'shop', action: 'rollback' });
  assert.match(rolled.detail, /revision 1/);
  const patch = k.seen.filter((s) => s.method === 'PATCH').pop();
  assert.equal(patch.type, 'application/json-patch+json');
  assert.equal(patch.body[0].value.spec.containers[0].image, 'shop:v1');
  assert.equal(patch.body[0].value.metadata.labels['pod-template-hash'], undefined);

  k.seen.length = 0;
  const dry = await ex.execute({ service: 'shop', action: 'restart', dryRun: true });
  assert.equal(dry.dryRun, true);
  assert.ok(k.seen.find((s) => s.method === 'PATCH').url.includes('dryRun=All'));
});
test('kubernetes executor rejects bad tokens, bad replica targets and unsupported actions', async (t) => {
  const k = await fakeK8s(); t.after(() => k.server.close());
  const bad = createKubernetesExecutor({ apiServer: k.url, token: 'wrong', namespace: 'prod', deploymentFor: () => 'shop' });
  await assert.rejects(bad.execute({ service: 'shop', action: 'restart' }), /401/);
  const ex = createKubernetesExecutor({ apiServer: k.url, token: 'sa-token', namespace: 'prod', deploymentFor: () => 'shop' });
  await assert.rejects(ex.execute({ service: 'shop', action: 'scale', params: { replicas: '-5' } }), /Invalid replica/);
  await assert.rejects(ex.execute({ service: 'shop', action: 'delete' }), /does not support/);
});
test('inClusterConfig is null outside a cluster and reads the service account inside one', () => {
  assert.equal(inClusterConfig({}), null);
  const fsImpl = { readFileSync: (p) => (p.endsWith('token') ? 'abc\n' : p.endsWith('namespace') ? 'sentinel\n' : Buffer.from('ca')) };
  const c = inClusterConfig({ KUBERNETES_SERVICE_HOST: '10.0.0.1', KUBERNETES_SERVICE_PORT: '443' }, fsImpl);
  assert.equal(c.apiServer, 'https://10.0.0.1:443'); assert.equal(c.token, 'abc'); assert.equal(c.namespace, 'sentinel');
});
test('executor registry picks by platform and fails clearly', () => {
  const r = createExecutorRegistry([{ name: 'docker' }]);
  assert.equal(r.for('docker').name, 'docker');
  assert.throws(() => r.for('kubernetes'), /No executor/);
});
