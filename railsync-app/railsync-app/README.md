# Trackwork — maintenance planning workspace

The interface has been redesigned with a light workspace and plain-language navigation. Sign in as a planner and open **Track planner**. Use **Try the example programme** or **Import work files**, then **Build plans**. Compare the approaches, review jobs in the searchable work list or weekly timeline, and choose **Export plan**. The A/B/C scenario codes remain in exports and scoring details. Existing accounts, data and solver rules are retained.

See [PS1-PLANNER.md](PS1-PLANNER.md) for the challenge rules, public results and solver limitations. Scheduling works without an AI key; the optional assistant is configured separately.

## Start

Requires Node.js 24 or later (already available on the computer used to build this app). No dependency installation is needed.

From this folder:

```powershell
npm start
```

Open **http://127.0.0.1:3001**. For easy reopening, double-click **Open RailSync.cmd** in this folder. It checks whether the server is running, starts it in the background if needed, and opens your browser. It also works after a computer restart. The local server must be running for the page to load; reopening the URL alone cannot start it.

Create the first scheduler account using your own name, email and password (minimum 12 characters). Email is a login identifier; this local app sends no email. There are no default passwords or fake role switches.

## A complete demonstration

1. **Scheduler:** create your account. On an empty date, optionally load six illustrative requests, or create real requests through the form.
2. **Teams:** create a requester account and engineer accounts. Assign engineers to Alpha/Charlie (Track), Bravo (Electrical), or Delta (Signals), based on verified qualifications.
3. **Requester:** sign in, submit a request with duration, setup, clearance, sector, required skill and readiness. Requests remain in the queue until scheduled.
4. **Scheduler:** generate two alternatives and review changes and deferrals. Approve a proposal to save assignments and notify affected users.
5. **Engineer:** sign in, set availability, view the assigned team's work, acknowledge it, start work, report a delay with a reason, and mark work completed.
6. **Scheduler:** inspect conflicts from the delay or team absence, keep confirmed work locked, and generate a revised proposal. Acknowledged work can be explicitly unlocked by the scheduler; active/completed work remains fixed.
7. Use **Activity** to inspect saved decisions and notifications. Deferred requests retain their reason and deferral count and can be carried forward to a later date, subject to dependency checks.

Use separate browser profiles or a private window for concurrent roles. Tabs in the same browser profile share the same login. Shared work views refresh every 10 seconds. Forms and open dialogs are not replaced during refresh; stale proposals are rejected by the backend.

## Connect real AI

In the scheduler portal, open **Settings**:

1. Select OpenAI or Anthropic.
2. Enter a compatible model ID available to your API account.
3. Paste the API key into the password field and save.
4. Click **Test live connection**. This makes a small billable provider request. A verified badge appears only after a successful response.
5. Use **AI assistant** for contextual advice or **New request → Draft fields** for AI-assisted request intake.

The key is held in server memory only. It is not put in browser storage, responses, logs, or SQLite. Re-enter it after restarting. Alternatively, provide `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` and `RAILSYNC_MODEL` as environment variables when starting the server. Do not commit keys or paste them into conversation history.

The adapter uses OpenAI's Responses API or Anthropic's Messages API. OpenAI defaults to `gpt-4.1-mini`; the Claude suggested ID is editable. A model's availability depends on your account. API authentication, quota and network errors are shown as errors, not substituted with canned AI replies.

Chat sends the signed-in user's authorized selected-date job/constraint snapshot and their recent conversation to the configured provider. Request drafting sends the description and authorized context. Chat is advisory: it cannot bypass roles, alter bookings, or approve proposals. Extracted drafts must be reviewed and submitted through the validated form.

**Live AI status at delivery:** no user API key was supplied, so an actual provider call could not be verified. Provider request formatting, response parsing, failure handling, private history and draft integration were tested with explicitly mocked transport; these tests are not a claim of a live AI connection.

## What persists

`data/railsync.sqlite` stores accounts with salted scrypt password hashes, sessions, worker profiles, requests, assignments, proposals, history and notifications. Do not publish the data directory. Stop the app before backing up the data directory so the SQLite database and write-ahead log are consistent. Source is separate from runtime data.

The server binds only to `127.0.0.1`. It enforces role and record access, HTTP-only SameSite session cookies, CSRF checks, request-origin checks, request-size limits, optimistic version checks, and input validation. A secret is never required to use the scheduling workflows.

## Scheduling rules implemented

- Six-hour engineering window, 00:00–06:00 SGT, in 15-minute increments.
- Track-sector exclusivity, crew exclusivity, required team qualification.
- Setup + task + clearance all reserve time.
- Shared-zone incompatibility between power isolation and live testing.
- Preceding-job dependencies and readiness checks.
- Team absences and the intersection of linked members' availability.
- Worker preferred starts as soft preferences, not mandatory matches.
- Locked, acknowledged, active and completed work preserved during automatic replanning.
- Priority-weighted deferral penalties; explicit unscheduled/deferred results.
- Final server-side revalidation before approval, plus rejection of stale proposals.

The optimizer is a bounded beam search implemented in JavaScript. It does **not** use OR-Tools or a trained ML model, and it does not guarantee the global optimum or prove infeasibility. Two policies favour stability or earlier starts; they may return identical solutions. The local planner supports up to 35 requests per date.

## Validation

```powershell
npm test
```

Tests exercise real HTTP routes and SQLite: account creation/login, invalid credentials, unauthorized roles and record access, request intake, proposal generation, approval, stale versions, acknowledgment, work start/delay/completion, persistence, unavailable teams, readiness deferral, carry-forward, dependencies and API adapter behavior. Browser QA additionally verified account creation, loading sample requests, conflict display, alternatives and successful approval.

## Boundaries

This is a functional local hackathon MVP, not a railway-certified dispatch system. The sectors and qualification rules are illustrative configuration. It does not implement operator work-authority procedures, detailed access protection, rest/fatigue policies, travel routing, parts inventory, recurring work generation, evidence file uploads, external notifications, password recovery or multi-device hosting. Notes can record issue evidence as text. Do not use chat output as operational work authority.

For remote team deployment, the next engineering step is HTTPS hosting, managed secrets, account recovery, backups and operator-approved scheduling rules. The current app deliberately remains local; a file link alone cannot host its database and API server.

API references used:
- https://developers.openai.com/api/docs/models/gpt-4.1-mini
- https://developers.openai.com/api/reference/resources/responses/methods/create
- https://platform.claude.com/docs/en/api/messages/create
