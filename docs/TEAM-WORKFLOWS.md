# Team workflows and schedule recovery

## Roles

The database role `scheduler` is displayed as **Planner**. Existing planner accounts keep their access. Existing retired roles are not automatically promoted.

| Role       | Workflow                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Planner    | Import programme, build plans, move bookings, preview disruptions, save validated alternatives, undo edits, send emergency decisions, view team availability.            |
| Supervisor | Oversee programme health, inspect schedules/maps/contracts/risks, preview capacity, export plans, view team reports and history, manage accounts and decide emergencies. |
| Manager    | View operations status and saved schedules/maps/contracts/risks, create workers, assign dated work, arrange replacement cover, review worker reports and assign points.  |
| Worker     | View own assignments, mark confirmed tasks complete, report absence/safety/equipment issues, see own manager decisions and accumulated points.                           |

Planners and supervisors can create all four account roles from Settings / Team accounts. Managers can create workers only. Personal absence explanations and penalty details are visible to the reporting worker, managers and supervisors. Planner availability views contain dates and worker names, not private explanations. Supervisors and managers have read-only planning access enforced by the server. Supervisor capacity previews do not modify saved schedules. Planners edit schedules; managers record worker reviews; supervisors make final emergency decisions.

## Schedule map and edits

Open **Track planner → Schedule map**. The track overview highlights work, safety buffers and additional closures. The grid maps locations to weeks. Filter by line, bound and platforms. Drag a blue work booking into another week, or use **Move booking** on a touch screen or keyboard.

Moves preserve the imported route and change one weekly booking. The full plan is checked for workload, start dates, predecessors, completion rules, location capacity, workfront limits, sharing and exclusion buffers. Preview problems are displayed before saving. A valid preview still requires **Save this plan**. **Undo saved edit** restores the previous plan; the last ten edits across scenarios are retained. Rebuilding or editing invalidates outstanding decisions and worker assignments tied to the earlier plan.

## Disruption backup plans

**What-if disruption / backup plan** models weather, power, equipment or another temporary closure at one location, one line or the whole network for 1–52 weeks. An activity is blocked if its work or safety envelope intersects the closure. Bookings before the first affected week are preserved. The solver rebuilds remaining work under the selected A/B/C policy and reports changed activities, delay, completion and score.

An infeasible result cannot be saved. Change the scenario or incident scope, or send the situation to a supervisor. No claim of a feasible alternative is made when the constraints cannot be met. Adopted closure windows remain attached to the scenario and are enforced when moving, rebuilding and exporting that plan. **What-if capacity** remains a separate preview for a flat capacity change over every week.

The model has weekly time resolution. A one-day incident is conservatively represented by its affected week. It does not simulate weather physics, electrical load, worker skills or shift-level resource availability.

## Worker reports and penalties

Workers use **Report an issue / absence** and choose an affected date, optional task and explanation. Submission adds zero penalty points. A manager reviews the report once, records a reason and assigns 0–10 internal points. Reviewed points accumulate in the worker's visible total. These are not wage deductions. Repeated submissions for the same absence date and duplicate reviews are rejected.

Managers choose the actual work date within a scheduled activity week. A reported absence or another active assignment on the same date blocks assigning that worker. Managers can cancel a task with a reason and assign a replacement. After a schedule change, affected assignment records are flagged for manager reconfirmation; they cannot be marked complete while stale.

## Emergency decisions

**Emergency → Supervisor** sends an urgent request inside this application, linked to the saved scenario version. Supervisor decisions require a reason. A changed plan makes an old request stale and blocks decisions on it. Approval records the supervisor's decision; it does not automatically replace the saved plan. The planner remains responsible for applying a validated change.

Open team screens check for changes every 15 seconds while visible and no form is open. Alerts are in-app, not email, SMS or operating-system push notifications. A supervisor must sign into the workspace to receive them.

## CSV imports

All eight exact filenames are required. The upload guide lists required columns and downloads header templates. Preflight checks missing/extra columns, malformed quoting, duplicate identifiers, required cells, integer ranges, dates, enum values and references between files. Cell errors include file, row and column; semantic geometry checks may additionally report the invalid activity or location. Up to 200 cell errors are returned per attempt. Invalid uploads never replace the saved programme.

## Verification

Run `npm test` for solver, transport, permissions, privacy, penalties, assignment, stale-decision, disruption and CSV checks. Run `npm run test:browser` with Edge installed for desktop/mobile screenshots and actual UI flows. Browser tests use an isolated in-memory database.
