# Coverage matrix — Sentinel Vault (Confluence content-protection)

Module × live behaviour × asserting spec (in `scenarios/sentinel-vault/`) × rating. See [INDEX](coverage-INDEX.md).

| Module (key) | Type | Live platform behaviour | Asserting spec | Coverage |
|---|---|---|---|---|
| page-content-trigger | function on `avi:confluence:(updated\|created):page` | Body-protection pipeline: (A) sealed-section restore, (B) sealed-media restore, (C) validation advisory/gate/revert | `validation.spec.ts` (advisory + hard-revert), `validation-eval.spec.ts` (18 rule-eval cases incl. SV-NEW-1 emoji), `sealed-section.spec.ts` (tamper-restore, SV-m6 anchor, SV-M5 re-baseline, expiry-inert), `gate-revert.spec.ts` (SV-m2), `revert-destructive.spec.ts` (SV-M1) | FULL (section + validation) |
| sentinel-vault-sealed-section | macro (bodiedExtension) | Wraps a sealed section; tamper → restore | `sealed-section.spec.ts`, `validation-eval.spec.ts` | DEEP |
| sentinel-vault-panel | macro | Inline seal-status panel | built into rule-eval ADF; not driven as a macro | SMOKE |
| realm-console | confluence:spacePage | Space-level seal admin console | `realm.spec.ts` (render smoke) | SMOKE |
| steward-console | confluence:globalSettings | Global policy/settings admin UI | — | NONE-GAP |
| sentinel-vault-ribbon | confluence:pageBanner | Seal/validation notification banner | — | NONE-GAP |
| artifact-trigger | function on `avi:confluence:(updated\|trashed\|deleted):attachment` | Sealed-media revert, trash restore, deleted-seal cleanup | — | **NONE-GAP** (the SV-M6 backward-walk fix has no live test) |
| expiry-sweep-task | scheduledTrigger (hour) | Seal-expiry notices + halfway reminders | — | NONE-GAP |
| recurring-nudge-task | scheduledTrigger (day) | Periodic reminders for long-held seals | — | NONE-GAP |
| seal-index-cron-fn | scheduledTrigger (hour) | Enqueue realm scans on changed seals | — | NONE-GAP |
| realm-scan-consumer-fn | consumer (realm-audit-queue) | Build the space-protection index | — | NONE-GAP |
| ai-validation-fn | consumer (ai-validation-queue) | Forge-LLM content validation → findings comment | — | NONE-GAP |
| lifecycle-trigger | function on `avi:forge:(installed\|uninstalled):app` | Uninstall KVS cleanup | — | NONE-GAP |
| sentinel-vault-llm | llm | Atlassian-hosted Claude for AI rules | — | NONE-GAP |
| harness-test-state | webtrigger (dev) | KVS get + dev set/delete | all specs | infra |

## Gaps → covering test (priority order)
1. **Sealed-media / artifact-trigger** (NONE, high): seal an attachment, remove the media block,
   assert it is re-inserted and a `content-removal` notice posts (exercises the SV-M6 fix live);
   then trash a sealed attachment and assert restore. **The one fixed bug with zero live coverage.**
2. **expiry-sweep-task** (NONE, high): create a seal with `expiresAt` in the past, invoke the sweep
   (a dev hook to trigger it), assert the expiry-notified dedup flag + dispatch event.
3. **seal-index-cron / realm-scan consumer** (NONE): seed seals, run the cron, assert the realm
   index the admin console reads from is built.
4. **steward-console / ribbon** (NONE): render smokes (cheap).
5. **ai-validation** (NONE): enqueue an AI validation, assert the findings comment.

## What IS covered
The **page-content trigger** (the core protection pipeline) is covered FULL across section restore,
all validation modes (advisory/gate/revert), and 18 adversarial rule-eval cases. SV-M1/M2/M3/M4/M5,
SV-m2/m4/m5/m6 and SV-NEW-1 all originated here and are regression-guarded. The **scheduled tasks,
async consumers, attachment path, and admin UIs are the coverage frontier.**
