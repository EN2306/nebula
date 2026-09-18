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

Implementation references: [Node HTTP server](https://nodejs.org/docs/latest-v24.x/api/http.html), [Docker Node.js guide](https://docs.docker.com/guides/nodejs/).
