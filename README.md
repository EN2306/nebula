# Trackwork — NebulaX PS1

Railway track access planning for Line Alpha and Line Beta. Import the eight instance CSVs, build scenarios A/B/C, inspect the weekly plan, and export submission CSVs.

## Run and verify

Requires Node.js 24 or later. No runtime npm dependencies or API key are needed for scheduling. From this repository root:

```powershell
npm start
npm test
npm run results
npm run benchmark
```

Open http://127.0.0.1:3001 and create a planner account on a fresh installation. An existing local installation retains its accounts. `npm run results` regenerates the public A/B/C outputs without changing the application database.

## GitLab CI and repository handoff

The root [`.gitlab-ci.yml`](.gitlab-ci.yml) runs on Node 24 for every GitLab push and merge request. It checks formatting and the official-source checksums, runs the 24 solver/API/privacy tests, regenerates the A/B/C schedule evidence, and saves the generated submission files and benchmark as 14-day job artifacts. Browser smoke tests are intentionally local because they require Microsoft Edge.

This checkout currently has only a GitHub remote, so it has no GitLab repository URL to publish. Import this repository into GitLab or add its URL as a remote, then push `main`; the pipeline starts automatically:

```sh
git remote add gitlab https://gitlab.com/your-group/nebula.git
git push -u gitlab main
```

The four-account visibility contract and its server-side enforcement are documented in [docs/TEAM-WORKFLOWS.md](docs/TEAM-WORKFLOWS.md). The GitLab pipeline exercises the same API and privacy checks through `npm test`.

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
| [vercel.json](vercel.json)                                             | Vercel serverless demo routing and packaged assets                                |
| [docs/PLANNER.md](docs/PLANNER.md)                                     | Solver rules, assumptions and current limitations                                 |
| [docs/TEAM-WORKFLOWS.md](docs/TEAM-WORKFLOWS.md)                       | Schedule map, disruptions, worker reports, penalties and supervisor decisions     |
| [docs/SUBMISSION.md](docs/SUBMISSION.md)                               | Deliverables and proposed three-minute demo                                       |
| [docs/CLEANUP.md](docs/CLEANUP.md)                                     | Consolidation decisions and recovery locations                                    |
| [CONTEXT.md](CONTEXT.md)                                               | Current handoff, runbook, feature state and update log                            |

Runtime data stays in `railsync-app/data/` and is ignored by Git. Optional chat configuration is described in the [app guide](railsync-app/README.md).

## Current baseline

All 54 public activities are completed in each scenario with zero internal violations. Internal penalties: A **25.2**, B **30**, C **25.2**. B improves from 44 with no extra track slots. All three public plans reach a mathematical lower bound under the app's weekly model. These are different scenario objectives; compare each plan with its own bound.

The deterministic solver combines multiple scheduling policies, bounded repair and ECLO-window search. The planner includes capacity impact previews, schedule evidence, weekly workload overview, deadline watchlists and planning briefs. Official validator agreement and global optimality on hidden instances remain unverified. The live disposable demo is [nebula-trackwork.vercel.app](https://nebula-trackwork.vercel.app); use Docker with persistent SQLite for durable judging data.

Source: [official PS1 brief](https://github.com/aochinwen/NebulaX-Hackathon-ProblemStatement/tree/966c976005db2e3e40a691cff268fdb8f396a5df/PS1).
