import React from 'react';
import { PublicFooter, PublicHeader } from './PublicShell.jsx';

const PORTS = [
  ['Sentinel console', 'http://localhost:5173'],
  ['Sentinel API', 'http://localhost:4000'],
  ['Tilda storefront', 'http://localhost:5174'],
  ['Tilda API gateway', 'http://localhost:5000'],
  ['Prometheus', 'http://localhost:9090'],
  ['Grafana', 'http://localhost:3001'],
  ['Loki', 'http://localhost:3100'],
];

const ENV = [
  ['JWT_SECRET', 'Signs Sentinel sign-in tokens.'],
  ['FRONTEND_ORIGIN', 'Origin allowed by the Sentinel API (CORS).'],
  ['TILDA_JWT_SECRET', 'Signs Tilda sign-in tokens.'],
  ['MONGODB_URI', 'MongoDB connection string for Tilda.'],
  ['CLIENT_URL', 'Tilda storefront origin.'],
  ['ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD', 'The Tilda admin account created on first start.'],
  ['RECOVERY_TOKEN', 'Shared secret between the Sentinel API and the recovery controller.'],
  ['GRAFANA_ADMIN_USER, GRAFANA_ADMIN_PASSWORD', 'Grafana login.'],
];

export default function Docs({ signedIn }) {
  return (
    <div className="public-page">
      <PublicHeader signedIn={signedIn} />
      <main className="section">
        <div className="public-bar docs">
          <h1>Documentation</h1>
          <h2>Quick start</h2>
          <ol className="docs-list">
            <li>Install Docker Desktop and start it.</li>
            <li>Copy <code>.env.example</code> to <code>.env</code> and set every value, or run <code>scripts/setup-env.ps1</code> on Windows to generate secrets.</li>
            <li>Run <code>docker compose up --build</code> from the project folder.</li>
            <li>Open the Sentinel console, create an account, then open Microservices and register the Tilda Goods stack.</li>
          </ol>
          <h2>Local addresses</h2>
          <div className="docs-table">{PORTS.map(([name, url]) => <div key={name}><span>{name}</span><code>{url}</code></div>)}</div>
          <h2>Recovery workflow</h2>
          <p>When a service fails consecutive health checks, Sentinel opens an incident. An operator opens it and chooses <b>Approve restart</b>. The recovery controller restarts the container, and Sentinel resolves the incident only after the service passes consecutive checks. If the restart fails, the incident stays open and can be retried. Manual resolution is available and is recorded in the audit trail.</p>
          <h2>Environment variables</h2>
          <div className="docs-table">{ENV.map(([name, text]) => <div key={name}><code>{name}</code><span>{text}</span></div>)}</div>
          <h2>Testing the monitor</h2>
          <p>Stop a Tilda service with <code>docker compose stop products</code>. Within about fifteen seconds the Microservices page shows it as down and an incident opens.</p>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
