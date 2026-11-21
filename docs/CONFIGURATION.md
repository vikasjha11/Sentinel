# Configuration reference

All variables live in `.env` (copy `.env.example`). Required ones make `docker compose` refuse to start when missing.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `JWT_SECRET` | yes | none | Signs Sentinel sessions (32+ characters in production) |
| `TILDA_JWT_SECRET` | yes | none | Signs storefront sessions |
| `RECOVERY_TOKEN` | yes | none | Bearer token between the Sentinel API and the Recovery Controller (16+ characters) |
| `ALERT_WEBHOOK_TOKEN` | yes | none | Bearer token Alertmanager uses for `POST /api/alerts/webhook` |
| `ADMIN_PASSWORD`, `GRAFANA_ADMIN_PASSWORD` | yes | none | Storefront admin and Grafana admin passwords |
| `PIPELINE_ENABLED` | no | `true` | Turns the AI analysis and policy layer on or off |
| `PIPELINE_AUTOHEAL` | no | `false` | When `true`, Sentinel restarts a service by itself if the policy decision is `allow` and the top suggestion has at least 50% confidence |
| `SENTINEL_ENVIRONMENT` | no | `production` | Selects the policy's environment block |
| `POLICY_FILE` | no | `/app/state/policy.json` in Compose | Where the active policy lives; seeded from `backend/pipeline/policy.default.json` |
| `AI_ENGINE_URL` | no | `http://ai-engine:4002` in Compose | AI engine address. If unreachable, a labelled fallback is used |
| `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` | no | empty | Optional LLM narrative: `openai`, `openai-compatible` or `anthropic`. Empty means rules only |
| `NOTIFY_CHANNELS_FILE` | no | none | Path to a JSON array of channels: `{"name","type":"slack"\|"webhook","url","minSeverity","events"}` |
| `NOTIFY_ALLOW_PRIVATE` | no | `false` | Allow notification URLs that resolve to private or loopback addresses |
| `SERVICE_CHECK_INTERVAL_MS`, `SERVICE_FAILURE_THRESHOLD`, `SERVICE_RECOVERY_THRESHOLD` | no | 5000, 2, 2 | Health-check cadence and thresholds |
| `K8S_NAMESPACE` | no | in-cluster namespace | Namespace the Kubernetes executor acts in (executor code only; not connected to the monitor yet) |

Policy file fields are validated on load and on save; see `backend/pipeline/policy.js` for the schema and the rule order P1-P11.
