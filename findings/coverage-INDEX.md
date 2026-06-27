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
| [Sentinel Vault](coverage-sentinel-vault.md) | Confluence | page-content-trigger (section restore + validation), rule-eval | realm-console render | artifact/media trigger, scheduled tasks, scan/AI consumers, admin UIs, ribbon, lifecycle | body-protection + validation deep; async/admin untested |
| [CogniRunner](coverage-cognirunner.md) | Jira | workflowValidator (premade rules: 24 cases) | global-page render | AI validator/condition, post-functions, adminPage, llm, async consumer, attachment bridges | premade engine deep; AI paths untested |
| [Altomata](coverage-altomata.md) | Jira | clone (oracle + adversarial), backend-trigger gate | hub render | condition, route-dialog/glance, scheduledTrigger, 8 other registry actions | thin live layer here; app's own Node harness covers the rest deeply |
| [License Leash](coverage-license-leash.md) | Confluence | reactivation webtrigger (rejection paths) | reactivation page render | admin dashboard, banner, 11 activity triggers, sync consumer, all SQL state | revoke path DISABLED-SAFETY; no dev SQL read-hook = biggest blocker |

## Highest-value gaps to close next (cross-app)
1. **License Leash dev SQL read-hook** — without it, activity-tracking, sync, and reactivation
   side-effects can't be asserted. A secret-gated `_testState` returning `user_activity` /
   `deactivation_log` rows would unblock ~20 NONE-GAP modules at once.
2. **Sentinel sealed-MEDIA + artifact-trigger** — the SV-M6 backward-version-walk fix has NO
   live test; seal an attachment, remove it, assert re-insertion + the content-removal notice.
3. **lz-ppm UI panels** (issue-panel, admin-page) — render smokes are cheap and currently absent.
4. **CogniRunner AI paths** — only premade rules are tested; the AI validator/condition/post-fn
   (the app's headline feature) has zero live coverage.
5. **Altomata workflowCondition** on a real transition (validator is deep, condition is smoke).

Found by deepening so far: **SV-NEW-1** (length rules over-counted emoji) and the **License Leash
webtrigger 424** (string-valued headers) — both fixed. See per-app files for the full tables.
