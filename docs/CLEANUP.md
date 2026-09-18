# Repository cleanup

The outer `railsync-app/` is canonical. The nested copy had an older README describing the retired crew workflow, less planner metadata, no planning-event migration, and older UI/tests. The solver's scheduling logic was the same. It was preserved locally at `.local/archive/nested-railsync-app/` before removing the duplicate from the source tree.

Other changes:

- Archived the unreferenced retired daily/crew `scheduler.mjs` at `.local/archive/scheduler.mjs`. The active weekly solver is `railsync-app/ps1.mjs`.
- Archived the previous partial official pack at `.local/archive/previous-ps1-reference/` and imported the full current PS1 snapshot into `problem-statement/PS1/`.
- Moved generated results to `submissions/public/` and planner documentation to `docs/PLANNER.md`.
- Updated example-data loaders, tests and CLI output defaults for the new layout.
- Added root start/test/results commands, editor defaults and Git exclusions.
- Removed the active SQLite files and logs from the Git index while keeping them on disk at `railsync-app/data/`. Existing accounts and saved plans are preserved. Their removal is staged; the other changes remain available for review in the working tree.

The archive and runtime data are intentionally local and ignored by Git. Historical copies remain in earlier Git commits; this cleanup does not rewrite history. Stop a running app before copying SQLite data for backup, and preserve its WAL alongside the database.

No solver strategy, UI workflow or hosting policy was changed in this phase. Dense/minified source formatting is deferred to a dedicated mechanical change so that behavioural changes can be reviewed separately.
