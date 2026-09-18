# NebulaX PS1 working context

This file is the handoff point for the project. Update it whenever the app is started, reset, changed, tested, benchmarked, or deployed. Keep passwords, API keys, cookies, and other secrets out of this file and out of Git.

## Current state (2026-09-19)

- Canonical app: `railsync-app/`; official source pack: `problem-statement/PS1/`.
- Local URL: `http://127.0.0.1:3001`.
- Fresh local planner account was created during the 2026-09-19 reset. The password is intentionally not recorded here; use the credential supplied in the active session or create another planner from Settings.
- Public PS1 baseline: 54/54 activities complete in A, B and C, zero internal violations; internal penalties A 25.2, B 30, C 25.2.
- Latest automated check: `npm test` passed all 22 tests; `npm run format:check` passed; extended browser smoke passed desktop/mobile flows, save/undo, backup previews, worker reports, manager reviews and supervisor decisions.
- Current product features: strict eight-file CSV preflight with cell diagnostics and header templates, editable schedule map with buffers, validated disruption backup plans, worker/manager/planner/supervisor workspaces, manager-reviewed penalty points, in-app emergency decisions, capacity what-if, insights, exports and optional planning chat.
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

- 2026-09-19: Delivered and deployed four-role workflows, private worker reports, manager-reviewed internal penalty points, dated assignments, urgent supervisor decisions, draggable schedule map with spatial buffers, preview/save/undo and time-bounded disruption recovery. Preserved old databases and accounts, rebuilt validated plans, and verified the existing planner login on port 3001. See `docs/TEAM-WORKFLOWS.md` for usage and modelling limits.

- 2026-09-19: Reset local runtime data and recreated the planner account.
- 2026-09-19: Added upload schema preflight with actionable missing-file, column, filename and CSV syntax errors.
- 2026-09-19: Added offline Risk & handover insights and an API route for the planner.
- 2026-09-19: Confirmed Anthropic Claude transport, provider configuration, and 18-test regression suite.
- 2026-09-19: Polished Settings with an explicit Anthropic Claude option, provider-specific API-key labels, model suggestions, and documented environment configuration; restarted the app and verified `/api/health`.
