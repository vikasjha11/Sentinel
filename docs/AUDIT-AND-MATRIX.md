# Audit report and proposal-vs-implementation matrix

Scope: the uploaded `Sentinel-Tilda-Final-Redesigned.zip`, compared against the approved proposal pipeline. Statuses:
**Implemented** (code exists, wired, tested as stated), **Partial**, **Missing**, **Different** (works, but not as the proposal says).

## What the repository contained before this work
- `backend/` (Express, `data.json` persistence), `docker-monitor.js` (health checks, incidents, approval-gated restart, verification), `recovery-controller/` (the only component with the Docker socket, allowlisted), Prometheus/Loki/Grafana/Promtail, the Tilda Goods storefront stack (gateway, auth, products, orders, media, MongoDB), two React frontends.
- `services/` held an earlier prototype (api-gateway, incident-manager, ai-engine, policy-engine, Kubernetes manifests). It is **not** in `docker-compose.yml` and was never wired into the working flow. `sentinel-console/` is an older standalone console still referenced by `services/api-gateway`.

## Findings from the audit
| # | Finding | Severity | Status after this work |
|---|---|---|---|
| 1 | AI Engine and Policy Engine existed only in the unwired prototype, so recovery never used them | High (proposal gap) | Fixed: both rebuilt and wired into the running incident flow |
| 2 | Recovery was Docker-only; no Kubernetes execution | High (proposal gap) | Partly fixed: executor, RBAC and tests exist; not connected to an onboarding flow (see matrix) |
| 3 | Persistence is a JSON file, not MySQL | High (proposal gap) | **Not fixed** |
| 4 | An operator approval could not be blocked by any rule (no restart budget or cooldown) | Medium | Fixed: policy hard-denials also bind people |
| 5 | Session tokens last 8 hours, no refresh token, no API tokens, only owner/member roles | Medium | Not fixed |
| 6 | No CSV/audit export, no analytics | Low | Fixed |
| 7 | No CI | Low | Workflow added (not yet run on GitHub) |
| 8 | A bug found while testing the new code: the redaction helper leaked `Bearer` tokens; the first orchestrator version restarted a service even when the AI said "investigate"; the pipeline sent no `service` field to the AI engine. | Medium | All fixed, each now covered by a test |

Not audited in depth: the storefront services' internals beyond their existing tests; performance under load (no load test was run).

## Matrix
| Proposal item | Status | Evidence / gap |
|---|---|---|
| Prometheus detects abnormal metrics | Partial | Alert rules (service down, error rate, latency, restarts), Alertmanager config and a webhook endpoint exist. YAML is valid; never run with `promtool` or Docker here |
| Health-check detector (second signal) | Implemented | Existing `docker-monitor.js`; an alert joins the open incident instead of duplicating it (tested) |
| Incident Manager lifecycle, dedupe, timeline, audit | Partial | Lifecycle state machine, dedupe, runbook notes and audit log are implemented and tested. The running Docker flow keeps its original status/phase model; the generic orchestrator that uses the six lifecycle states is tested but not mounted on the HTTP server |
| AI Engine (root cause, confidence, evidence, ranked suggestions) | Implemented | Rules plus latency statistics; optional LLM by env var with fallback to rules; always labelled a suggestion. LLM path tested only against a local fake server |
| Policy Engine (declarative, versioned, logged) | Implemented | Validated policy file, 11 rules, per-service approval modes, editor in the UI. Business-hours window supported in the file, not editable in the UI |
| Execution via Kubernetes | Partial | REST executor (restart, scale, rollback, server-side dry run) with RBAC manifest; tested against a fake API server only, never on a cluster |
| Execution via Docker Compose | Implemented | Existing recovery controller; common executor interface added |
| Verification, retry, escalation | Partial | Docker flow verifies by consecutive checks with a watchdog (existing). Retry-within-policy and escalation notifications exist in the orchestrator (tested), not in the Docker HTTP flow |
| Dashboard: health, incidents, recovery | Implemented | Existing screens plus AI panel, Recovery policy, Analytics |
| MySQL with migrations and seed | **Missing** | Still `data.json` |
| One command starts everything (Compose) | Partial | `ai-engine` and `alertmanager` added to Compose; `docker compose config` was not runnable here |
| Kubernetes manifests / Helm | Partial | RBAC manifest added; no Helm chart |
| Onboarding: Kubernetes agent, labels-based Docker registry, config schema | **Missing** | Services still come from the server-side registry file |
| Workspaces, roles (owner/admin/operator/viewer), API tokens with scopes, refresh tokens, rate limiting | Partial | Workspaces, owner/member roles, auth rate limiting exist; the rest is missing |
| Audit log with export | Implemented | `/api/audit` and CSV export |
| Notifications: email, Slack, webhook, routing, test send, delivery log | Partial | Slack and webhook, severity/event routing, delivery log, test send. No email; channels are configured in a file, not in the UI |
| Grafana as code, Sentinel `/metrics`, JSON logs, log viewer | Implemented | Pre-existing |
| Reliability analytics with CSV | Implemented | Uptime per service pre-existing; MTTD, MTTR, recovery success, top failing services, date filter and CSV added |
| Dependency map from real configuration | **Missing** | Marked Planned |
| Approval modes per service | Implemented | Manual, auto-heal, monitor-only |
| Sentinel self-reliability: health endpoint, graceful shutdown, backups doc, upgrade path | Partial | Health endpoint and env configuration exist; no backup/restore or upgrade documentation |
| OpenAPI spec and API docs page | **Missing** | |
| Failure-injection demo | Partial | `scripts/demo-failure.js` (syntax-checked, not run), presenter notes in `docs/DEMO.md` |
| Load and chaos tests with measured results | **Missing** | No measurements were taken, so no numbers are reported |
| Automated tests and CI | Partial | See `docs/VERIFICATION.md`; CI workflow written but not executed on GitHub |
