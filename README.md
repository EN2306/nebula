# Trackwork — NebulaX PS1

Railway track access planning for Line Alpha and Line Beta. Import the eight instance CSVs, build scenarios A/B/C, inspect the weekly plan, and export submission CSVs.

## Run and verify

Requires Node.js 24 or later. Install the server dependencies from this repository root. Scheduling does not require an AI API key.

```powershell
npm ci
npm start
npm test
npm run results
npm run benchmark
```

Open http://127.0.0.1:3001 and create a planner account on a fresh installation. An existing local installation retains its accounts. `npm run results` regenerates the public A/B/C outputs without changing the application database.

## Demo accounts

The hosted application at [nebula-trackwork.vercel.app](https://nebula-trackwork.vercel.app) uses Supabase and separate private accounts: `planner@trackwork.app`, `supervisor@trackwork.app`, `manager@trackwork.app`, and `worker@trackwork.app`. Their generated passwords are supplied privately to the owner and are not the local demo password below.

The Docker demo configuration enables `RAILSYNC_DEMO_ACCOUNTS=true`, which provisions these accounts on first start. These are intentionally public demonstration credentials, not host, Vercel, database, setup-token, or AI-provider secrets.

| Workspace  | Email                       | Password             |
| ---------- | --------------------------- | -------------------- |
| Planner    | `planner@trackwork.demo`    | `TrackworkDemo!2026` |
| Supervisor | `supervisor@trackwork.demo` | `TrackworkDemo!2026` |
| Manager    | `manager@trackwork.demo`    | `TrackworkDemo!2026` |
| Worker     | `worker@trackwork.demo`     | `TrackworkDemo!2026` |

Use these only for a disposable demo. Disable `RAILSYNC_DEMO_ACCOUNTS` and create individual accounts for an operational deployment. The planner can import/build/edit/export; the supervisor has read-only schedule and workforce oversight; the manager assigns and reviews work; the worker sees only their own tasks.

## CI and repository handoff

The root [`.gitlab-ci.yml`](.gitlab-ci.yml) and [GitHub Actions workflow](.github/workflows/ci.yml) run on Node 24 for pushes and merge requests. They check formatting and the official-source checksums, run the 24 solver/API/privacy tests, regenerate the A/B/C schedule evidence, and save the generated submission files and benchmark as 14-day artifacts. Browser smoke tests are intentionally local because they require Microsoft Edge.

The maintained repositories are [GitHub](https://github.com/EN2306/nebula) and [GitLab](https://gitlab.com/chia-group1/lta-nebulax). Their `main` branches are synchronized. GitLab protects `main`, so routine changes should be reviewed through a merge request:

```sh
git switch -c feature/my-change
git push -u gitlab feature/my-change
```

The four-account visibility contract and its server-side enforcement are documented in [docs/TEAM-WORKFLOWS.md](docs/TEAM-WORKFLOWS.md). Both CI pipelines exercise the same API and privacy checks through `npm test`.

## Repository map

| Path                                                                   | Purpose                                                                           |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [railsync-app/](railsync-app/)                                         | Canonical application, solver, browser UI and tests                               |
| [problem-statement/PS1/](problem-statement/PS1/)                       | Unmodified official brief, eight CSVs, SVG/Draw.io diagrams and sample submission |
| [problem-statement/provenance.json](problem-statement/provenance.json) | Upstream commit and SHA-256 checksums                                             |
| [submissions/public/](submissions/public/)                             | Our generated A/B/C CSVs and internal validation report                           |
| [docs/REVIEW.md](docs/REVIEW.md)                                       | Findings and prioritised improvement plan                                         |
| [docs/IMPROVEMENTS.md](docs/IMPROVEMENTS.md)                           | Implemented changes, score bounds and benchmark evidence                          |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)                               | Local, Docker and HTTPS hosting setup                                             |
| [vercel.json](vercel.json)                                             | Vercel Docker container service routing                                           |
| [docs/PLANNER.md](docs/PLANNER.md)                                     | Solver rules, assumptions and current limitations                                 |
| [docs/TEAM-WORKFLOWS.md](docs/TEAM-WORKFLOWS.md)                       | Schedule map, disruptions, worker reports, penalties and supervisor decisions     |
| [docs/SUBMISSION.md](docs/SUBMISSION.md)                               | Deliverables and proposed three-minute demo                                       |
| [docs/CLEANUP.md](docs/CLEANUP.md)                                     | Consolidation decisions and recovery locations                                    |
| [CONTEXT.md](CONTEXT.md)                                               | Current handoff, runbook, feature state and update log                            |

Runtime data stays in `railsync-app/data/` and is ignored by Git. Optional chat configuration is described in the [app guide](railsync-app/README.md).

## Current baseline

All 54 public activities are completed in each scenario with zero internal violations. Internal penalties: A **25.2**, B **30**, C **25.2**. B improves from 44 with no extra track slots. All three public plans reach a mathematical lower bound under the app's weekly model. These are different scenario objectives; compare each plan with its own bound.

The deterministic solver combines multiple scheduling policies, bounded repair and ECLO-window search. The planner includes capacity impact previews, schedule evidence, weekly workload overview, deadline watchlists and planning briefs. Official validator agreement and global optimality on hidden instances remain unverified. The hosted app uses Supabase Postgres for durable accounts, sessions, schedules, previews and team records; local Docker can use persistent SQLite.

Source: [official PS1 brief](https://github.com/aochinwen/NebulaX-Hackathon-ProblemStatement/tree/966c976005db2e3e40a691cff268fdb8f396a5df/PS1).
