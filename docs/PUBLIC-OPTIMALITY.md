# Public-instance optimality certificate

Run `node scripts/prove-public.mjs` from the repository root. It reads the
current public inputs and submitted CSVs, checks feasibility, enumerates a
relaxed subproblem, and asserts that its lower bound equals the submitted score.
Evidence is written to `submissions/public/OPTIMALITY.json`, outside the ZIPs.

| Scenario | Minimum A036 + A075 cost | Minimum A059 cost | Lower bound | Feasible score |
| -------- | -----------------------: | ----------------: | ----------: | -------------: |
| A        |                     25.2 |                 7 |        32.2 |           32.2 |
| B        |                       20 |                10 |          30 |             30 |
| C        |                     19.1 |                 7 |        26.1 |           26.1 |

A036 needs seven work units from week 22, with deadline week 26 and a delay
weight of 1.3 per day. A075 needs one unit from week 24 with deadline week 28;
its Live closure prevents A036 from working during the same week. A059 needs
seven units from week 14 with deadline week 19 and delay weight 1 per day.

In A, A036's earliest seven normal bookings finish in week 28, costing 18.2.
A075 must then wait until week 29, costing 7. Moving A075 earlier displaces
A036 and costs at least 9.1 more instead. A059 necessarily costs at least 7.

In B, A036 needs at least four ECLO bookings to deliver seven units within five
weeks: cost 20. A059 needs at least two ECLO bookings within six weeks: cost 10.
All other objective terms are nonnegative.

In C, enumeration retains the two-consecutive-week ECLO restriction for each
activity and the A036/A075 weekly exclusion. Their combined minimum is 19.1;
A059's minimum is 7. The enumerator relaxes all other jobs, capacity limits,
workfront limits and shared line ECLO-window alignment, so the minimum cannot
exceed that of the full model. Every omitted objective term is nonnegative.

Only patterns capable of matching or improving the feasible incumbent are
enumerated. Later completions already exceed the incumbent's cost, and bookings
after workload completion cannot improve a nonnegative objective. Feasible
submitted schedules attain the resulting bounds, establishing model optimality.

Scope: this proves the public instance under the corrected internal weekly
closure model. It does not prove agreement with the official validator or
optimality for other datasets. The uploaded ZIPs still require official checking.
