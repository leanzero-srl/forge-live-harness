# Coverage matrix — License Leash (axpo-license-manager, Confluence license enforcement)

Module × live behaviour × asserting spec (in `scenarios/license-leash/`) × rating. Tested on the
**wolfaenpak** testbed. See [INDEX](coverage-INDEX.md).

| Module (key) | Type | Live platform behaviour | Asserting spec | Coverage |
|---|---|---|---|---|
| reactivation-page-confluence | confluence:globalPage | Self-service status / reactivation page | `render-smoke.spec.ts` (renders + bootstraps SQL via `ensureMigrations`) | SMOKE |
| reactivation-webtrigger → handleWebReactivation | webtrigger | HMAC-gated reactivation link | `webtrigger-token.spec.ts` (missing→400, forged→rejected) — **found+fixed the 424 header bug** | DEEP (rejection paths) |
| license-manager-admin | confluence:globalSettings | Admin dashboard (gauge, users, audit, config) | — | NONE-GAP |
| reactivation-banner | confluence:pageBanner | Suspended-access banner on every page | — | NONE-GAP |
| on-page-created / -updated / -viewed / -liked, on-comment-created/-liked, on-blogpost-activity/-viewed, on-attachment-activity, on-whiteboard-created, on-database-created (×11) | trigger | Record `user_activity` (debounced) | — | NONE-GAP |
| run-migrations → runMigrations | scheduledTrigger (day) | Provision/evolve the 8 SQL tables | run on first resolver hit (no assertion) | SMOKE |
| daily-inactivity-check → checkInactivity | scheduledTrigger (day) | Revoke licenses of inactive users | `reactivation-flow.spec.ts` (MAPPED, `test.skip`) | **DISABLED-SAFETY** |
| daily-full-sync → dailySync | scheduledTrigger (day) | Org-API + group sync; funnel reconcile | mapped only | **DISABLED-SAFETY** |
| sync-consumer → syncConsumer | consumer | Multi-phase discovery/reconcile pipeline | — | NONE-GAP |
| app-database | sql | 8 TiDB tables (user_activity, deactivation_log, app_config, sync_*, groups_cache, funnel_reconcile) | bootstrap only (no schema/row assertion) | NONE-GAP |

> **Safety:** `daily-inactivity-check` + `daily-full-sync` (and their functions) are **commented out
> in the deployed manifest** (uncommitted working-tree edit) so the wolfaenpak install performs **zero
> live revocation**. Re-enable + redeploy to test the revoke flow for real.

## The blocker: no dev SQL read-hook
License Leash has **no secret-gated `_testState` hook**, so the internal SQL state (the core data
engine) can't be asserted. Adding one — e.g. `getActivityRow(accountId)`, `getDeactivationLogEntry`,
`getSyncCounts`, `getSchemaInfo` — would unblock ~20 NONE-GAP modules at once. This is the single
highest-leverage addition.

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
