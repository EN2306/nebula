# Submission readiness

The [official brief, section 4](../problem-statement/PS1/PS1_README.md) requires four deliverables:

| Deliverable                | Current state                                                 | Completion check                                                                                                         |
| -------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Public test results        | A/B/C CSVs in `submissions/public/`; internal report included | Regenerate from final code; validate with official tooling when available; each scenario has exactly three required CSVs |
| Hosted live web app URL    | Docker and HTTPS configuration ready; public URL outstanding  | External judge can import an unseen eight-file instance, solve, inspect and export                                       |
| Three-minute YouTube video | Outstanding                                                   | Accessible link showing real workflow and trade-offs                                                                     |
| GitLab repository URL      | Outstanding in this workspace                                 | Publish complete source, setup instructions and references; verify from a fresh clone                                    |

## Proposed three-minute demonstration

- **0:00–0:20:** State the planner's decision: complete all works while respecting safety and choosing a delay/access trade-off.
- **0:20–0:45:** Import the eight CSV files and show counts, dates and workfront/access limits.
- **0:45–1:20:** Build A/B/C and explain delays, additional access and ECLO using the comparison.
- **1:20–2:00:** Inspect one late activity, its weekly timeline and a capacity bottleneck. Distinguish internal checks from official acceptance.
- **2:00–2:35:** Show a capacity what-if preview and the count of changed activities. Explain that supply changes apply to every week and the saved plan is untouched. Show the model lower bound and distinguish it from official validation.
- **2:35–3:00:** Export all three scenario packages and show the hosted import workflow and reproducible results.

Before final packaging, run `npm test` and `npm run results`, confirm the pinned input checksums, and test the hosted workflow in a clean browser. Runtime databases, logs and `.local/` archives do not belong in the submitted source. Existing Git history still contains previously committed local data; assess the publication copy before making it public.
