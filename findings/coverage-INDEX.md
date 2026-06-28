# forge-live-harness — platform-coverage matrix (INDEX)

Per-app matrices of **every `manifest.yml` module × its live platform behaviour × the asserting
spec in THIS harness × a coverage rating**. Scope = what `forge-live-harness` itself drives live
(some apps, e.g. Altomata, also carry their own separate Node test-harness — noted where relevant).

Coverage ratings:
- **FULL** — the module's contract is asserted live end-to-end (multiple paths / oracle).
- **DEEP** — a real behaviour is driven + verified against a live oracle (REST/engine/trigger outcome).
- **SMOKE** — only proven to render / respond, no behavioural assertion.
- **NONE-GAP** — no spec drives it.
- **DISABLED-SAFETY** — intentionally not exercised live (License Leash revoke path).

## Scoreboard (this harness)

| App | Product | FULL/DEEP | SMOKE | NONE-GAP | Notes |
|---|---|---|---|---|---|
| [lz-ppm](coverage-lz-ppm.md) | Jira | calc engine, scheduled-refresh, incremental-update, cascade | dashboard render | issue-panel, admin-page, llm, index-consumer(async) | engine covered exhaustively; UI panels untested |
| [Sentinel Vault](coverage-sentinel-vault.md) | Confluence | page-content-trigger (section + **media** restore + validation), rule-eval | realm-console render | artifact-trigger (attachment events), scheduled tasks, scan/AI consumers, admin UIs, ribbon, lifecycle | body-protection (section+media) + validation deep; async/admin untested |
| [CogniRunner](coverage-cognirunner.md) | Jira | workflowValidator (premade: 24 cases), **static post-function** | global-page render | AI validator/semantic (non-deterministic), condition (UI-only, REST bypasses), adminPage, llm, async, attachment bridges | premade + static-PF deep; AI eval + condition are platform/determinism-limited |
| [Altomata](coverage-altomata.md) | Jira | clone (oracle + adversarial), backend-trigger gate | hub render | condition, route-dialog/glance, scheduledTrigger, 8 other registry actions | thin live layer here; app's own Node harness covers the rest deeply |
| [License Leash](coverage-license-leash.md) | Confluence | reactivation webtrigger (rejection), **activity-tracking + SQL state (via new dev read-hook)** | reactivation page render | admin dashboard, banner, sync pipeline phases, admin-resolver queries | revoke path DISABLED-SAFETY; SQL read-hook now CLOSED the activity gap |

## Highest-value gaps to close next (cross-app)
1. ✅ **DONE — License Leash dev SQL read-hook.** A secret-gated read-only `licenseleash-test-state`
   webtrigger now exposes counts/schema/activity/deactivationLog/config; `sql-activity.spec.ts`
   asserts the 8 tables + the activity-tracking pipeline live. (Next on that app: sync-pipeline
   phases + admin-resolver queries via the same hook.)
2. ✅ **DONE — Sentinel sealed-MEDIA restore + SV-M6.** `sealed-media.spec.ts` seals a real
   attachment, removes the media, and asserts re-insertion — incl. from several versions back
   (the backward walk). Still open: the attachment-EVENT path (`artifact-trigger` trash/delete).
3. **lz-ppm UI panels** (issue-panel, admin-page) — render smokes are cheap and currently absent.
4. ~~CogniRunner~~ — **static post-function now DEEP**; the AI validator/semantic paths are
   non-deterministic (LLM at runtime) and the **condition is UI-only (REST `doTransition` bypasses
   Forge conditions)** — both platform/determinism-limited, not simple gaps.
5. **Altomata workflowCondition** — likely the SAME platform limitation as CogniRunner's (REST
   bypasses Forge conditions); the validator is the deep path and is covered in Altomata's own harness.
6. **Sentinel scheduled tasks** (expiry-sweep) / **License Leash sync** — need a dev *trigger* hook
   (the existing hooks only read). This is the next infra unlock for the async/scheduled tier.

Found by deepening so far (all fixed): **SV-NEW-1** (length rules over-counted emoji), **SV-NEW-2**
(SV-m5 over-excluded expands), and the **License Leash webtrigger 424** (string-valued headers).
Platform facts learned: Forge workflow **conditions** are UI-visibility-only (not REST-enforced).
See per-app files for the full tables.
