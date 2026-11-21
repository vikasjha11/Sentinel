# Changelog

## Implementation-3 work (this release)
Decisions made without asking, per the brief:
- Kept the working Docker flow and layered the proposal pipeline on top through hooks, instead of replacing it, to avoid breaking verified behaviour.
- Policy hard-denials (cooldown, restart budget, blast radius, scale cap, disallowed action) also block human approvals; only "require approval" is satisfied by a person.
- Auto-heal is off by default (`PIPELINE_AUTOHEAL=false`) and only acts at 50% confidence or more.
- Used a zero-dependency Python AI engine (standard library) so it runs without `pip install`.
- Self-hosted the Inter font in both frontends so the UI does not depend on Google Fonts.

Added: AI engine rewrite (rules, latency statistics, optional LLM with fallback); declarative versioned policy engine with validation, editor and audit; incident lifecycle, orchestrator and executors (Docker and Kubernetes with dry run, RBAC manifest); Prometheus alert rules, Alertmanager and webhook; notifications (Slack/webhook, routing, delivery log, test send); analytics (MTTD, MTTR, recovery success, top services, CSV); audit log with CSV export; Recovery policy and Analytics pages and an AI panel in the incident view; CI workflow; demo script; documentation.
Not done: MySQL, Helm, onboarding flows, API tokens and extra roles, dependency map, OpenAPI, load/chaos measurements. See `docs/AUDIT-AND-MATRIX.md`.

## Final redesign

### Added
- **Sentinel landing page** at `#/` with navigation (Home, Platform, Features, Architecture, Documentation, Sign in, Get started), hero, platform overview, eight feature cards, how it works, an architecture diagram built from the services in `docker-compose.yml`, call to action and footer. Features not built yet (AI-assisted root cause analysis, service dependency visualization) are labelled Planned; reliability analytics is labelled Basic.
- **Documentation page** at `#/docs`: quick start, local addresses, recovery workflow, environment variables.
- **Tilda landing page** at `#/` with hero, categories, products from the live catalogue, delivery and returns, and store story.
- Real URLs (hash routes) for Sentinel and Tilda: Back button, reload and deep links work. Signed-out visitors to protected pages are redirected to sign in.
- Application filter tabs on Incidents, search on Applications, and a dashboard Microservices summary that uses live service status.
- Central navigation config (`frontend/src/nav.js`).

### Changed
- **Sentinel dashboard** rebuilt around one sidebar (Overview, Infrastructure, Operations, Account). Removed the top bar, breadcrumbs, notification bell, workspace switcher, help card, and the separate Profile and "My projects" entries. Mobile uses one drawer.
- Application add and edit now share one modal; sign-in and sign-up share one form.
- **Tilda storefront** has one header navigation shared by desktop and mobile; the duplicate Collections link, separate menu page and footer link block are gone.
- Both stylesheets rewritten from scratch: neutral surfaces, one accent each, Inter, 6 to 8 px radius, no gradients or glow. Sentinel keeps an optional dark theme in Settings.
- Interface text is English throughout; uppercase eyebrow labels, twee copy and decorative symbols removed.

### Fixed
- **Security:** workspace members received owner permissions after signing in, because the login token had no role and the owner check treated a missing role as owner. The role is now read from the stored user on every request. Verified: a member gets 403 on deleting an application and on listing members.
- Sentinel frontend production build failed (PostCSS config required Tailwind packages that were not installed).
- Tilda image map listed one image twice.

### Removed
- `sentinel-console/` (a second, unused copy of the Sentinel UI with its own Dockerfile and nginx config), its npm scripts, and `frontend/nginx.conf`.
- Seven unused files in `frontend/src` and the frontend root: `Sentinel.jsx`, `ProductImage.jsx`, `index.css`, `theme.jsx`, `api.js` (old copy), `tailwind.config.js`, `postcss.config.js`.
- Unused `seedFallback` copy in the Tilda `App.jsx`; `artifacts/planner/task.md`.
- `backend/data.json` reset to an empty store. It contained a test account with a password hash, 28 incidents and 179 checks. It is also listed in `.gitignore`.

### Not changed
`services/`, `common/` and the root `Dockerfile` (an older seven-service demo not used by `docker-compose.yml`), `docs/TEAM_GUIDE.md`, the recovery controller, observability configs and all API endpoints and data models.

### Known gaps
- Docker is not available in the build environment, so `docker compose config`, image builds and container startup were not run. The compose file was checked for valid YAML, existing Dockerfile paths, valid `depends_on` targets and variables covered by `.env.example`.
- The Tilda API was not run against MongoDB; the storefront flows were tested against a mocked API.
- No visual check in a real browser was possible; layouts were verified by structure only and the CSS includes mobile breakpoints at 560, 800 and 1000 px.
- `docs/TEAM_GUIDE.md` still mentions the removed `frontend/src/Sentinel.jsx`.
- No new automated tests were added for the Sentinel frontend.
