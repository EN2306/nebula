# Run locally or behind HTTPS

Node 24+ is required. Scheduling has no npm dependencies. Local defaults stay at `127.0.0.1:3001`:

```powershell
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

The Docker image was built and smoke-tested locally for non-root execution, import/solve/export and SQLite persistence across application reopen. The GitLab pipeline verifies formatting, references, tests, results and benchmarks. It does not deploy or publish automatically. No live judging URL has been provisioned by this repository change.

## GitLab CI

The checked-in [`.gitlab-ci.yml`](../.gitlab-ci.yml) uses Node 24 and runs for pushes and merge requests. It verifies formatting and official-source checksums, runs the full application test suite, then produces schedule and benchmark artifacts. It does not contain credentials and does not deploy. Add a GitLab remote and push `main` to activate it for a GitLab project.

## Vercel demo deployment

The repository includes a Vercel serverless entrypoint and rewrite in `api/index.mjs` and `vercel.json`. Import the repository into Vercel with the project root unchanged, then set these environment variables for Preview and Production:

| Variable                 | Purpose                                                  |
| ------------------------ | -------------------------------------------------------- |
| `RAILSYNC_PUBLIC_ORIGIN` | Exact HTTPS deployment URL, including `https://`         |
| `RAILSYNC_SETUP_TOKEN`   | Long random value required to create the first account   |
| `ANTHROPIC_API_KEY`      | Optional Claude key for Ask a question                   |
| `RAILSYNC_MODEL`         | Optional model override, for example `claude-sonnet-4-6` |

Vercel's function filesystem is ephemeral, so the adapter defaults to `/tmp/railsync.sqlite`. Each function instance has its own database: accounts, sessions and plans may reset or differ between requests, not just redeploys. The UI labels this as a temporary demo. `RAILSYNC_DB` accepts a local file path; it cannot connect to a remote database. Durable multi-user judging requires the Docker deployment above or a future remote database adapter. After deployment, open the URL, enter the setup token, create the planner account, load the sample or upload the eight CSVs, and confirm `/api/health` reports `hosted: true`.

Deploy from the root with `npx vercel login`, then `npx vercel --prod`. Node 24 is selected using `package.json` engines, following [Vercel's Node version configuration](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions). The function bundles all solver modules, browser assets and sample CSVs and allows 120 seconds so the solver's own 60-second timeout can return a useful error. Vercel's provided deployment and production URLs are allowed automatically; set `RAILSYNC_PUBLIC_ORIGIN` for a custom domain. Local accounts, databases, archives and secrets are excluded by `.vercelignore`.

Implementation references: [Node HTTP server](https://nodejs.org/docs/latest-v24.x/api/http.html), [Docker Node.js guide](https://docs.docker.com/guides/nodejs/).
