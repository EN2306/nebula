# RailSync PS1 planner

Open http://127.0.0.1:3001 and sign in with your existing scheduler account. Choose **PS1 planner → Load challenge dataset → Generate all three scenarios**. You can instead select all eight original instance CSVs with **Upload 8 CSV files**. A successful new import replaces only the PS1 dataset/results; the daily coordination workspace and its accounts remain separate.

The planner saves inputs and generated plans in SQLite. All scheduling runs locally in a worker thread without a paid AI API. Optional chat receives PS1 summary/diagnostics only for scheduler accounts. Requester and engineer accounts cannot retrieve PS1 inputs/results or exports.

## Implemented

- Validated eight-file import, duplicate/reference/date/cycle checks, complete activity workloads.
- Weekly planning for A, B and C, including per-contract/type local access-night indices and workfront limits.
- Expanded tunnel/platform work spans; modeled buffers, Live opposite-bound and interchange closures; synchronized possession groups with legal PC/C/PM mixes.
- A forbids excess capacity and ECLO; B makes planned completion hard and scores extra supply/ECLO; C permits one excess slot per location-week and line-specific two-week ECLO windows.
- Three deterministic priority/slack planning passes. C also compares a strict-supply baseline. This is a greedy heuristic, not a global optimum certificate.
- Separate independent candidate validation, full-workload counts, penalty metrics, expandable activity explanations, contract/week filters, capacity hotspots and completion dates.
- Exact submission CSV filenames/columns, separately for A/B/C. Infeasible candidates remain visible and downloadable as diagnostic JSON; submission CSV exports are blocked.
- Responsive dark planner UI; all existing request/engineer/team/account workflows retained.

## Public results and repeatability

Run `node ps1-cli.mjs` from this app directory to regenerate `ps1-results/A`, `B`, and `C` plus a shared internal validation JSON. Each scenario directory contains exactly the three required CSV files. Alternatively run `node ps1-cli.mjs <instance-directory> <output-directory>` for an uploaded-style instance. This CLI does not modify the live database.

The bundled public instance has 54 activities, 192 standard workload units, 14 contracts, 76 locations and a 30-week nominal horizon beginning 2027-01-04. Current internal results:

| Scenario | Activities complete | Contract delay days | Extra location-week slots | ECLO accesses | Internal penalty |
|---|---:|---:|---:|---:|---:|
| A | 54/54 | 21 | 0 | 0 | 25.2 |
| B | 54/54 | 0 | 2 | 6 | 44 |
| C | 54/54 | 21 | 0 | 0 | 25.2 |

C chooses the strict-supply candidate because its internal combined penalty is lower than the generated elastic candidates. Identical A/C results are allowed; this does not prove no better balanced plan exists. Penalties use different objectives between scenarios and should not be interpreted as an unconditional ranking.

## Interpretation and limits

The repository publishes a brief and sample CSVs, **not runnable validator code**. RailSync has not passed the judges' validator and does not claim to. The UI and reports state this limitation.

1. RailSync assigns a synchronized abstract possession label along an activity's entire span. The published sample permits different labels at different locations. Synchronization is a restrictive planning choice and may limit solution quality; equivalence with the hidden validator is unverified.
2. Different labels represent separate abstract nights. Collision checks apply to overlapping exclusion envelopes in the same synchronized slot. Compatible non-Live PC/C and C/C activities are buffer-exempt within that slot, following the brief's co-sharing description. Confirm this interpretation against the actual validator before submission.
3. CSV occupancy lists only actual work locations, matching the public sample. Live mirrored/crossover closures and buffers are checked internally for clashes; they are not extra CSV work rows or capacity charges. A Live exclusion envelope reaching H01/H02 conservatively also closes the other line's interchange.
4. A successor begins no earlier than the week after its predecessor's full completion. Activities receive at most one access per week. Completion is the Sunday ending the final access week.
5. Scenario A/C planning may extend beyond the nominal horizon, using the same flat input supply/caps. Search is bounded at 1,040 weeks; inputs support at most 250 activities, 100 work units per activity, and 1 MB per CSV. A timeout, unsupported input or missing workload is reported, never disguised as a feasible plan.
6. No global night-of-week calendar is supplied. Contract-local `access_night` accounting is kept separate from spatial possession labels. These results are competition planning candidates, not operational dispatch authority.
7. Hidden-instance competitiveness, optimality, and compatibility with future changes to the brief are not established. Dynamic minimal-churn disruption planning, official validator integration and public deployment remain future work.

## Tests

`npm test` runs the existing workflows plus PS1 public-workload and mutated-plan tests. Checks include deleted workload, missing occupancy, capacity, illegal sharing, planned deadlines, predecessor regression, forbidden ECLO, geometry, malformed inputs, authenticated import/solve/export, CSRF, role restrictions and SQLite persistence. Provider transport tests are stubs; they are not a paid live API test.

## Data provenance

Reference: https://github.com/aochinwen/NebulaX-Hackathon-ProblemStatement

Pinned public repository commit: `16526c02579c7f37e54eaaa42a4cc6d4ceb19994`. Original files and provenance are in `ps1-reference/`. The supplied sample is preserved separately and is never presented as RailSync output.

## Deployment status

This build listens on localhost only. It is not yet the publicly hosted judging URL. Public deployment requires a persistent Node 24+ host, HTTPS, configured allowed origins/hostnames, secure cookies, and deployment-specific account setup. Never package the local `data/` database or API secrets as submission source.
