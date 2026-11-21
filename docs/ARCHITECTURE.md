# Architecture (as implemented)

```mermaid
flowchart LR
  subgraph Detect
    HC[Health-check detector<br/>docker-monitor.js] --> INC
    PR[Prometheus rules] --> AM[Alertmanager] -->|POST /api/alerts/webhook| ING[ingestAlert] --> INC
  end
  INC[Incident<br/>docker incident store] --> AI[AI Engine<br/>Python, rules + optional LLM]
  AI --> POL[Policy Engine<br/>pipeline/policy.js]
  POL -->|allow + auto-heal| EXE
  POL -->|require approval| UI[Console: approve]
  UI --> EXE[Recovery via Recovery Controller<br/>Docker allowlist]
  EXE --> VER[Health verification<br/>consecutive checks]
  VER --> RES[Resolved / failed]
  INC & POL & EXE & RES --> AUD[Audit log] & NOT[Notifications]
```

- **Running Docker flow:** `backend/docker-monitor.js` detects, opens incidents, restarts through the Recovery Controller and verifies. `backend/pipeline/index.js` hooks in: it asks the AI engine, evaluates policy, records everything in the audit log, notifies, optionally auto-heals, and blocks approvals that the policy denies.
- **Generic pipeline modules** (`orchestrator.js`, `lifecycle.js`, `executors/`): a platform-neutral version of the same loop with the six-state incident lifecycle, retries within policy and a Kubernetes executor. It is tested end to end but **not yet mounted on the HTTP server**; moving the Docker flow onto it is the main remaining integration step.
- **Recovery Controller:** the only process with the Docker socket; allowlisted stop/start/restart/logs.
- **Observability:** Prometheus (alert rules), Alertmanager, Loki, Promtail, Grafana.
- **Planned, not implemented:** MySQL persistence, Kubernetes onboarding agent, dependency map, OpenAPI spec, email notifications.
