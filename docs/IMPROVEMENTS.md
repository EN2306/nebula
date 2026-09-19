# Optimisation results

The public instance now reaches a capacity-relaxed mathematical lower bound in all three scenarios **under the app's weekly model**. This is not a certificate from the judges' validator, nor a claim that arbitrary hidden instances are optimally solved.

| Public scenario | Original penalty | Current penalty | Extra slots | ECLO accesses | Lower bound |
| --------------- | ---------------: | --------------: | ----------: | ------------: | ----------: |
| A               |             25.2 |            25.2 |           0 |             0 |        25.2 |
| B               |               44 |              30 |           0 |             6 |          30 |
| C               |             25.2 |            25.2 |           0 |             0 |        25.2 |

B improves by **31.8%**, eliminating two excess location-week slots while meeting all deadlines. Every scenario completes all 54 activities with zero internal hard violations.

## Why the bounds matter

`quality.mjs` relaxes capacity, workfronts, co-sharing conflicts and shared ECLO windows. It retains each activity's start, workload, yield, scenario policy and an optimistic predecessor completion. For each activity it finds the least delay-plus-ECLO cost in this relaxed problem. Summing these costs is a lower bound: adding the removed constraints cannot improve the objective.

For A/C, A036 contributes at least 18.2 and A059 at least 7. For B, their workloads require at least six ECLO accesses in total, costing 30. The generated public plans attain those bounds. This explains why forcing A and C to look different would not improve their scores. A gap above zero on another instance is reported honestly; the lower bound may be loose.

## Changes

- Added dependency-aware search passes, strict-supply alternatives for B/C, bounded ECLO-window exploration and validated local repair. Neutral-cost moves must reduce pressure at an over-capacity location before they can be retained. The best candidate is selected by hard violations, then objective.
- Added explicit schema validation for empty/invalid possession labels, unknown activities, invalid weeks and sequences. Exports reject infeasible results. Sequence checks use chronological order, independent of CSV row order.
- CLI runs retire previous active outputs before parsing the next input, stage new outputs, publish input hashes/status in `RUN.json` and prevent concurrent writers using an exclusive lock. Old outputs remain in ignored `.history/`; interrupted runs remain explicitly `running` or `failed`. After an OS crash, remove `RUN.lock` only after confirming the writer is no longer running.
- Added mathematical bounds, remaining gaps and solve timing to the comparison view; activity dialogs now show final workload, precedence, delay and actual co-sharing evidence.
- Added a capacity what-if preview. It changes one location's flat supply for every week, checks the existing bookings and rebuilds only if needed. Saved inputs/results are untouched. Changes count activity weeks and ECLO, not arbitrary possession labels. Minimum churn is not claimed.
- Added upload preflight validation. The importer checks all eight exact filenames, required and unexpected columns, CSV syntax, file size, row shape and semantic references before replacing the current programme. The UI presents every detected file/column issue together so planners can fix a folder in one pass.
- Added offline risk and handover insights: priority-weighted activity risks, fragile capacity locations, contractor negotiation prompts and a concise handover brief. Natural-language chat remains optional and is constrained to the selected dataset/plan; these core insights do not require an API key.
- Added HTTPS deployment configuration, host/origin checks, Secure cookies, protected first-account setup, a non-root Docker image and GitLab CI.
- Added reproducible benchmarks, upstream-checksum verification and a real-browser smoke script. Removed a quadratic orphan-occupancy scan from validation and bounded repair work as output size grows.

## Benchmark evidence

`npm run benchmark` evaluates eight deterministic cases across A/B/C, including public/reversed input, reduced supply, restricted workfronts, cross-contract chains, zero supply, tight deadlines and 250 activities. These are synthetic tests, not the hidden judging dataset.

Selected improvements against the original solver:

| Case / scenario      | Original penalty | Current penalty |
| -------------------- | ---------------: | --------------: |
| Reduced supply / B   |              100 |              30 |
| Reduced supply / C   |             67.2 |            25.2 |
| Single workfront / C |             1736 |            1026 |
| Zero supply / B      |             5021 |            3917 |
| Tight deadlines / C  |          33298.1 |           32102 |

The 250-activity case completes all 1,250 workload units at zero penalty in A/B/C; its deadlines deliberately leave room to schedule. This does not establish performance at every supported workload size. Impossible candidates remain visible as infeasible, with no submission CSVs. Some congested cases still have a nonzero optimality gap, and the restricted-workfront B case remains infeasible in the current search.

Machine-readable evidence: [current benchmark](../submissions/benchmark.json), [original benchmark](../submissions/baseline-benchmark.json), [public validation](../submissions/public/INTERNAL_VALIDATION.json). Timings depend on hardware; consult the recorded run rather than treating them as performance guarantees.

## Verification and remaining work

All 17 automated tests pass, covering solver mutations, bounds, stress fixtures, CLI stale-output failures, deployment security, authentication, persistence and non-mutating previews. The real-browser smoke test passed account setup, example import, A/B/C solving, the quality table, capacity preview and evidence dialogs, with desktop/mobile screenshots inspected locally. The Docker image built successfully and passed non-root execution, absence of bundled runtime data, import/solve/export and SQLite-reopen checks on Node 24.21.0.

The previously compressed source is now consistently formatted. Prettier is pinned as a development-only dependency; use `npm ci` before `npm run format:check`. The GitLab pipeline runs the same formatting check. Official reference bytes remain unchanged.

Run from the root:

```sh
npm run check:reference
npm test
npm run results
npm run benchmark
# Optional: set BROWSER_BIN to Chromium/Edge/Chrome if not using Windows Edge.
npm run test:browser
```

Remaining competition gates are official-validator access/agreement, a provisioned public HTTPS URL, the GitLab submission and the three-minute video. Geometry interpretation and global optimality on hidden instances remain unverified. See [deployment instructions](DEPLOYMENT.md) and [submission checklist](SUBMISSION.md).

# Programme overview and visual redesign

The planner now opens on a responsive overview with weekly workload bars, a selectable week handover, direct navigation into that week's schedule map and capacity view, and a filterable deadline watchlist. A downloadable Markdown planning brief includes the saved plan reference, scenario tradeoffs, incomplete work, deadline concerns, capacity requests and active disruptions. The interface uses a dark sidebar, green planning accents and a consolidated Planning tools menu.

Risk calculations now retain all activities before aggregating contractors and distinguish incomplete work from a completed activity with a deadline delay. Deadline margin is calculated from the saved schedule and is not a forecast of future disruption.
