# Coverage matrix — License Leash (axpo-license-manager, Confluence license enforcement)

Module × live behaviour × asserting spec (in `scenarios/license-leash/`) × rating. Tested on the
**wolfaenpak** testbed. See [INDEX](coverage-INDEX.md).

| Module (key) | Type | Live platform behaviour | Asserting spec | Coverage |
|---|---|---|---|---|
| reactivation-page-confluence | confluence:globalPage | Self-service status / reactivation page | `render-smoke.spec.ts` (renders + bootstraps SQL via `ensureMigrations`) | SMOKE |
| reactivation-webtrigger → handleWebReactivation | webtrigger | HMAC-gated reactivation link | `webtrigger-token.spec.ts` (missing→400, forged→rejected) — **found+fixed the 424 header bug** | DEEP (rejection paths) |
| license-manager-admin | confluence:globalSettings | Admin dashboard (gauge, users, audit, config) | `admin-render.spec.ts` (renders in its Forge iframe via /wiki/admin/forge/apps/{uuid}/{env}/license-manager-admin) | SMOKE |
| reactivation-banner | confluence:pageBanner | Suspended-access banner on every page | — | NONE-GAP |
| on-page-created / -updated / -viewed / -liked, on-comment-created/-liked, on-blogpost-activity/-viewed, on-attachment-activity, on-whiteboard-created, on-database-created (×11) | trigger | Record `user_activity` (debounced) | `sql-activity.spec.ts` (a real page event records the actor in `user_activity` via the dev read-hook) | DEEP |
| run-migrations → runMigrations | scheduledTrigger (day) | Provision/evolve the 8 SQL tables | `sql-activity.spec.ts` (all 8 tables present + user_activity schema asserted) | DEEP |
| licenseleash-test-state → testState | webtrigger (dev) | READ-ONLY SQL hook: counts/schema/activity/deactivationLog/config | the harness itself (`sql-activity.spec.ts`) | infra |
| daily-inactivity-check → checkInactivity | scheduledTrigger (day) | Revoke licenses of inactive users | `reactivation-flow.spec.ts` (MAPPED, `test.skip`); the underlying **deactivateUser** service is exercised by `deactivation-dryrun.spec.ts` in DRY-RUN (records the DRY_RUN_DEACTIVATE audit intent, no real revoke) | DISABLED-SAFETY (trigger); DEEP (service dry-run) |
| daily-full-sync → dailySync | scheduledTrigger (day) | Org-API + group sync; funnel reconcile | mapped only | **DISABLED-SAFETY** |
| sync-consumer → syncConsumer | consumer | Multi-phase discovery/reconcile pipeline | — | NONE-GAP |
| app-database | sql | 8 TiDB tables (user_activity, deactivation_log, app_config, sync_*, groups_cache, funnel_reconcile) | `sql-activity.spec.ts` (counts present, user_activity schema asserted) | DEEP |

> **Safety:** `daily-inactivity-check` + `daily-full-sync` (and their functions) are **commented out
> in the deployed manifest** (uncommitted working-tree edit) so the wolfaenpak install performs **zero
> live revocation**. Re-enable + redeploy to test the revoke flow for real.

## RESOLVED: the dev SQL read-hook now exists
A secret-gated, READ-ONLY `licenseleash-test-state` webtrigger (`src/handlers/test-state.ts`,
gated by `LICENSELEASH_TESTHOOK_SECRET`; 404 in prod) exposes `counts / schema / activity /
deactivationLog / config`. It unblocked the activity engine + SQL state above. Observed live on
wolfaenpak: 16 tracked users, 172 `deactivation_log` rows, 60 cached groups. Remaining SQL gaps
(sync pipeline phases, admin-resolver queries) can now be closed the same way.

## Gaps → covering test
1. **Activity tracking (11 triggers)** (NONE, HIGH): create a real page on wolfaenpak, then assert a
   `user_activity` row (account_id, event_type, last_active_at) via a dev SQL read-hook.
2. **Admin dashboard + resolvers** (NONE): render `license-manager-admin`; call `getStats`/`getUsers`
   (filter revoked/active) and assert the shapes; `runDiagnostics` (already unauthenticated).
3. **reactivation-banner** (NONE): render a page as an eligible user, assert the banner + its state.
4. **sync-consumer pipeline** (NONE): trigger `syncNow`, poll `getSyncStatus` to `complete`, assert
   discovery/funnel table counts.
5. **Reactivation happy-path** (DEEP-gap): after a (re-enabled) revoke, mint a valid HMAC token via a
   dev signer-hook and assert `has_confluence_access→1` + a `REACTIVATED` audit row — currently the
   spec only proves rejection (never mints a valid token, by decision).

## What IS covered
The **reactivation page renders** and the **reactivation webtrigger rejects** missing/forged tokens.
The deepening here found a real bug — the webtrigger returned **424 for every request** because of
string-valued response headers (`{'Content-Type':'text/html'}` → must be `['text/html']`), so no
reactivation email link worked at all. Fixed. Everything behind the SQL data engine is the frontier,
gated on adding a dev read-hook.
