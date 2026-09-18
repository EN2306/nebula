# NebulaX PS1 working context

This file is the handoff point for the project. Update it whenever the app is started, reset, changed, tested, benchmarked, or deployed. Keep passwords, API keys, cookies, and other secrets out of this file and out of Git.

## Current state (2026-09-19)

- Canonical app: `railsync-app/`; official source pack: `problem-statement/PS1/`.
- Local URL: `http://127.0.0.1:3001`.
- Fresh local planner account was created during the 2026-09-19 reset. The password is intentionally not recorded here; use the credential supplied in the active session or create another planner from Settings.
- Public PS1 baseline: 54/54 activities complete in A, B and C, zero internal violations; internal penalties A 25.2, B 30, C 25.2.
- Latest automated check: `npm test` passed all 18 tests.
- Current product features: strict eight-file CSV preflight, scenario planner, validator, capacity what-if, risk and handover insights, exports, planner accounts, per-scenario chat, and OpenAI/Anthropic Claude provider support.

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

- 2026-09-19: Reset local runtime data and recreated the planner account.
- 2026-09-19: Added upload schema preflight with actionable missing-file, column, filename and CSV syntax errors.
- 2026-09-19: Added offline Risk & handover insights and an API route for the planner.
- 2026-09-19: Confirmed Anthropic Claude transport, provider configuration, and 18-test regression suite.
- 2026-09-19: Polished Settings with an explicit Anthropic Claude option, provider-specific API-key labels, model suggestions, and documented environment configuration; restarted the app and verified `/api/health`.
