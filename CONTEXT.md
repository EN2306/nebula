# NebulaX PS1 working context

This file is the handoff point for the project. Update it whenever the app is started, reset, changed, tested, benchmarked, or deployed. Keep passwords, API keys, cookies, and other secrets out of this file and out of Git.

## Current state (2026-09-19)

- Canonical app: `railsync-app/`; official source pack: `problem-statement/PS1/`.
- Local URL: `http://127.0.0.1:3001`.
- Production demo URL: `https://nebula-trackwork.vercel.app` (deployment `dpl_Doeejwn23hopkGSpwvvHpdWpfzxZ`, aliased production deployment `nebula-trackwork-11xkcdpkj-energelpens-projects.vercel.app`).
- Hosted demo login: `planner@nebula.local`. The generated password is stored only in ignored `.local/deployment/vercel-planner.json`; do not commit or publish it.
- Fresh local planner account was created during the 2026-09-19 reset. The password is intentionally not recorded here; use the credential supplied in the active session or create another planner from Settings.
- Public PS1 baseline: 54/54 activities complete in A, B and C, zero internal violations; internal penalties A 25.2, B 30, C 25.2.
- Latest automated check: `npm test` passed all 24 tests, including risk aggregation and serverless parsed-body/session/alias coverage. Extended browser smoke passed overview filters, weekly drilldown, planning brief, toolbox, desktop/mobile layout and all existing planning/team workflows.
- Current product features: strict eight-file CSV preflight with cell diagnostics and header templates, editable schedule map with buffers, validated disruption backup plans, worker/manager/planner/supervisor workspaces, manager-reviewed penalty points, in-app emergency decisions, capacity what-if, insights, exports and optional planning chat.
- Deployment: local Node, Docker with persistent SQLite, and a Vercel serverless demo adapter. Each Vercel instance uses a separate ephemeral SQLite file. RAILSYNC_DB is a file path, not a remote database connector; reliable multi-user Vercel hosting still needs a remote database adapter.
- Durable Docker deployment is running and verified at `http://127.0.0.1:3001` via Compose service `nebula-trackwork-1`. The named `trackwork-data` volume persists the SQLite workspace. Keep `.env` local and private; it contains the setup token.
- Port 3001 now runs this canonical code with `railsync-app/data/railsync.sqlite`. The temporary 3002 instance was stopped. Seven accounts from the previous Documents-based app were preserved; legacy roles remain unpromoted. The existing planner login remains valid.
- Migration recovery: original Documents app/database remain intact; `.local/deployment/port3001-before-upgrade.sqlite` is a full backup; the earlier local database is archived under `.local/deployment/previous-local/`. Original plan JSON is also stored in the production database's `upgrade_archive` table. Do not rerun the one-off switch script.
- The old A/C plans had an exclusion-buffer collision under current validation. All three scenarios were rebuilt from the existing programme, yielding 54/54 completed and zero internal violations. Scores remain A 25.2, B 30, C 25.2.

## Runbook

From the repository root:

```powershell
npm start
npm test
npm run results
npm run benchmark
```

The app reads `.env` when started with `node --env-file=.env railsync-app/server.mjs`. Set `ANTHROPIC_API_KEY` and `RAILSYNC_MODEL=claude-sonnet-4-6` for Claude, or configure a provider in Settings. Keys are held in server memory and are never saved in the database.

## Important paths

- `railsync-app/server.mjs`: HTTP API, sessions, imports, exports and AI configuration.
- `railsync-app/ps1.mjs`: PS1 schema, solver and validation.
- `railsync-app/insights.mjs`: offline risk, capacity and handover analysis.
- `railsync-app/public/`: browser UI and styling.
- `railsync-app/tests/`: deterministic regression and transport tests.
- `submissions/public/`: reproducible public scenario outputs.
- `.local/`: ignored runtime data, archives and temporary staging.

## Update log

- 2026-09-19: Redesigned the responsive UI with a dark rail-themed sidebar, green accents, clearer summary cards and a consolidated Planning tools menu. Added the Overview tab, weekly workload drilldowns, deadline watchlist filters and a downloadable planning brief with a plan fingerprint. Fixed incomplete-work risk reporting and aggregation beyond 20 activities.
- 2026-09-19: Installed Vercel CLI 59.23.2, linked `nebula-trackwork`, configured a production setup token, and deployed the live demo. Corrected Node version configuration, explicit worker-module bundling, upload exclusions, accepted deployment aliases and parsed-body handling.
- 2026-09-19: Restarted the canonical app on port 3001 with the redesigned UI; health verified with the existing database intact. Desktop/mobile screenshots are in `.local/browser-check/` (overview-desktop.png, overview-details.png, overview-mobile.png).

- 2026-09-19: Delivered and deployed four-role workflows, private worker reports, manager-reviewed internal penalty points, dated assignments, urgent supervisor decisions, draggable schedule map with spatial buffers, preview/save/undo and time-bounded disruption recovery. Preserved old databases and accounts, rebuilt validated plans, and verified the existing planner login on port 3001. See `docs/TEAM-WORKFLOWS.md` for usage and modelling limits.

- 2026-09-19: Reset local runtime data and recreated the planner account.
- 2026-09-19: Added upload schema preflight with actionable missing-file, column, filename and CSV syntax errors.
- 2026-09-19: Added offline Risk & handover insights and an API route for the planner.
- 2026-09-19: Confirmed Anthropic Claude transport, provider configuration, and 18-test regression suite.
- 2026-09-19: Polished Settings with an explicit Anthropic Claude option, provider-specific API-key labels, model suggestions, and documented environment configuration; restarted the app and verified `/api/health`.
- 2026-09-19: Added Vercel entrypoint, rewrites, Node 24 runtime configuration, packaged static/reference assets, and serverless-safe session cookies.
- 2026-09-19: Verified the Vercel adapter imports locally with an ignored SQLite fallback; production Vercel uses `/tmp` and requires durable storage for persistent judging data.
- 2026-09-19: Linked Vercel project `nebula-trackwork`, configured a production-only secret setup token, deployed production, and received the live URL `https://nebula-trackwork.vercel.app`. Hosted verification reached health, packaged assets, exclusions, account setup, sample import and A/B/C solver completion (54/54 each); the final verification rerun was blocked by the environment network approval limit after correcting its CSV-header assertion.
- 2026-09-19: Added `compose.yaml` for a named-volume Docker deployment, rebuilt the image, recreated the container, and verified health, account login/setup, sample import, A/B/C solver completion (54/54 each), insights, CSV export (`activity_id,` header), and logout. The corrected hosted verifier now checks the real `SCHEDULE_ACCESS.csv` header (`activity_id,`).
