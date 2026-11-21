'use strict';
// Notification channels: generic webhook and Slack incoming webhook. Email is Planned (needs an SMTP library).
// Destinations are checked against private/loopback addresses unless NOTIFY_ALLOW_PRIVATE=true.
const dns = require('dns').promises;
const net = require('net');

const SEVERITY_ORDER = { low: 0, medium: 1, high: 2, critical: 3 };

function isPrivateIp(ip) {
  if (net.isIPv6(ip)) return ip === '::1' || /^f[cd]/i.test(ip) || /^fe80/i.test(ip);
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

async function assertSafeUrl(raw, allowPrivate, lookup = dns.lookup) {
  let u; try { u = new URL(raw); } catch { throw new Error('Invalid URL.'); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('Only plain http(s) URLs without credentials are allowed.');
  if (allowPrivate) return u;
  const addrs = net.isIP(u.hostname) ? [{ address: u.hostname }] : await lookup(u.hostname, { all: true });
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error('Private and loopback destinations are blocked (set NOTIFY_ALLOW_PRIVATE=true to allow).');
  return u;
}

function createNotifier({ channels = [], fetchImpl = fetch, allowPrivate = false, lookup, timeoutMs = 8000, now = () => new Date().toISOString() }) {
  const deliveryLog = [];
  const record = (entry) => { deliveryLog.unshift({ at: now(), ...entry }); if (deliveryLog.length > 200) deliveryLog.pop(); };

  const payloadFor = (channel, event) => {
    const text = `[${String(event.severity || 'info').toUpperCase()}] ${event.title}: ${event.message}`;
    return channel.type === 'slack' ? { text } : { event: event.type, severity: event.severity, title: event.title, message: event.message, incidentId: event.incidentId, service: event.service, at: now() };
  };

  async function sendOne(channel, event) {
    try {
      const url = await assertSafeUrl(channel.url, allowPrivate, lookup);
      const res = await fetchImpl(url, { method: 'POST', signal: AbortSignal.timeout(timeoutMs), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadFor(channel, event)) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      record({ channel: channel.name, type: channel.type, event: event.type, ok: true });
      return { channel: channel.name, ok: true };
    } catch (e) {
      record({ channel: channel.name, type: channel.type, event: event.type, ok: false, error: e.message });
      return { channel: channel.name, ok: false, error: e.message };
    }
  }

  return {
    channels: () => channels.map(({ url, ...c }) => ({ ...c, url: url.replace(/(https?:\/\/[^/]+\/).*/, '$1…') })),
    deliveryLog: () => [...deliveryLog],
    async notify(event) {
      const sev = SEVERITY_ORDER[event.severity] ?? 1;
      const targets = channels.filter((c) => c.enabled !== false && sev >= (SEVERITY_ORDER[c.minSeverity] ?? 0) && (!c.events || c.events.includes(event.type)));
      return Promise.all(targets.map((c) => sendOne(c, event)));
    },
    testSend: (channel) => sendOne(channel, { type: 'test', severity: 'low', title: 'Sentinel test notification', message: 'If you can read this, the channel works.' })
  };
}
module.exports = { createNotifier, assertSafeUrl, isPrivateIp };
