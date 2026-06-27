# Coverage matrix — Altomata (Jira automation)

Module / registry-action × live behaviour × asserting spec (in `scenarios/altomata/`) × rating.
See [INDEX](coverage-INDEX.md).

> **Scope note:** this table is THIS harness only. Altomata also ships its own deep Node
> test-harness (`~/Projects/Altomata/test-harness/scripts/*.mjs`) that covers the validator,
> promote (cross-site), dispatch concurrency, AI assist, bulk/templated/fieldSync, etc. The
> forge-live-harness is the **live-UI + REST-oracle** layer on top of that.

| Module / action (key) | Type | Live platform behaviour | Asserting spec (this harness) | Coverage |
|---|---|---|---|---|
| altomata-hub | jira:globalPage | Automations hub UI | `render-smoke.spec.ts` (`.hub-wrap`) | SMOKE |
| altomata-backend-trigger | webtrigger | Secret-gated `{actionKey,params}` / `{probe}` dispatch | gate exercised by every spec; rejection of unknown action in `clone-adversarial.spec.ts` | FULL (gate) |
| clone (action) | registry action via issueAction `altomata-clone` | Copy issue → Cloners link + comment + stamp | `clone-oracle.spec.ts` (REST oracle: copy exists, linked, typed, commented) + `clone-adversarial.spec.ts` (bad project/source/type/params/action all graceful) | DEEP |
| altomata-validator | jira:workflowValidator | Block a transition on rule failure | — *(covered in the app's own harness)* | NONE-GAP (here) |
| altomata-condition | jira:workflowCondition | Hide a transition on rule failure | — | NONE-GAP |
| altomata-route-dialog | jira:issueAction | Route/dispatch an issue to a category→project | — | NONE-GAP |
| altomata-route-glance | jira:issueContext | Right-rail routing toggles | — | NONE-GAP |
| altomata-schedule-tick → scheduler | scheduledTrigger | Per-rule cadence fan-out | — *(scheduleDigest probed in app harness)* | NONE-GAP (here) |
| dispatch / promote / bulkTransition / templatedCreate / fieldSync / provisionProject / scheduleDigest | registry actions | Routing, cross-site config promote, bulk ops, templated create, field sync, project provision, read-only digest | — *(covered in the app's own Node harness)* | NONE-GAP (here) |
| altomata-llm | llm | 11 Forge-LLM assist features | — *(covered in app harness `smoke-ai.mjs`)* | NONE-GAP (here) |

## Gaps → covering test (to add to THIS harness)
1. **altomata-validator on a real transition** (NONE here): attach the validator to a throwaway
   workflow transition, fire it, assert block/allow (mirror the app harness's `validator-live.mjs`
   but as a Playwright/REST spec for CI parity).
2. **altomata-condition** (NONE): attach a condition, assert the transition is hidden when it
   evaluates false (poll the transition list via REST).
3. **route-dialog / route-glance** (NONE): drive the routing issueAction via the webtrigger
   `dispatch` action + REST-verify the linked ticket; render the glance.
4. **Other registry actions** via the webtrigger (`bulkTransition`, `fieldSync`, `templatedCreate`,
   `provisionProject`): adversarial-input specs like `clone-adversarial`, REST-verifying effects.
5. **scheduledTrigger cadence** (NONE): drive `scheduleDigest` via the webtrigger and assert the
   runlog entry.

## What IS covered (here)
The **clone** action end-to-end (happy path + 5 adversarial inputs, all graceful) and the
**backend-trigger secret gate**, plus the **hub** render. The clone error handling was confirmed
robust (HTTP 422 + `{ok:false,error}` for every bad input). No Altomata bug found by this harness.
