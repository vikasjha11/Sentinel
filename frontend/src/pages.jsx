import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Eye, Moon, Pencil, Plus, RefreshCw, Search, Sun, Trash2 } from 'lucide-react';
import { fmtDate, request } from './api.js';
import { SourceBadge } from './Services.jsx';
import { AllClear, EmptyState, Metric, PageHeading, Status } from './ui.jsx';

const canCheck = (project) => ['url', 'docker'].includes(project.connectionType);
const projectStatus = (project) => (project.connectionType === 'agent' ? 'awaiting_agent' : project.lastCheck?.status || 'pending');
const connectionLabel = { docker: 'Docker services', url: 'Public URL', agent: 'Local or agent' };

function IncidentRow({ incident: i, onOpen, onRecover, onResolve }) {
  const docker = i.source === 'docker';
  const state = i.recovery?.state;
  const canApprove = docker && i.status === 'open' && (!state || ['none', 'cancelled', 'failed'].includes(state));
  const verifying = docker && i.status === 'open' && ['requested', 'restarting', 'verifying'].includes(state);
  return (
    <div className="incident-row">
      <div className="incident-copy">
        <b><button type="button" className="inc-title-btn" onClick={onOpen}>{i.title}</button> <SourceBadge source={i.source} /></b>
        <span>{i.projectName}{docker && i.containerName ? ` / ${i.containerName}` : ''} · {fmtDate(i.createdAt)}{docker && i.severity ? ` · ${i.severity} severity` : ''}</span>
        <p>{i.description}</p>
        {docker && i.failureReason && <p className="inc-reason">Reason: {i.failureReason}</p>}
      </div>
      <div className="incident-end">
        <Status status={i.status} />
        {verifying && <span className="inc-verifying"><RefreshCw size={11} className="spin" /> Verifying recovery</span>}
        {canApprove && <button className="primary-btn mini-btn" onClick={onRecover}>{state === 'failed' ? 'Retry recovery' : 'Approve restart'}</button>}
        <button className="text-btn" onClick={onOpen}>Details</button>
        {i.status === 'open' && !docker && <button className="text-btn" onClick={onResolve}>Resolve</button>}
      </div>
    </div>
  );
}

export function Dashboard({ user, overview, projects, incidents, services, onNavigate, onAdd, onOpenIncident, onRecover, onResolve }) {
  const open = incidents.filter((i) => i.status === 'open');
  const down = services.filter((s) => s.status === 'DOWN').length;
  const attention = (overview.degraded || 0) + (overview.unhealthy || 0);
  return (
    <>
      <PageHeading title={`Welcome back, ${user.name.split(' ')[0]}`} description="The current state of your applications and microservices.">
        <button className="primary-btn" onClick={onAdd}><Plus size={16} /> Add application</button>
      </PageHeading>
      <div className="metric-grid">
        <Metric label="Applications" value={overview.totalProjects || 0} note="Registered in this workspace" />
        <Metric label="Healthy" value={overview.healthy || 0} note="Responding normally" />
        <Metric label="Needs attention" value={attention} note="Degraded or unreachable" />
        <Metric label="Open incidents" value={overview.openIncidents || 0} note={down ? `${down} microservice${down > 1 ? 's' : ''} down` : 'No services down'} />
      </div>
      <div className="two-col">
        <section className="panel">
          <div className="panel-head"><div><h2>Microservices</h2><p>Live status of registered Docker services.</p></div><button className="text-btn" onClick={() => onNavigate('microservices')}>View all</button></div>
          {services.length === 0
            ? <EmptyState icon={AlertTriangle} title="No microservices registered" text="Register the Tilda Goods stack from the Microservices page to start monitoring." />
            : <div className="simple-list">{services.slice(0, 6).map((s) => (
              <div className="simple-row" key={s.id}>
                <div><b>{s.name}</b><span>{s.containerName}</span></div>
                <span className="muted">{s.responseTimeMs != null ? `${s.responseTimeMs} ms` : '—'}</span>
                <Status status={s.status === 'DOWN' ? 'unhealthy' : s.status === 'HEALTHY' ? 'healthy' : s.status === 'DEGRADED' ? 'degraded' : 'pending'} />
              </div>
            ))}</div>}
        </section>
        <section className="panel">
          <div className="panel-head"><div><h2>Open incidents</h2><p>Issues that need attention.</p></div><button className="text-btn" onClick={() => onNavigate('incidents')}>View all</button></div>
          {open.length === 0
            ? <AllClear title="No open incidents" text="Incidents appear here when a monitored endpoint fails." />
            : <div className="incident-list">{open.slice(0, 4).map((i) => <IncidentRow key={i.id} incident={i} onOpen={() => onOpenIncident(i.id)} onRecover={() => onRecover(i)} onResolve={() => onResolve(i)} />)}</div>}
        </section>
      </div>
      <section className="panel">
        <div className="panel-head"><div><h2>Applications</h2><p>{projects.length} registered</p></div><button className="text-btn" onClick={() => onNavigate('applications')}>Manage</button></div>
        {projects.length === 0
          ? <EmptyState title="No applications yet" text="Add a public URL or register the Docker stack to begin monitoring." action={<button className="primary-btn" onClick={onAdd}><Plus size={16} /> Add application</button>} />
          : <div className="simple-list">{projects.slice(0, 5).map((p) => (
            <div className="simple-row" key={p.id}>
              <div><b>{p.name}</b><span>{p.connectionType === 'docker' ? 'Docker microservices' : p.targetUrl || 'Local or agent'}</span></div>
              <span className="muted">{p.lastCheck?.latencyMs != null ? `${p.lastCheck.latencyMs} ms` : '—'}</span>
              <Status status={projectStatus(p)} />
            </div>
          ))}</div>}
      </section>
    </>
  );
}

export function Applications({ projects, canDelete, onAdd, onEdit, onOpen, onCheck, onDelete, onRefresh }) {
  const [query, setQuery] = useState('');
  const shown = useMemo(
    () => projects.filter((p) => `${p.name} ${p.description} ${p.targetUrl}`.toLowerCase().includes(query.toLowerCase())),
    [projects, query],
  );
  return (
    <>
      <PageHeading title="Applications" description="Every application connected to this workspace.">
        <button className="primary-btn" onClick={onAdd}><Plus size={16} /> Add application</button>
      </PageHeading>
      <div className="toolbar">
        <label className="search-box"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search applications" aria-label="Search applications" /></label>
        <button className="secondary-btn" onClick={onRefresh}><RefreshCw size={15} /> Refresh</button>
      </div>
      <section className="panel table-panel">
        {shown.length === 0
          ? <EmptyState title={projects.length ? 'No matching applications' : 'No applications yet'} text={projects.length ? 'Try a different search term.' : 'Add your first application to start checking availability and response time.'} action={!projects.length && <button className="primary-btn" onClick={onAdd}><Plus size={16} /> Add application</button>} />
          : (
            <div className="project-table">
              <div className="table-head"><span>Application</span><span>Connection</span><span>Status</span><span>Last check</span><span>Actions</span></div>
              {shown.map((p) => (
                <div className="table-row" key={p.id}>
                  <div className="table-project"><b>{p.name}</b><span>{p.description || p.targetUrl || 'No description'}</span></div>
                  <div><span className="connection-pill">{connectionLabel[p.connectionType]}</span></div>
                  <div><Status status={projectStatus(p)} /></div>
                  <div className="last-check">{fmtDate(p.lastCheck?.checkedAt)}{p.lastCheck?.latencyMs != null && <span>{p.lastCheck.latencyMs} ms</span>}</div>
                  <div className="table-actions">
                    {p.connectionType === 'docker' && <button className="icon-btn" title="Open overview" aria-label={`Open ${p.name}`} onClick={() => onOpen(p)}><Eye size={16} /></button>}
                    <button className="icon-btn" title="Edit" aria-label={`Edit ${p.name}`} onClick={() => onEdit(p)}><Pencil size={16} /></button>
                    <button className="icon-btn" title="Run check" aria-label={`Run check for ${p.name}`} onClick={() => onCheck(p)} disabled={!canCheck(p)}><RefreshCw size={16} /></button>
                    {canDelete && <button className="icon-btn danger-hover" title="Remove" aria-label={`Remove ${p.name}`} onClick={() => onDelete(p)}><Trash2 size={16} /></button>}
                  </div>
                </div>
              ))}
            </div>
          )}
      </section>
    </>
  );
}

export function Health({ projects, token, onCheck, refreshKey }) {
  const [selectedId, setSelectedId] = useState('');
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [range, setRange] = useState('all');

  useEffect(() => {
    if (!projects.some((p) => p.id === selectedId)) setSelectedId(projects[0]?.id || '');
  }, [projects, selectedId]);

  useEffect(() => {
    if (!selectedId) { setChecks([]); return undefined; }
    let cancelled = false;
    const load = () => request(`/projects/${selectedId}/checks`, {}, token)
      .then((data) => { if (!cancelled) { setChecks(data); setError(''); } })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    setLoading(true);
    load();
    const timer = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [selectedId, token, refreshKey]);

  const project = projects.find((p) => p.id === selectedId);
  const visible = useMemo(() => {
    const days = { '24h': 1, '7d': 7 }[range];
    return days ? checks.filter((c) => Date.now() - new Date(c.checkedAt).getTime() <= days * 86400000) : checks;
  }, [checks, range]);
  const healthy = visible.filter((c) => c.status === 'healthy').length;
  const uptime = visible.length ? Math.round((healthy / visible.length) * 1000) / 10 : null;
  const timed = visible.filter((c) => Number.isFinite(c.latencyMs)).slice().reverse();
  const avg = timed.length ? Math.round(timed.reduce((sum, c) => sum + c.latencyMs, 0) / timed.length) : null;
  const max = Math.max(1, ...timed.map((c) => c.latencyMs));
  const points = timed.map((c, i) => ({ ...c, x: timed.length < 2 ? 50 : 8 + (i / (timed.length - 1)) * 84, y: 92 - (c.latencyMs / max) * 72 }));

  return (
    <>
      <PageHeading title="Service health" description="Health-check results, response times and uptime for each application.">
        <select className="project-select" aria-label="Application" value={selectedId} onChange={(e) => setSelectedId(e.target.value)} disabled={!projects.length}>
          {!projects.length && <option value="">No applications</option>}
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="secondary-btn" disabled={!project || !canCheck(project)} onClick={() => onCheck(project)}><RefreshCw size={15} /> Run check</button>
      </PageHeading>
      {!projects.length ? <section className="panel"><EmptyState title="Nothing to monitor yet" text="Add an application to start collecting health-check history." /></section>
        : project?.connectionType === 'agent' ? <section className="panel"><EmptyState title="Agent connection required" text="Live checks appear once this application's agent is connected." /></section>
          : (
            <>
              <div className="metric-grid">
                <Metric label="Success rate" value={uptime === null ? '—' : `${uptime}%`} note={`${healthy} of ${visible.length} checks passed`} />
                <Metric label="Average response" value={avg === null ? '—' : `${avg} ms`} note="Across recorded checks" />
                <Metric label="Latest response" value={visible[0]?.latencyMs != null ? `${visible[0].latencyMs} ms` : '—'} note={visible[0] ? fmtDate(visible[0].checkedAt) : 'No checks yet'} />
                <Metric label="Checks recorded" value={visible.length} note="In the selected range" />
              </div>
              <section className="panel">
                <div className="panel-head">
                  <div><h2>Response time</h2><p>Milliseconds per check.</p></div>
                  <select className="range-select" aria-label="Time range" value={range} onChange={(e) => setRange(e.target.value)}>
                    <option value="all">Last 50 checks</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option>
                  </select>
                </div>
                {error && <div className="error-box" role="alert"><AlertTriangle size={15} />{error}</div>}
                {loading && !checks.length ? <div className="history-empty">Loading history…</div>
                  : !points.length ? <div className="history-empty"><b>Waiting for data</b><span>Run a check or wait for the next scheduled one.</span></div>
                    : (
                      <div className="latency-chart">
                        <div className="chart-y-labels"><span>{max} ms</span><span>{Math.round(max / 2)} ms</span><span>0 ms</span></div>
                        <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Response time chart">
                          <line x1="5" y1="20" x2="95" y2="20" /><line x1="5" y1="56" x2="95" y2="56" /><line x1="5" y1="92" x2="95" y2="92" />
                          {points.length > 1 && <polyline className="chart-line" points={points.map((p) => `${p.x},${p.y}`).join(' ')} />}
                          {points.map((p, i) => <circle key={p.id || i} cx={p.x} cy={p.y} r="1.25" className={`chart-point ${p.status}`} />)}
                        </svg>
                        <div className="chart-x-labels"><span>{fmtDate(timed[0]?.checkedAt)}</span><span>{fmtDate(timed[timed.length - 1]?.checkedAt)}</span></div>
                      </div>
                    )}
              </section>
              <section className="panel table-panel">
                <div className="panel-head"><div><h2>Recent checks</h2><p>Most recent first.</p></div></div>
                {visible.length === 0 ? <div className="history-empty short">No checks in this range.</div> : (
                  <div className="history-table">
                    <div className="history-table-head"><span>Checked at</span><span>Status</span><span>HTTP</span><span>Response</span><span>Details</span></div>
                    {visible.map((c) => (
                      <div className="history-table-row" key={c.id}>
                        <span>{fmtDate(c.checkedAt)}</span><span><Status status={c.status} /></span><span>{c.httpStatus ?? '—'}</span>
                        <span>{c.latencyMs != null ? `${c.latencyMs} ms` : '—'}</span><span className="history-message">{c.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
    </>
  );
}

export function Incidents({ incidents, onOpen, onRecover, onResolve, onRefresh }) {
  const [filter, setFilter] = useState('all');
  const shown = incidents.filter((i) => filter === 'all' || i.status === filter);
  return (
    <>
      <PageHeading title="Incidents" description="Public URL and Docker microservice incidents. Open one to follow detection, recovery and verification.">
        <button className="secondary-btn" onClick={onRefresh}><RefreshCw size={15} /> Refresh</button>
      </PageHeading>
      <div className="tabs" role="tablist">
        {[['all', 'All'], ['open', 'Open'], ['resolved', 'Resolved']].map(([key, label]) => (
          <button key={key} role="tab" aria-selected={filter === key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>
        ))}
      </div>
      <section className="panel">
        {shown.length === 0
          ? <AllClear title={incidents.length ? 'No incidents in this view' : 'No incidents detected'} text="When a monitored endpoint becomes degraded or unreachable, it is recorded here." />
          : <div className="incident-list large">{shown.map((i) => <IncidentRow key={i.id} incident={i} onOpen={() => onOpen(i.id)} onRecover={() => onRecover(i)} onResolve={() => onResolve(i)} />)}</div>}
      </section>
    </>
  );
}

export function Settings({ user, theme, onToggleTheme, token, onToast }) {
  const owner = user.role === 'owner';
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (owner) request('/workspace/members', {}, token).then(setMembers).catch((e) => onToast(e.message));
  }, [owner, token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addMember(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await request('/workspace/members', { method: 'POST', body: JSON.stringify(form) }, token);
      setMembers((current) => [...current, result.user]);
      setForm({ name: '', email: '', password: '' });
      onToast('Member added. Share the temporary password through a secure channel.');
    } catch (error) {
      onToast(error.message);
    } finally {
      setBusy(false);
    }
  }

  const field = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const capability = [
    ['Public URL health checks', 'healthy'],
    ['Docker microservice monitoring', 'healthy'],
    ['Operator-approved restart with health verification', 'healthy'],
    ['Container logs and Loki log search', 'healthy'],
    ['Kubernetes agent', 'awaiting_agent'],
    ['AI root-cause analysis', 'awaiting_agent'],
  ];

  return (
    <>
      <PageHeading title="Settings" description="Your profile, appearance and workspace access." />
      <section className="panel settings-panel">
        <div className="settings-section">
          <h2>Profile</h2>
          {[['Name', user.name], ['Email', user.email], ['Role', owner ? 'Owner' : 'Member'], ['Workspace ID', user.workspaceId]].map(([k, v]) => (
            <div className="setting-line" key={k}><span>{k}</span><b>{v}</b></div>
          ))}
        </div>
        <div className="settings-section">
          <h2>Appearance</h2>
          <div className="setting-line">
            <span>{theme === 'dark' ? 'Dark theme' : 'Light theme'}</span>
            <button className="secondary-btn compact-btn" onClick={onToggleTheme}>{theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />} Switch to {theme === 'dark' ? 'light' : 'dark'}</button>
          </div>
        </div>
        {owner && (
          <div className="settings-section">
            <h2>Workspace access</h2>
            <p className="muted">Members can view and operate the workspace. They cannot remove applications or manage access.</p>
            {members.map((m) => <div className="setting-line" key={m.id}><span>{m.name} ({m.email})</span><b>{m.role === 'owner' ? 'Owner' : 'Member'}</b></div>)}
            <form className="member-form" onSubmit={addMember}>
              <label>Full name<input value={form.name} onChange={field('name')} minLength={2} maxLength={80} required /></label>
              <label>Email<input type="email" value={form.email} onChange={field('email')} required /></label>
              <label>Temporary password<input type="password" value={form.password} onChange={field('password')} minLength={10} maxLength={128} required /><small>At least 10 characters.</small></label>
              <button className="primary-btn" disabled={busy}>{busy ? 'Adding…' : 'Add member'}</button>
            </form>
          </div>
        )}
        <div className="settings-section">
          <h2>Platform capabilities</h2>
          {capability.map(([label, status]) => <div className="setting-line" key={label}><span>{label}</span><Status status={status === 'healthy' ? 'healthy' : 'planned'} /></div>)}
          <p className="muted">Items marked Planned are not available yet.</p>
        </div>
      </section>
    </>
  );
}
