# Coverage matrix — lz-ppm (LeanZero Management, Jira PPM)

Module × live behaviour × asserting spec (in `scenarios/lz-ppm/`) × rating. See [INDEX](coverage-INDEX.md).

| Module (key) | Type | Live platform behaviour | Asserting spec | Coverage |
|---|---|---|---|---|
| ppm-dashboard | jira:globalPage | Renders the plan dashboard in a Forge iframe | `dashboard.spec.ts` | SMOKE |
| ppm-issue-panel | jira:issuePanel | Position panel on the issue view | — | NONE-GAP |
| ppm-admin-settings | jira:adminPage | Field-mapping / calendar / protection config UI | — | NONE-GAP |
| ppm-hourly-refresh → onScheduledRefresh | scheduledTrigger | Hourly per-plan re-index from sources | `scheduled-refresh.spec.ts` (B1 preserves Duration, B2 keeps descendants) via the real `refreshOnePlan` | DEEP |
| ppm-issue-guard → onIssueUpdated | trigger `avi:jira:updated:issue` | Incremental per-plan issue update | `incremental-update.spec.ts` (M11 cross-plan dependency preserved) | DEEP |
| resolver / calc engine | function | `recalculateFullPlan`: cascade, parent-rollup, working-days, write-back | `cascade.spec.ts` (7 oracle fixtures vs the app's own cascade-core), `cascade-pathological.spec.ts` (M5/M6 clamp), `recalc-robustness.spec.ts` (M8 malformed-date), `working-days.spec.ts`, `index-fields.spec.ts` (M10), `cycle-robustness.spec.ts` (cycle settles), `diamond-cascade.spec.ts` (merges past the later predecessor) | DEEP |
| ppm-index-consumer | consumer (queue) | Async indexing pipeline (discover→transform→shard) | exercised synchronously via `createFixture`; async/queue semantics not asserted | SMOKE |
| ppm-llm | llm | Claude plan insights | — | NONE-GAP |
| harness-test-state | webtrigger (dev) | `fieldConfig/plans/plan/settle/refreshPlan/incrementalUpdate/createFixture/applyEdit/deleteFixture` | the test harness itself (all specs) | infra |

**Dev hook actions** (gated by `HARNESS_SECRET`): `settle` (runs the real engine), `refreshPlan`
(runs the real `refreshOnePlan`), `incrementalUpdate` (runs the real `incrementalUpdateIssue`),
`createFixture`/`applyEdit`/`deleteFixture` (deterministic plan build/edit/teardown). These let the
deep specs assert the backend without driving the fragile Gantt UI.

## Gaps → covering test
- **ppm-issue-panel** (NONE): deep-link/host an issue from a plan, assert the panel renders the
  position (dates/hierarchy/status). Cheap render smoke.
- **ppm-admin-settings** (NONE): render the admin page, assert the field-mapping/calendar controls.
- **ppm-llm** (NONE): invoke the insight path, assert a non-error response.
- **ppm-index-consumer** (SMOKE→DEEP): build a >SHARD_SIZE plan, poll plan meta, assert shards
  populate asynchronously and shard housekeeping (m2/m3/M9 fixes) holds at the boundary.

## What IS covered exhaustively
The backend **calculation engine** (cascade, parent-rollup, working-days, inverted-bar clamp,
malformed-date robustness, cycle handling) and the two **product triggers** (hourly refresh,
issue-updated) — all asserted against live oracles. 13 of the 14 fixed bugs originated here and
are now regression-guarded.
