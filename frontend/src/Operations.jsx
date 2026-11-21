import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, Download, RefreshCw, ScrollText, Send } from 'lucide-react';
import { request } from './api.js';
import { EmptyState, Metric, PageHeading } from './ui.jsx';

const fmtMs = (v) => {
  if (v == null) return '—';
  if (v < 1000) return `${v} ms`;
  const s = Math.round(v / 1000);
  return s < 120 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
};

async function downloadCsv(path, token, filename) {
  const res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

function useLoad(loader, deps) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    loader().then((data) => setState({ data, error: '', loading: false })).catch((e) => setState({ data: null, error: e.message, loading: false }));
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);
  return { ...state, reload: load };
}

export function Analytics({ token, onToast }) {
  const [range, setRange] = useState({ from: '', to: '' });
  const { data, error, loading, reload } = useLoad(() => {
    const q = new URLSearchParams();
    if (range.from) q.set('from', new Date(range.from).toISOString());
    if (range.to) q.set('to', new Date(`${range.to}T23:59:59`).toISOString());
    return request(`/analytics?${q}`, {}, token);
  }, [range.from, range.to, token]);

  return (
    <>
      <PageHeading title="Analytics" description="Reliability measured from recorded incidents. Nothing here is estimated.">
        <button className="secondary-btn" onClick={() => downloadCsv('/analytics/incidents.csv', token, 'sentinel-incidents.csv').catch((e) => onToast(e.message))}><Download size={15} /> Export CSV</button>
        <button className="secondary-btn" onClick={reload}><RefreshCw size={15} /> Refresh</button>
      </PageHeading>
      <div className="toolbar">
        <label className="inline-field">From<input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
        <label className="inline-field">To<input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
        {(range.from || range.to) && <button className="text-btn" onClick={() => setRange({ from: '', to: '' })}>Clear dates</button>}
      </div>
      {error && <div className="error-box">{error}</div>}
      {loading && !data ? <div className="history-empty">Loading analytics…</div> : data && (data.incidents.total === 0 ? (
        <section className="panel"><EmptyState icon={BarChart3} title="No incidents in this range" text="Analytics appear once Sentinel has recorded incidents." /></section>
      ) : (
        <>
          <div className="metric-grid">
            <Metric label="Incidents" value={data.incidents.total} note={`${data.incidents.resolved} resolved · ${data.incidents.open} open · ${data.incidents.failed} failed`} />
            <Metric label="Mean time to detect" value={fmtMs(data.mttdMs)} note="Failure start to incident opened" />
            <Metric label="Mean time to recover" value={fmtMs(data.mttrMs)} note="Incident opened to resolved" />
            <Metric label="Recovery success rate" value={data.recovery.successRate == null ? '—' : `${data.recovery.successRate}%`} note={`${data.recovery.succeeded} of ${data.recovery.attempted} executed recoveries`} />
          </div>
          <section className="panel">
            <div className="panel-head"><h2>Top failing services</h2></div>
            <div className="scroll-x"><table className="data-table"><thead><tr><th>Service</th><th>Incidents</th></tr></thead>
              <tbody>{data.topFailingServices.map((s) => <tr key={s.service}><td>{s.service}</td><td>{s.count}</td></tr>)}</tbody></table></div>
          </section>
        </>
      ))}
    </>
  );
}

const MODES = [['manual', 'Manual approval'], ['auto', 'Auto-heal within policy'], ['monitor_only', 'Monitor only']];

export function RecoveryPolicy({ user, token, onToast }) {
  const owner = user.role === 'owner';
  const policy = useLoad(() => request('/pipeline/policy', {}, token), [token]);
  const status = useLoad(() => request('/pipeline/status', {}, token), [token]);
  const audit = useLoad(() => request('/audit', {}, token), [token]);
  const channels = useLoad(() => request('/notifications/channels', {}, token), [token]);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (policy.data) setDraft(JSON.parse(JSON.stringify(policy.data))); }, [policy.data]);

  const dirty = draft && policy.data && JSON.stringify(draft.services) !== JSON.stringify(policy.data.services);
  async function save() {
    setBusy(true);
    try {
      await request('/pipeline/policy', { method: 'PUT', body: JSON.stringify({ ...draft, version: policy.data.version + 1 }) }, token);
      onToast('Policy saved as a new version.');
      policy.reload(); status.reload(); audit.reload();
    } catch (e) { onToast(e.message); } finally { setBusy(false); }
  }
  async function testSend(name) {
    try { const r = await request('/notifications/test', { method: 'POST', body: JSON.stringify({ channel: name }) }, token); onToast(r.ok ? `Test sent to ${name}.` : `Test failed: ${r.error}`); channels.reload(); }
    catch (e) { onToast(e.message); }
  }

  return (
    <>
      <PageHeading title="Recovery policy" description="Rules that decide whether a recovery action may run, who must approve it, and how often. Every decision is logged with the rule that caused it." />
      {policy.error && <div className="error-box">{policy.error}</div>}
      {draft && (
        <section className="panel">
          <div className="panel-head">
            <div><h2>Policy “{draft.name}” · version {draft.version}</h2>
              <p>{status.data ? `Auto-heal is ${status.data.autoHeal ? 'enabled' : 'disabled'} globally (PIPELINE_AUTOHEAL). Environment: ${status.data.environment}.` : ''}</p></div>
            {owner && <button className="primary-btn" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Save new version'}</button>}
          </div>
          <div className="scroll-x"><table className="data-table">
            <thead><tr><th>Service</th><th>Criticality</th><th>Approval mode</th><th>Allowed actions</th></tr></thead>
            <tbody>{Object.entries(draft.services).map(([name, s]) => (
              <tr key={name}>
                <td>{name}</td><td>{s.criticality || draft.defaults.criticality}</td>
                <td>{owner
                  ? <select className="select" aria-label={`Approval mode for ${name}`} value={s.approvalMode || draft.defaults.approvalMode} onChange={(e) => setDraft({ ...draft, services: { ...draft.services, [name]: { ...s, approvalMode: e.target.value } } })}>{MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  : (MODES.find(([v]) => v === (s.approvalMode || draft.defaults.approvalMode)) || [])[1]}</td>
                <td>{(s.allowedActions || draft.defaults.allowedActions).join(', ')}</td>
              </tr>))}</tbody>
          </table></div>
          <p className="muted policy-limits">Limits: at most {draft.defaults.maxRestartsPerHour} restarts per service per hour, {draft.defaults.cooldownSeconds}s cooldown, {draft.limits?.maxConcurrentRecoveries ?? 2} concurrent recoveries. Critical services in production always need approval. Edit these in the policy file or through the API.</p>
          {!owner && <p className="muted">Only the workspace owner can change the policy.</p>}
        </section>
      )}

      <section className="panel">
        <div className="panel-head"><div><h2>Notification channels</h2><p>Configured on the server (NOTIFY_CHANNELS_FILE). Email is planned.</p></div></div>
        {!channels.data?.channels.length ? <EmptyState icon={Send} title="No channels configured" text="Add Slack or webhook channels in the notification channels file to receive incident alerts." />
          : <div className="scroll-x"><table className="data-table"><thead><tr><th>Name</th><th>Type</th><th>Minimum severity</th><th /></tr></thead>
            <tbody>{channels.data.channels.map((c) => <tr key={c.name}><td>{c.name}</td><td>{c.type}</td><td>{c.minSeverity || 'low'}</td><td>{owner && <button className="text-btn" onClick={() => testSend(c.name)}>Send test</button>}</td></tr>)}</tbody></table></div>}
        {channels.data?.deliveries.length > 0 && <>
          <h3 className="inc-h">Recent deliveries</h3>
          <div className="scroll-x"><table className="data-table"><thead><tr><th>Time</th><th>Channel</th><th>Event</th><th>Result</th></tr></thead>
            <tbody>{channels.data.deliveries.slice(0, 8).map((d, i) => <tr key={i}><td>{new Date(d.at).toLocaleString()}</td><td>{d.channel}</td><td>{d.event}</td><td>{d.ok ? 'Delivered' : `Failed: ${d.error}`}</td></tr>)}</tbody></table></div></>}
      </section>

      <section className="panel">
        <div className="panel-head"><div><h2>Audit log</h2><p>Detections, AI analyses, policy decisions, approvals and actions.</p></div>
          <button className="secondary-btn" onClick={() => downloadCsv('/audit?format=csv', token, 'sentinel-audit.csv').catch((e) => onToast(e.message))}><Download size={15} /> Export CSV</button></div>
        {!audit.data?.length ? <EmptyState icon={ScrollText} title="No audit entries yet" text="Entries appear as incidents are detected and handled." />
          : <div className="scroll-x"><table className="data-table"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Service</th><th>Rule</th></tr></thead>
            <tbody>{audit.data.slice(0, 50).map((a) => <tr key={a.id}><td>{new Date(a.at).toLocaleString()}</td><td>{a.actor}</td><td>{a.action.replace(/_/g, ' ')}</td><td>{a.service || '—'}</td><td>{a.rule || '—'}</td></tr>)}</tbody></table></div>}
      </section>
    </>
  );
}

// AI analysis and policy decision for one incident. Always labelled as a suggestion.
export function AiPanel({ incident }) {
  const a = incident.analysis;
  if (!a) return null;
  const r = a.analysis;
  const decision = incident.policyDecisions?.[incident.policyDecisions.length - 1];
  return (
    <section className="ai-card" aria-label="AI analysis">
      <div className="ai-head"><h3>AI analysis <span className="tag planned">Suggestion</span></h3><span className="muted">{a.mode === 'rules+llm' ? 'Rules + LLM' : a.mode === 'fallback' ? 'Fallback (AI engine unavailable)' : 'Rule-based'}</span></div>
      <p className="ai-cause">{r.rootCause}</p>
      <div className="conf" aria-label={`Confidence ${Math.round(r.confidence * 100)} percent`}><div className="conf-bar"><span style={{ width: `${Math.round(r.confidence * 100)}%` }} /></div><b>{Math.round(r.confidence * 100)}%</b><span className="muted">heuristic confidence</span></div>
      {r.narrative && <p className="muted">{r.narrative}</p>}
      {r.evidence?.length > 0 && <><h4>Evidence</h4><ul className="inc-list">{r.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul></>}
      <h4>Suggested actions</h4>
      <ol className="inc-list">{r.suggestions.map((s) => <li key={s.rank}><b>{s.action}</b> ({Math.round(s.confidence * 100)}%): {s.rationale}</li>)}</ol>
      {decision && <div className="info-box">Policy v{decision.policyVersion}: <b>{decision.decision.replace(/_/g, ' ')}</b> ({decision.rule}). {decision.reason}</div>}
      <p className="muted ai-label">{a.label}</p>
    </section>
  );
}
