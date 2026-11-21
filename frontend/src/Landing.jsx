import React from 'react';
import { ArrowRight } from 'lucide-react';
import { PublicFooter, PublicHeader } from './PublicShell.jsx';
import { go } from './nav.js';

const FEATURES = [
  { name: 'Microservices monitoring', text: 'Registered Docker services are probed over the internal network. Each has its own status, uptime and failure count.', status: 'Available' },
  { name: 'Real-time health tracking', text: 'Health checks run every few seconds. The dashboard refreshes automatically and keeps response-time history.', status: 'Available' },
  { name: 'Incident detection and management', text: 'A service that fails consecutive checks opens an incident with its failure reason, customer impact and a timeline.', status: 'Available' },
  { name: 'Automated recovery', text: 'An operator approves a restart. Sentinel restarts the container through the recovery controller and resolves the incident only after health checks pass.', status: 'Available, operator-approved' },
  { name: 'Logs and metrics monitoring', text: 'Read recent container logs in the console, search Loki, and scrape Sentinel metrics with Prometheus and Grafana.', status: 'Available' },
  { name: 'Reliability analytics', text: 'Uptime percentage and response-time charts for each application and service. Longer-term reporting is not built yet.', status: 'Basic' },
  { name: 'AI-assisted root cause analysis', text: 'Automated diagnosis of why a service failed.', status: 'Planned' },
  { name: 'Service dependency visualization', text: 'A map of which services call which.', status: 'Planned' },
];

const STEPS = [
  ['Connect and monitor', 'Add a public URL, or register a Docker stack in the service registry. Checks start right away.'],
  ['Detect failures', 'Consecutive failed checks mark a service as down and open an incident automatically.'],
  ['Investigate', 'Open the incident to see the failure reason, impact, health-check history, logs and timeline.'],
  ['Recover and verify', 'Approve a restart. The incident closes once the service passes consecutive health checks.'],
];

const PREVIEW = [
  ['API Gateway', 'tilda-gateway', 'healthy', '12 ms', '100%'],
  ['Authentication Service', 'tilda-auth', 'healthy', '9 ms', '100%'],
  ['Product Service', 'tilda-products', 'unhealthy', '—', '97.8%'],
  ['Order Service', 'tilda-orders', 'healthy', '14 ms', '100%'],
  ['Media Service', 'tilda-media', 'healthy', '11 ms', '99.9%'],
];

function Architecture() {
  const box = (x, y, w, title, sub) => (
    <g>
      <rect className="arch-node" x={x} y={y} width={w} height="52" rx="6" />
      <text className="arch-title" x={x + w / 2} y={y + 22} textAnchor="middle">{title}</text>
      <text className="arch-sub" x={x + w / 2} y={y + 40} textAnchor="middle">{sub}</text>
    </g>
  );
  const line = (d) => <path className="arch-edge" d={d} markerEnd="url(#arrow)" />;
  return (
    <svg className="arch-svg" viewBox="0 0 920 430" role="img" aria-label="Sentinel architecture diagram">
      <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" className="arch-arrow" /></marker></defs>
      {box(20, 40, 170, 'Sentinel console', 'React UI, port 5173')}
      {box(250, 40, 190, 'Sentinel API', 'Express, port 4000')}
      {box(250, 150, 190, 'Docker monitor', 'Health checks, incidents')}
      {box(250, 260, 190, 'Recovery controller', 'Restarts via Docker socket')}
      {box(500, 20, 190, 'API Gateway', 'Tilda entry point')}
      {box(500, 90, 90, 'Auth', 'service')}
      {box(600, 90, 90, 'Products', 'service')}
      {box(500, 160, 90, 'Orders', 'service')}
      {box(600, 160, 90, 'Media', 'service')}
      {box(500, 230, 190, 'MongoDB', 'Tilda data store')}
      {box(500, 340, 190, 'Prometheus', 'Scrapes /metrics')}
      {box(730, 340, 170, 'Grafana', 'Dashboards')}
      {box(730, 250, 170, 'Loki', 'Logs via Promtail')}
      {box(20, 150, 170, 'Operator', 'Approves restarts')}
      {line('M190 66 H250')}
      {line('M345 92 V150')}
      {line('M440 176 C470 176 470 60 500 60')}
      {line('M345 202 V260')}
      {line('M440 286 H470 C480 286 480 200 500 190')}
      {line('M105 150 V92')}
      {line('M345 92 C345 330 420 366 500 366')}
      {line('M690 366 H730')}
      {line('M815 340 V302')}
    </svg>
  );
}

export default function Landing({ signedIn }) {
  return (
    <div className="public-page">
      <PublicHeader signedIn={signedIn} />
      <main>
        <section className="hero">
          <div className="public-bar hero-grid">
            <div className="hero-text">
              <h1>Reliable microservices. Smarter operations.</h1>
              <p>Monitor your distributed applications, detect service failures, investigate incidents, and automate recovery through one unified reliability platform.</p>
              <div className="hero-actions">
                <button className="primary-btn large" onClick={() => go(signedIn ? '/app/dashboard' : '/signup')}>Get started <ArrowRight size={16} /></button>
                <button className="secondary-btn large" onClick={() => document.getElementById('platform')?.scrollIntoView({ behavior: 'smooth' })}>Explore the platform</button>
              </div>
            </div>
            <div className="preview" aria-label="Example of the Microservices view">
              <div className="preview-bar"><span /><span /><span /><b>Microservices</b></div>
              <div className="preview-body">
                <div className="preview-summary"><div><b>4</b><span>Healthy</span></div><div><b>1</b><span>Down</span></div><div><b>1</b><span>Open incident</span></div></div>
                {PREVIEW.map(([name, container, status, ms, uptime]) => (
                  <div className="preview-row" key={name}>
                    <div><b>{name}</b><span>{container}</span></div>
                    <span className={`status status-${status}`}><span className="status-dot" />{status === 'healthy' ? 'Healthy' : 'Down'}</span>
                    <span className="muted">{ms}</span><span className="muted">{uptime}</span>
                  </div>
                ))}
              </div>
              <p className="preview-note">Example data for illustration</p>
            </div>
          </div>
        </section>

        <section className="section" id="platform">
          <div className="public-bar split">
            <div>
              <h2>One place to see what is running and what is broken</h2>
            </div>
            <div className="prose">
              <p>Distributed applications fail in pieces. When a gateway, an auth service or a database-backed API goes down, teams lose time working out which service failed, who is affected and how to bring it back.</p>
              <p>Sentinel keeps a live view of every registered service, opens an incident the moment one stops responding, and gives the on-call engineer the evidence to act: health-check history, logs and a recovery workflow that verifies the fix.</p>
            </div>
          </div>
        </section>

        <section className="section alt" id="features">
          <div className="public-bar">
            <h2>Features</h2>
            <p className="lede">What Sentinel does today, and what is still on the roadmap.</p>
            <div className="feature-grid">
              {FEATURES.map((f) => (
                <article key={f.name} className="feature">
                  <div className="feature-head"><h3>{f.name}</h3><span className={`tag ${f.status === 'Planned' ? 'planned' : ''}`}>{f.status}</span></div>
                  <p>{f.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="how-it-works">
          <div className="public-bar">
            <h2>How it works</h2>
            <ol className="steps">
              {STEPS.map(([title, text], i) => <li key={title}><span className="step-n">{i + 1}</span><h3>{title}</h3><p>{text}</p></li>)}
            </ol>
          </div>
        </section>

        <section className="section alt" id="architecture">
          <div className="public-bar">
            <h2>Architecture</h2>
            <p className="lede">Sentinel monitors the Tilda Goods stack, which ships with the project as a working set of microservices.</p>
            <div className="arch-wrap"><Architecture /></div>
            <p className="muted">The Sentinel API checks each service over the internal Docker network. Only the recovery controller can touch the Docker socket, and it acts on approved requests only.</p>
          </div>
        </section>

        <section className="section cta">
          <div className="public-bar cta-inner">
            <h2>Start monitoring your services</h2>
            <p>Create a workspace, register the Tilda Goods stack and watch the first health checks arrive.</p>
            <div className="hero-actions">
              <button className="primary-btn large" onClick={() => go(signedIn ? '/app/dashboard' : '/signup')}>Get started</button>
              <button className="secondary-btn large" onClick={() => go('/docs')}>Read the documentation</button>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
