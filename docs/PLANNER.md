# Trackwork track planner

Open http://127.0.0.1:3001 and sign in with your existing scheduler account. Choose **Track planner → Try the example programme → Build plans**. You can instead select all eight original instance CSVs with **Import work files**. Once a programme is loaded, use **Change programme** to import another. A successful new import replaces only the weekly dataset/results; planner accounts remain unchanged.

The three approaches are **Use available access** (A), **Meet target dates** (B), and **Balance access and delays** (C). Use the comparison table to choose an approach, search/filter the work list, open a job for its bookings, switch to the paged weekly timeline, or inspect **Track capacity**. **Export plan** provides the unchanged submission filenames and columns. Automatic checks remain explicitly separate from official validator approval.

The planner saves inputs and generated plans in SQLite. All scheduling runs locally in a worker thread without a paid AI API. Optional chat receives the imported programme and selected scenario only for planner accounts. Legacy non-planner accounts cannot retrieve planner inputs, results or exports.

## Implemented

- Validated eight-file import, duplicate/reference/date/cycle checks, complete activity workloads.
- Weekly planning for A, B and C, including per-contract/type local access-night indices and workfront limits.
- Expanded tunnel/platform work spans; modeled buffers, Live opposite-bound and interchange closures; synchronized possession groups with legal PC/C/PM mixes.
- A forbids excess capacity and ECLO; B makes planned completion hard and scores extra supply/ECLO; C permits one excess slot per location-week and line-specific two-week ECLO windows.
- Deterministic priority/slack and dependency-aware planning passes, strict-supply candidates for B/C, bounded ECLO-window exploration and validated local repair. A capacity-relaxed lower bound quantifies remaining room for improvement under the app's model.
- Separate independent candidate validation, full-workload counts, penalty metrics, expandable activity explanations, contract/week filters, capacity hotspots and completion dates.
- Exact submission CSV filenames/columns, separately for A/B/C. Infeasible candidates remain visible and downloadable as diagnostic JSON; submission CSV exports are blocked.
- A focused light interface for track planning, imported contracts, plan history, questions and settings. Crew rostering and daily shifts have been retired.

## Public results and repeatability

Run `node ps1-cli.mjs` from this app directory to regenerate `../submissions/public/A`, `B`, and `C` plus a shared internal validation JSON. Each scenario directory contains exactly the three required CSV files. Alternatively run `node ps1-cli.mjs <instance-directory> <output-directory>` for an uploaded-style instance. This CLI does not modify the live database.

The bundled public instance has 54 activities, 192 standard workload units, 14 contracts, 76 locations and a 30-week nominal horizon beginning 2027-01-04. Current internal results:

| Scenario | Activities complete | Contract delay days | Extra location-week slots | ECLO accesses | Internal penalty |
| -------- | ------------------: | ------------------: | ------------------------: | ------------: | ---------------: |
| A        |               54/54 |                  21 |                         0 |             0 |             25.2 |
| B        |               54/54 |                   0 |                         0 |             6 |               30 |
| C        |               54/54 |                  21 |                         0 |             0 |             25.2 |

C chooses the strict-supply candidate. All three public plans now attain the computed lower bound under the app's weekly model; this is not official-validator approval. Penalties use different objectives between scenarios and should not be interpreted as an unconditional ranking. See [the bound derivation and benchmark](IMPROVEMENTS.md).

## Interpretation and limits

The repository publishes a brief and sample CSVs, **not runnable validator code**. Trackwork has not passed the judges' validator and does not claim to. The UI and reports state this limitation.

1. Trackwork assigns a synchronized abstract possession label along an activity's entire span. The published sample permits different labels at different locations. Synchronization is a restrictive planning choice and may limit solution quality; equivalence with the hidden validator is unverified.
2. Different labels represent separate abstract nights. Collision checks apply to overlapping exclusion envelopes in the same synchronized slot. Compatible non-Live PC/C and C/C activities are buffer-exempt within that slot, following the brief's co-sharing description. Confirm this interpretation against the actual validator before submission.
3. CSV occupancy lists only actual work locations, matching the public sample. Live mirrored/crossover closures and buffers are checked internally for clashes; they are not extra CSV work rows or capacity charges. A Live exclusion envelope reaching H01/H02 conservatively also closes the other line's interchange.
4. A successor begins no earlier than the week after its predecessor's full completion. Activities receive at most one access per week. Completion is the Sunday ending the final access week.
5. Scenario A/C planning may extend beyond the nominal horizon, using the same flat input supply/caps. Search is bounded at 1,040 weeks; inputs support at most 250 activities, 100 work units per activity, and 1 MB per CSV. A timeout, unsupported input or missing workload is reported, never disguised as a feasible plan.
6. No global night-of-week calendar is supplied. Contract-local `access_night` accounting is kept separate from spatial possession labels. These results are competition planning candidates, not operational dispatch authority.
7. Hidden-instance competitiveness, global optimality, and compatibility with future changes to the brief are not established. Capacity previews preserve a valid baseline when possible and otherwise compare a rebuilt plan; they do not guarantee minimum churn. The preview changes flat supply for every week, not a time-limited disruption.

## Tests

`npm test` runs public-workload and mutated-plan tests plus planner account, retired-route, legacy-data preservation and scenario-scoped chat checks. Checks include deleted workload, missing occupancy, capacity, illegal sharing, planned deadlines, predecessor regression, forbidden ECLO, geometry, malformed inputs, authenticated import/solve/export, CSRF, role restrictions and SQLite persistence. Provider transport tests are stubs; they are not a paid live API test.

## Data provenance

Reference: https://github.com/aochinwen/NebulaX-Hackathon-ProblemStatement

Pinned public repository commit: `966c976005db2e3e40a691cff268fdb8f396a5df`. Original files are in `../problem-statement/PS1/`; checksums are in `../problem-statement/provenance.json`. The supplied sample is preserved separately and is never presented as Trackwork output.

## Deployment status

Localhost is the default. The build supports a configured HTTPS origin, Secure cookies, protected first-account setup and a non-root Docker image. See [deployment instructions](DEPLOYMENT.md). It is not yet the publicly hosted judging URL; a persistent host and external HTTPS endpoint still need provisioning.
