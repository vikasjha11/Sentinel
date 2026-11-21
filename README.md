# Sentinel + Tilda Goods — VS Code setup

## Requirements
- Windows 10/11
- Docker Desktop (Linux containers / WSL 2 engine)
- Visual Studio Code
- Git Bash or PowerShell terminal
- Node.js is recommended for local scripts; the environment setup script itself uses Windows PowerShell/.NET.

## 1. Open the project
1. Extract this ZIP.
2. In VS Code choose **File → Open Folder**.
3. Select the `sentinel-platform-upgraded` folder (the folder containing `docker-compose.yml`).
4. Open **Terminal → New Terminal**. Confirm the terminal is in that folder.

## 2. Generate local environment secrets
In the VS Code terminal, select **PowerShell** and run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\setup-env.ps1
```

The script creates `.env` if missing. If `.env` already exists, it updates only these five secret values and preserves other settings:
- `JWT_SECRET` (Sentinel)
- `TILDA_JWT_SECRET` (Tilda JWT)
- `RECOVERY_TOKEN` (shared by Sentinel API and recovery controller)
- `ADMIN_PASSWORD` (Tilda admin)
- `GRAFANA_ADMIN_PASSWORD` (Grafana)

It generates a new set each time it is run. Do not rerun it after you have started using accounts/tokens unless you intend to invalidate existing sessions and change the admin/Grafana passwords. Keep `.env` private.

## 3. Validate Compose
```powershell
docker compose config --quiet
```
No output and exit code 0 means Compose configuration parsed successfully.

## 4. Build and start
```powershell
docker compose build
docker compose up -d
```

## 5. Check status and logs
```powershell
docker compose ps -a
docker compose logs --tail=100
```
For one service:
```powershell
docker compose logs --tail=100 backend
docker compose logs --tail=100 recovery-controller
docker compose logs --tail=100 auth
```

## 6. Open applications
- Sentinel: http://localhost:5173
- Tilda Goods: http://localhost:5174
- Tilda API Gateway health: http://localhost:5000/api/health
- Grafana: http://localhost:3001
- Prometheus: http://localhost:9090

Tilda admin email defaults to `admin@tilda.local`. Its password is generated into `.env` as `ADMIN_PASSWORD`; inspect it locally in VS Code if needed. Grafana username defaults to `admin`; its password is `GRAFANA_ADMIN_PASSWORD` in `.env`.

## 7. Stop safely
```powershell
docker compose down
```
Do **not** use `docker compose down -v` unless you intentionally want to delete persistent data volumes (including MongoDB data).

## Troubleshooting
- If Compose says a required variable is missing, rerun the setup script and then `docker compose config --quiet`.
- If containers restart, inspect logs: `docker compose logs --tail=150 <service>`.
- If a container name is already in use, run `docker compose down --remove-orphans` from this same project folder, then `docker compose up -d`. Do not remove volumes.
- If ports 4000, 5173, 5174, 5000, 3001, or 9090 are occupied, stop the other application using that port or change the host-side port mapping in `docker-compose.yml`.

## Important
- `.env` contains private secrets and is not included in the ZIP.
- `.env.example` is a template, not a production credential file.
- The Docker setup has not been live-tested against your local Docker Desktop installation; verify with the commands above.

## Interfaces and navigation
The project has three separate interfaces. Each has its own navigation and they do not share menus.

| Interface | Address | Navigation |
|---|---|---|
| Sentinel public site | http://localhost:5173 | Landing page (`#/`), documentation (`#/docs`), sign in (`#/signin`), create account (`#/signup`) |
| Sentinel application | http://localhost:5173/#/app/dashboard | One sidebar: Dashboard, Applications, Microservices, Service health, Incidents, Settings, Sign out |
| Tilda storefront | http://localhost:5174 | Home, Shop, wishlist, bag and account icons. Routes: `#/shop`, `#/product/<id>`, `#/cart`, `#/checkout`, `#/orders`, `#/admin`, `#/login` |

There is no separate Profile or Logout page. Profile details and workspace access are in **Settings**, and **Sign out** sits at the bottom of the sidebar. Recovery actions live inside each incident, and logs are in each microservice's detail view, so neither has its own menu entry.

## Accounts
- **Sentinel:** no account is pre-created. Choose **Get started** and create one. The first account of a workspace is its owner; owners can add members in **Settings**.
- **Tilda admin:** email `admin@tilda.local` (or `ADMIN_EMAIL`) and the `ADMIN_PASSWORD` stored in your `.env`.

## Tests
```bash
npm run install:all
npm test            # Tilda server and client unit tests
npm run build       # builds the Sentinel and Tilda frontends
```

## Pipeline: detect, analyse, decide, recover, verify
Sentinel detects failures (health checks and Prometheus alerts), opens an incident, asks the AI engine for a root-cause suggestion, checks the proposed action against the recovery policy, then restarts the service after approval (or automatically when you enable auto-heal for a service) and verifies recovery. See `docs/ARCHITECTURE.md`, `docs/CONFIGURATION.md`, `docs/DEMO.md`, `docs/AUDIT-AND-MATRIX.md` (what is done and what is missing) and `docs/VERIFICATION.md` (what was actually run).

Run the tests: `npm test --prefix backend` and `python3 -m unittest discover -s services/ai-engine/tests`.
