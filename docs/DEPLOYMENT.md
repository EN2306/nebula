# Run locally or behind HTTPS

Node 24+ is required. Install dependencies in the repository root. Local defaults stay at `127.0.0.1:3001`:

```powershell
npm.cmd ci
npm.cmd start
```

`npm.cmd` avoids PowerShell execution-policy restrictions on `npm.ps1`. On Linux/macOS, use `npm`.

## Portable container

From the repository root:

```sh
docker build -t trackwork .
docker run --rm --name trackwork -p 127.0.0.1:3001:3001 -v trackwork-data:/app/data trackwork
```

For a restart-safe local or hosted service, copy `.env.example` to `.env`, set a setup token, then run:

```sh
docker compose up --build -d
docker compose ps
```

The named `trackwork-data` volume keeps accounts, sessions and plans across container replacement. Put an HTTPS reverse proxy in front of port 3001 for remote judging and set `RAILSYNC_PUBLIC_ORIGIN` to the public origin.

For a disposable role-workflow demonstration, set `RAILSYNC_DEMO_ACCOUNTS=true`. It provisions the four public credentials listed in the root README. Do not enable it on an operational host; it creates predictable accounts.

The image runs as the non-root `node` user. The persistent volume holds accounts, sessions and the shared programme. It copies application source and the eight official input files; `.dockerignore` excludes local databases, archives and tests. One application instance owns this SQLite workspace. Planner accounts deliberately share the programme; importing replaces it for everyone.

## Hosted judging setup

Use a host with a persistent disk and an HTTPS reverse proxy. Configure:

| Variable                 | Value                                                                        |
| ------------------------ | ---------------------------------------------------------------------------- |
| `HOST`                   | `0.0.0.0` inside the container; bind the published port to the reverse proxy |
| `PORT`                   | `3001`, or the host's assigned port                                          |
| `RAILSYNC_PUBLIC_ORIGIN` | Exact external HTTPS origin, e.g. `https://trackwork.example.org`; no path   |
| `RAILSYNC_SETUP_TOKEN`   | A long random secret used only to create the first planner account           |
| `RAILSYNC_DB`            | Persistent SQLite path; container default `/app/data/railsync.sqlite`        |

Forward the original public `Host` header. The application accepts only its configured public host and localhost; it checks the browser Origin against the configured HTTPS origin, sets Secure session cookies in hosted mode, and retains CSRF checks. It does not trust arbitrary forwarded-host/protocol headers. Keep the backend port private to the proxy. A hosted instance without a configured setup token refuses first-account creation.

Visit the HTTPS URL, enter the setup token in the first-account form, then create judge accounts in Settings. Remove the setup token from hosting configuration after setup if desired; existing accounts continue to work. Store provider keys in the host secret manager or connect them in Settings. An API key is not required for judging the scheduler.

For direct Node hosting, `.env.example` lists the same options:

```sh
node --env-file=.env railsync-app/server.mjs
```

Before publishing the URL, use a clean browser to import all eight CSVs, solve A/B/C, download all exports, preview a capacity change and confirm data survives a service restart. `/api/health` is available for health checks. Back up SQLite only with a consistent snapshot or with the application stopped; retain WAL files when present.

The live judging URL is https://nebula-trackwork.vercel.app. GitHub and GitLab CI verify formatting, references, application tests, real Postgres persistence/concurrency, results and benchmarks. CI itself does not deploy.

## GitLab CI

The checked-in [`.gitlab-ci.yml`](../.gitlab-ci.yml) uses Node 24 and runs for pushes and merge requests. It verifies formatting and official-source checksums, runs the full application test suite, then produces schedule and benchmark artifacts. It does not contain credentials and does not deploy. Add a GitLab remote and push `main` to activate it for a GitLab project.

## Vercel Docker with Supabase

Vercel builds `Dockerfile.vercel` and routes requests to the `trackwork` container service defined in `vercel.json`. It runs Node 24 on port 80. Configure secrets for the intended environment only; use a separate Supabase project for Preview so preview builds cannot change judging data.

| Variable                 | Purpose                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `SUPABASE_DB_URL`        | Secret Postgres transaction-pooler connection string from Supabase Project > Connect |
| `RAILSYNC_PUBLIC_ORIGIN` | Exact HTTPS deployment URL, including `https://`                                     |
| `RAILSYNC_SETUP_TOKEN`   | Long random value required to create the first account                               |
| `ANTHROPIC_API_KEY`      | Optional Claude key for Ask a question                                               |
| `RAILSYNC_MODEL`         | Optional model override, for example `claude-sonnet-4-6`                             |

When `SUPABASE_DB_URL` is set, accounts, hashed passwords, sessions, workspaces, chat history, team operations and schedule previews live in the private `trackwork` Postgres schema. Startup creates missing tables without deleting existing records. This schema is not exposed through Supabase's public Data API; the browser only calls this app's permission-checked API. TLS verifies the database certificate using Node's trust roots and the bundled public Supabase CA. The app retains its own role/session authentication; these accounts are not Supabase Auth dashboard users.

Mutating requests use database transactions and a shared advisory lock to prevent lost updates across container replicas. Read requests use consistent snapshots. Responses are sent after successful commit. This intentionally serializes programme changes, including solver runs; it suits the shared hackathon workspace but high-throughput multi-tenant operation would need finer-grained locking.

On a fresh deployment, use the setup token to create the first planner, then create other roles through Settings. The owner can optionally provision missing accounts using the server-only `RAILSYNC_INITIAL_ACCOUNTS_JSON` secret (an array of `{name,email,password,role}`); existing accounts are never overwritten. Do not enable public local-demo accounts on the hosted database. Existing local SQLite data is not automatically imported into Supabase; retain its backup and migrate only the records you intend to publish.

Without `SUPABASE_DB_URL`, local hosting uses SQLite and Vercel falls back to disposable `/tmp` storage. A configured but unreachable Supabase database fails startup instead of silently falling back. Verify `/api/health` reports `ok: true`, `hosted: true`, `storage: "supabase"`, and `ephemeral: false` after deployment.

Deploy from the root with `npx vercel login`, then `npx vercel --prod`. Vercel's deployment and production aliases are trusted explicitly by both the Docker entrypoint and the optional `api/index.mjs` adapter; set `RAILSYNC_PUBLIC_ORIGIN` for a custom domain. `.vercelignore` excludes local accounts, databases, archives and secrets. The container installs locked production dependencies and packages the solver, browser assets, certificate and sample CSVs.

To run the Postgres integration test locally, start a disposable Postgres instance, set `TRACKWORK_TEST_DATABASE_URL`, and run `npm test`. Never point that test variable at production; tests create their own accounts and modify the shared programme. Both CI providers supply an isolated Postgres service.

## Google Cloud Run parity

Google Cloud should use the same `Dockerfile.vercel` image and `SUPABASE_DB_URL` secret as Vercel. Cloud Run supplies its own `PORT` value; the container listens on it and uses `HOST=0.0.0.0`. Deploy from a machine authenticated to the target project:

```powershell
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud run deploy trackwork `
  --source . `
  --region YOUR_REGION `
  --platform managed `
  --allow-unauthenticated `
  --set-env-vars RAILSYNC_PUBLIC_ORIGIN=https://YOUR_RUN_URL `
  --set-secrets SUPABASE_DB_URL=SUPABASE_DB_URL:latest,RAILSYNC_SETUP_TOKEN=RAILSYNC_SETUP_TOKEN:latest
```

Create the two Secret Manager secrets before deploying. Do not put the Supabase password, setup token or AI key in source control or a command history. After deployment, verify `/api/health` reports `storage: "supabase"` and `ephemeral: false`, then run `scripts/hosted-smoke.mjs` with the same private account file used for Vercel. A Cloud Run deployment made with any other image or database would not be considered parity with the production Vercel service.

Implementation references: [Node HTTP server](https://nodejs.org/docs/latest-v24.x/api/http.html), [Docker Node.js guide](https://docs.docker.com/guides/nodejs/).
