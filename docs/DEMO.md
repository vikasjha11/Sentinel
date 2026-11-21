# Failure-injection demo and presenter guide

Run on a machine with Docker. Nothing here has been timed in the development sandbox, so no timings are promised;
the table at the end is for you to fill in from real runs.

## Prepare (once)
1. `.\scripts\setup-env.ps1` (Windows) or copy `.env.example` to `.env` and replace each `GENERATE_WITH_SETUP_SCRIPT`.
2. `docker compose up -d --build`, then wait until `docker compose ps` shows everything healthy.
3. Open http://localhost:5173, create a workspace and open **Microservices** (the Tilda Goods stack is provisioned automatically).
4. Decide the mode for the demo:
   - **Approval mode (default):** a person approves the restart.
   - **Auto-heal:** set `PIPELINE_AUTOHEAL=true` in `.env`, run `docker compose up -d backend`. `products` and `media` are set to auto in the default policy; critical services always ask first in production.

## Scenario 1: kill a container (full pipeline)
```
DEMO_PASSWORD='a-long-demo-password' node scripts/demo-failure.js products
```
The script stops the `products` container and prints a timestamped trace: incident opened, AI analysis (cause, confidence), policy decision (decision and rule), recovery requested, resolved. In the console, show **Incidents**, open the incident (AI analysis panel, timeline), then **Recovery policy** and its audit log.

## Scenario 2: policy blocks a repeat
Run scenario 1 twice within a minute. The second incident is denied by rule `P4 cooldown`; trying to approve it returns "Blocked by recovery policy". Explain that Sentinel will not keep restarting something a restart does not fix.

## Scenario 3: Prometheus as second signal
Open http://localhost:9090/alerts while a service is down: `ServiceDown` goes pending then firing, and Alertmanager posts it to Sentinel. The alert is attached to the existing incident's timeline instead of opening a duplicate.

## Scenarios that need extra work
Overloading a service and breaking a dependency are not scripted. The AI engine's overload and dependency-failure analyses are covered by unit tests only.

## Suggested talk track (about 8 minutes)
1. Architecture slide: detect, incident, AI, policy, execute, verify.
2. Run scenario 1 live, narrating each line of the trace.
3. Show the AI panel: it is labelled a suggestion with a heuristic confidence.
4. Show the policy page: change `products` to manual and back; say the audit log records every decision.
5. Run scenario 2; show the blocked approval.
6. Close with the limitations list in `docs/AUDIT-AND-MATRIX.md`.

## Results table (fill in from your own runs)
| Run | Service | Detection time | Time to recovery | Resolved? |
|---|---|---|---|---|
| 1 | | | | |
