# Verification report

Everything below was run in a sandbox with Node 22, Python 3.12 and headless Chromium. The sandbox has **no Docker, no
Kubernetes, no MySQL, no network access and no `npm install`**, so Express and the real container runtime were unavailable.

## Ran and passed
| Check | Command | Result |
|---|---|---|
| Backend unit + integration tests | `cd backend && npm test` | 50 tests, 50 passed |
| AI engine tests | `python3 -m unittest discover -s services/ai-engine/tests` | 14 tests, all passed |
| Storefront client tests | `cd ecommerce/client && node --test` | 1 test, passed |
| Storefront server tests | `cd ecommerce/server && node --test` | 4 tests, passed |
| Frontend bundling (JSX parse + imports) | esbuild, with the icon library stubbed | Sentinel console and storefront both bundle |
| YAML validity | PyYAML over Compose, Prometheus, alert rules, Alertmanager, RBAC, CI | all parse |
| Screens render in a browser | Chromium with a mocked API | Policy, Analytics, Incidents and AI panel render; no console errors; no horizontal overflow at 1366 px and 390 px |

What the backend tests actually exercise:
- **Policy engine** (15 tests): every rule P1-P11, validation, windows, budgets.
- **Lifecycle** (7), **executors** (7, including a fake Kubernetes API server speaking real HTTP and checking request shapes), **notifications, analytics, alerts, AI fallback** (7).
- **Pipeline integration** (13): detect, incident, **real Python AI engine over HTTP**, policy, execute, verify, resolved; approval; policy deny; verification failure with retry and escalation; dry run; monitor-only; deduplication; AI engine down.
- **Monitor integration** (1): the **real `docker-monitor.js` and `pipeline/index.js`** against a fake customer service and a fake Recovery Controller: kill the service, health check detects it, incident opens, AI analyses, policy allows, auto-heal restarts through the controller, health verification resolves it. A second outage immediately afterwards is denied by the cooldown rule and an operator's approval is blocked with HTTP 409.

## Not run (please run on your machine)
| Not verified | Why | Command to verify |
|---|---|---|
| Docker Compose config and image builds | no Docker | `docker compose --env-file .env.example config --quiet` then `docker compose build` |
| Full stack start, Prometheus rules, Alertmanager to webhook | no Docker | `docker compose up -d`, then open http://localhost:9090/alerts; validate rules with `docker run --rm -v "$PWD/observability:/r" --entrypoint promtool prom/prometheus:v3.2.1 check rules /r/alert-rules.yml` |
| Express routes (`/api/pipeline/*`, `/api/analytics`, `/api/audit`, `/api/alerts/webhook`) | Express not installable | Start the stack, then `curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/pipeline/status`. The route handlers were only syntax-checked and exercised through the monitor integration test's route registry |
| Frontend production build with Vite | no `npm install` | `npm run build --prefix frontend && npm run build --prefix ecommerce/client` |
| Kubernetes executor on a real cluster | no cluster | Apply `k8s/sentinel-rbac.yaml`, run Sentinel in the cluster, and use a test deployment (dry run first) |
| LLM provider | no API key | Set `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, then POST an incident to the AI engine |
| GitHub Actions workflow | not pushed | Push to GitHub and watch the CI run |
| `scripts/demo-failure.js` | no Docker | `DEMO_PASSWORD=... node scripts/demo-failure.js products` |

## Not measured
No load, chaos or repeated-run measurements were taken. Detection time, recovery time and success rate over repeated runs
are therefore **not reported**. After running the demo script several times on your machine, record the numbers in
`docs/DEMO.md`.
