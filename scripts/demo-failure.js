'use strict';
// One-command failure-injection demo against a running stack:
//   node scripts/demo-failure.js [service]        (default service: products)
// It signs in (or registers the demo user), stops the service's container, then prints a timestamped trace of the
// pipeline as Sentinel reports it: detect -> incident -> AI analysis -> policy decision -> recovery -> verified.
// Needs Docker Compose, the stack from docker-compose.yml and SENTINEL_URL (default http://localhost:4000).
const { execFileSync } = require('node:child_process');

const BASE = process.env.SENTINEL_URL || 'http://localhost:4000';
const SERVICE = process.argv[2] || 'products';
const EMAIL = process.env.DEMO_EMAIL || 'demo@sentinel.local';
const PASSWORD = process.env.DEMO_PASSWORD;
if (!PASSWORD || PASSWORD.length < 10) { process.stderr.write('Set DEMO_PASSWORD (10+ characters) to create or sign in the demo user.\n'); process.exit(1); }

const t0 = Date.now();
const stamp = (msg) => process.stdout.write(`+${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s  ${msg}\n`);
const api = async (path, opts = {}, token) => {
  const r = await fetch(`${BASE}/api${path}`, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${body.error || r.status}`);
  return body;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let session;
  try { session = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) }); }
  catch { session = await api('/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Demo User', email: EMAIL, password: PASSWORD }) }); }
  const token = session.token;
  const known = new Set((await api('/incidents', {}, token)).map((i) => i.id));
  stamp(`Stopping container for "${SERVICE}"`);
  execFileSync('docker', ['compose', 'stop', SERVICE], { stdio: 'ignore' });
  stamp('Failure injected. Waiting for Sentinel to detect it...');

  const seen = new Set(); let incidentId = null;
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    const list = await api('/incidents', {}, token);
    const inc = list.find((i) => !known.has(i.id) && i.serviceKey === SERVICE) || list.find((i) => i.id === incidentId);
    if (inc) {
      incidentId = inc.id;
      const full = (await api(`/incidents/${inc.id}`, {}, token)).incident;
      const events = [['incident opened', true], ['AI analysis', !!full.analysis], ['policy decision', !!full.policyDecisions?.length], ['recovery requested', full.recovery?.attempts > 0], ['resolved', full.status === 'resolved']];
      for (const [name, done] of events) if (done && !seen.has(name)) {
        seen.add(name);
        const extra = name === 'AI analysis' ? ` - ${full.analysis.analysis.rootCause} (${Math.round(full.analysis.analysis.confidence * 100)}%)` : name === 'policy decision' ? ` - ${full.policyDecisions.at(-1).decision} (${full.policyDecisions.at(-1).rule})` : name === 'resolved' ? ` - ${full.resolutionType}` : '';
        stamp(`${name}${extra}`);
      }
      if (full.status === 'resolved') return stamp('Done.');
      if (seen.has('policy decision') && !seen.has('recovery requested') && !seen.has('prompted')) { seen.add('prompted'); stamp('Waiting for approval: open the incident in the console and choose "Approve restart" (or set PIPELINE_AUTOHEAL=true and an auto policy for this service).'); }
    }
    await sleep(1000);
  }
  stamp('Timed out after 5 minutes. Check the console and docker compose ps.');
})().catch((e) => { process.stderr.write(`${e.message}\n`); process.exit(1); });
