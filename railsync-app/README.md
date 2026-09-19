# Trackwork

A local railway track access planner for NebulaX Problem Statement 1. It imports the eight instance CSVs, builds weekly possession schedules, compares three scenarios and exports the required files.

## Run

Requires Node.js 24 or later. Run `npm ci` in the repository root first to install the server dependencies.

```powershell
cd railsync-app
npm start
```

Open http://127.0.0.1:3001/. On first use, create a planner account. Existing scheduler accounts still work. Data is saved in `data/railsync.sqlite`.

## Use

1. Open **Track planner** and load the example programme or import all eight instance CSV files.
2. Open **Contracts** to review the imported activity types, possession types, weekly access caps, workfront limits and dates.
3. Choose **Build plans**, then compare **Use available access** (A), **Meet target dates** (B), and **Balance access and delays** (C).
4. Inspect the work list, weekly timeline, track capacity and network. Open an activity for its bookings and explanation.
5. Use **Export plan** to download `SCHEDULE_ACCESS.csv`, `SCHEDULE_OCCUPANCY.csv` and `RESULTS.csv` for each scenario. Candidates failing the internal checks cannot export submission CSVs; diagnostic JSON remains available.
6. Use **What-if capacity** to preview a flat supply change at one location. The preview reports changed weeks/ECLO without replacing saved work. **Compare plans** shows the model lower bound and remaining gap.

## Scope

- ALP and BET track locations, independent bounds, H01/H02 interchange handling.
- Contracts and activities from the supplied files, including full workloads and predecessors.
- PM (sole possession), PC (possession master / host) and C (co-worker) are activity access types, not login roles.
- A workfront limit counts concurrent activities. It does not represent a named crew or an individual engineer.
- Flat weekly access caps, physical separation, sharing, location supply, completion dates and scenario-specific ECLO rules.
- Planner accounts, saved plan history and optional questions about the selected plan.

The app includes four role-specific workspaces, worker assignments and issue reports, manager-reviewed penalty points, supervisor emergency decisions, a draggable schedule map with buffers, and validated disruption backup plans. See [team workflows](../docs/TEAM-WORKFLOWS.md). Earlier local records remain in dormant tables; legacy roles are not automatically promoted. The scheduler works in weeks, with manager-selected dates for worker assignments; it does not perform shift or skills optimisation.

## Optional chat

Scheduling works without an API key. In **Settings**, connect an OpenAI or Anthropic key and a model available to that API account. Keys are held only in server memory unless supplied through server environment variables. A restart clears keys entered in Settings.

**Ask a question** sends the imported programme, selected scenario result, message and conversation history for that scenario to the provider. Chat explains results; it cannot modify or approve schedules. Provider quotas and billing apply independently of scheduling.

Supported server variables: `PORT`, `RAILSYNC_DB`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `RAILSYNC_MODEL`. Legacy variable names remain for configuration compatibility.

## Verification and limitations

Run `npm test` for workload/rule checks, import/export persistence, authentication, retired-workflow protection and provider context tests. Provider tests use stubs and do not establish a live paid API connection.

The scheduling engine uses deterministic search passes and validated repair. Public plans reach a mathematical lower bound under the app's model, but hidden-instance global optimality and official validation are not established. See [planner details](../docs/PLANNER.md) and [measured improvements](../docs/IMPROVEMENTS.md).

This app defaults to localhost. [Deployment instructions](../docs/DEPLOYMENT.md) cover HTTPS origins, setup tokens, Docker, and Vercel with Supabase Postgres. Planner accounts share one programme.

Reference: https://github.com/aochinwen/NebulaX-Hackathon-ProblemStatement
