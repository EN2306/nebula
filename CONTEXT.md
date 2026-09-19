# NebulaX PS1 working context

This file is the handoff point for the project. Update it whenever the app is started, reset, changed, tested, benchmarked, or deployed. Keep passwords, API keys, cookies, and other secrets out of this file and out of Git.

## Current state (2026-09-19)

- Canonical app: `railsync-app/`; official source pack: `problem-statement/PS1/`.
- Local URL: `http://127.0.0.1:3001`.
- Production demo URL: `https://nebula-trackwork.vercel.app` (deployment `dpl_6KrkCyf971eVJrU31ump1kiDwWyY`, aliased production deployment `nebula-trackwork-790ecbkpz-energelpens-projects.vercel.app`).
- Hosted demo login: `planner@nebula.local`. The generated password is stored only in ignored `.local/deployment/vercel-planner.json`; do not commit or publish it.
- Fresh local planner account was created during the 2026-09-19 reset. The password is intentionally not recorded here; use the credential supplied in the active session or create another planner from Settings.
- Public PS1 baseline: 54/54 activities complete in A, B and C, zero internal violations; internal penalties A 25.2, B 30, C 25.2.
- Latest automated check: `npm test` passed all 24 tests, including risk aggregation and serverless parsed-body/session/alias coverage. Extended browser smoke passed overview filters, weekly drilldown, planning brief, toolbox, desktop/mobile layout and all existing planning/team workflows.
- Current product features: strict eight-file CSV preflight with cell diagnostics and header templates, editable schedule map with buffers, validated disruption backup plans, worker/manager/planner/supervisor workspaces, manager-reviewed penalty points, in-app emergency decisions, capacity what-if, insights, exports and optional planning chat.
- Deployment: local Node, Docker with persistent SQLite, and a Vercel serverless demo adapter. Each Vercel instance uses a separate ephemeral SQLite file. RAILSYNC_DB is a file path, not a remote database connector; reliable multi-user Vercel hosting still needs a remote database adapter.
- Docker Compose supports a durable named trackwork-data volume. The currently verified local service on port 3001 is the native Node app using railsync-app/data/railsync.sqlite.
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

- 2026-09-19: Expanded supervisor workspace with programme overview, all saved schedules/maps/contracts/risks/exports, team reports and penalties, workspace history and emergency decisions. Managers now have an operations overview and read-only schedule access. Planner editing workflow remains unchanged. Role permissions verified in API and browser tests.
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
- 2026-09-19: Committed the planner redesign and deployment work as `46bc647` (`Ship planner redesign and deployment support`), stored `ANTHROPIC_API_KEY` as a Vercel Production secret, and deployed production `dpl_6KrkCyf971eVJrU31ump1kiDwWyY`. The Vercel deployment remains a serverless demo with ephemeral SQLite; use the Docker host for durable accounts and plans.
- 2026-09-19: Updated GitLab CI to run Node 24 formatting/reference checks, the full test suite, and reproducible schedule/benchmark artifacts in separate stages. Tightened server-side role visibility: planners and supervisors receive workforce coordination without assignment instructions; supervisors retain read-only schedule and workforce oversight; managers receive workforce records; and workers receive only their own. Added regression assertions and documented the contract in `docs/TEAM-WORKFLOWS.md`.
- 2026-09-19: Synced the verified role-workspace merge to GitHub `main` at `7fafaf2`. GitLab `main` is protected, so the same revision was published to `gitlab/codex/sync-role-workspaces` for merge-request review and CI. The GitLab project API is private to anonymous requests; inspect pipeline status while signed in through the merge-request URL printed by GitLab on push.
- 2026-09-19: Added equivalent GitHub Actions coverage for formatting/reference checks, tests, and schedule/benchmark evidence, so GitHub and GitLab execute the same CI contract after their next push.
- 2026-09-19: GitHub Actions workflow `Verify Trackwork` completed successfully for `e3cf98a` (run `35420924937`). GitLab accepted the same revision on its protected-main review branch; direct pipeline status requires a signed-in project member because the GitLab API returns private-project 404 responses to anonymous requests.
- 2026-09-19: After maintainer access was confirmed, promoted `45a160a` from `codex/sync-role-workspaces` to GitLab `main`. GitHub and GitLab `main` now point to the same verified project history.
- 2026-09-19: Added public Docker-demo role accounts behind `RAILSYNC_DEMO_ACCOUNTS=true` and documented the four explicit account credentials in the root README. Rebuilt Docker, verified a healthy container and all four logins. Added time-bounded temporary location quotas to disruption recovery; the validator enforces those quotas in every scenario, the UI supports them, and the preview test passes. Activity evidence now identifies relevant predecessor and capacity-pressure observations without claiming sole causation. Updated stale GitLab submission status and test-count documentation.
- 2026-09-19: Deployed `adfc0b3` to Vercel production as `dpl_Abkoe2AmCgFMkYqz3qgxRnArhjJi`, aliased to `https://nebula-trackwork.vercel.app`. Vercel serves the serverless demo only; the Docker container remains the durable host with the documented role-demo accounts. Public Vercel demo-account provisioning was intentionally left disabled.

## 2026-09-19 — Vercel container deployment

- Added `Dockerfile.vercel` and Vercel Services routing so Vercel can build and run the same Node application as an OCI container function.
- The Vercel image listens on port 80 and writes only to `/tmp`. This is intentional: Vercel container functions are stateless and cannot mount the local Docker named volume. Durable user accounts, sessions, and plans require a future external database migration.
- Local Docker remains the persistent demonstration host through the `nebula_trackwork-data` named volume and `Dockerfile`.
