# Retained connected UAT — author freeze preparation

This is authored coverage, not a live result. The single test is `scenarios/lz-ppm/journey-campaign-retained-uat.spec.ts`; its exclusively owned fixture helper is `retained-uat-fixture.ts`. No app source was changed. The journey now consumes the shared `capacity-preferences.mjs` correction owned by the live tester; this lane did not edit that helper. The actual authenticated browser was not opened during authoring.

The checked-in independent oracle is read from the adjacent app repository's `docs/campaign-2026-09/retained-uat-oracle.json`. Its generating `.mjs` uses independent weekday/sampling/chain arithmetic and cross-checks the real builder/engine for six captured leaf orders. The exact oracle bytes must hash to `487ac1e69615a8bf56bc30c89eccd42968ac982edef3afd3d1caaae85932da2e` before any tenant call/write. The SHA is recorded in the exclusive ledger and final handoff. The live test selects the precomputed expected result from the observed saved issue order **before** calculating the comparison. It never manufactures fixture IDs or imports a live result as its own expected answer.

## Scope

One actual WFH Epic and three leaves; two retained ordinary plans. Native field11148/11149 values use existing owned objects411–413 on Work package10004 only. Epic native fields are intentionally not written: those contexts do not apply to Epic. It remains a nonmatching read-only parent context. No shared Assets context/screen/object is modified.

The connected journey covers native context/selection/bulk-discard, explicitly injected label-only unavailability and503 then real refresh recovery, keyboard activation, target/captures, persisted B buffer and high uncertainty, exact saved-to-saved forecast comparison, duplicate-name identity/deletion, deliberate adopted working draft/Save/reopen, four-week cross-plan capacity, captured report and immutable download after Discard. Planning is inspected at1100 and1440 widths, allowing table scroll but refusing document overflow. Screenshot calls use actual subject locators and the shared painted/inert/overlay guard. Download/save/navigation/PDF stages and actual page crashes are journaled.

Capacity's >5000 refusal is a different root-owned companion, not included here. The source baseline is the original45 issues and fixed fingerprint. No fabricated calibration, second authenticated identity or claimed human PDF inspection is included.

## Ownership and identity contract

The actual rendered `LZ_EXPECTED_UI_VERSION`, zero-draft standing card and full original source fingerprint must pass before fixture writes. A fixed exclusive `wx` ledger at `scratch/lz-retained-uat-20260906/ownership.json` prevents another run from creating duplicates over retained/uncertain work. Every journal update is also written to `info.outputPath('retained-uat-journal.json')`.

For campaign admission, the journal binds `runId` from `LZ_CAMPAIGN_RUN_ID`, resolved `unitDir` from `LZ_CAMPAIGN_UNIT_DIR`, and `beforeIdentitySha256` from that attempt's actual `before-identity.json` bytes. Optional `LZ_RETAINED_UAT_LEDGER` is an additional mirror and must be inside that unit directory. It never replaces the global exclusive ownership claim. Manual discovery does not create any ledger or resources.

Schema1 contains `plans.main/mirror{id,name,state}`, `issues.E/A/B/L{id,key,summary,type,state}`, original `registry`, `admittedJira`, `standingSchedule`, observed UI version, original private Capacity settings, checked steps/cleanup and handoff snapshot/target/report IDs and hashes. Success sets `state:'retained'`, `privateSettingsRestored:true` and `noPendingDrafts:true` only after both UAT plans have actual null current-user drafts and empty draft registries, source/registry guards and settings restoration. `handoff.humanInspection` stays pending. Exact retained plan names:

* `[harness-test] UAT 20260906 October release decisions`
* `[harness-test] UAT 20260906 October capacity mirror`

Root owns the explicit retained-unit identity policy integrated with the generic after-identity guard. Only that manifest-marked retained unit may admit the exact two owned plans; do not run this as an ordinary temporary-fixture unit or weaken other units’ zero-delta checks.

Failed admission attempts guarded cleanup of every positively owned resource. Missing search results never license deletion. Uncertain create without an exact positive match, ownership mismatch, failed independent cleanup or private settings restoration leaves `recovery-required` and the journal. No prefix-only deletion/global registry clear exists. A previously created ledger blocks re-execution even after cleanup: review/archive that particular ledger deliberately after reconciliation. Original body errors are preserved alongside restoration errors. Parent removal reads project/summary/parent and checks that same response's actual identity before treating omitted parent as null; it does not repeat the previously proven parent-only projection bug.

## Local validation

```sh
node --test tests/retained-uat/*.test.mjs
npx tsc --noEmit
npx playwright test --project=chromium --list scenarios/lz-ppm/journey-campaign-retained-uat.spec.ts
```

Five tests execute the actual helper after TypeScript transpilation, with isolated temporary files and fake REST/hook boundaries: failed field admission cleans only the owned issue, unknown create+empty search refuses deletion, wrong ownership refuses deletion, existing ledger blocks a second call before any endpoint, and changed oracle bytes reject before any endpoint/ledger write. Two additional local tests extract the actual spec’s complete expected-value declarations and compare all fields with real report projection/target/change/forecast/capacity functions on explicitly synthetic identities. These validate authored contract compatibility, not installed behavior. They import no credential helper/authenticated profile. Static discovery finds exactly one test. Typecheck has only the two pre-existing Sentinel-owner errors; no new authored-file errors. See `static-proof.txt`. No browser journey was executed.

## Remaining uncertainty for independent review

WFH Epic date/buffer/time-tracking zero support has not been re-read live in this lane. Its writes target only the new owned Epic and must pass direct readback; a refusal is an admission failure with recovery evidence, not permission to change a screen/context. The custom UI controls, adopted Save lifecycle, target comparison and actual report PDF require installed execution. The long report path has experienced genuine Chromium closure in other live attempts; explicit stage/crash evidence distinguishes missing artifact proof from app arithmetic. If browser closure prevents authenticated private-settings restoration, this run must remain failed/recovery-required rather than deleting plans referenced by unrestored settings.

## Independent-review corrections (8b89f07e)

Assets configuration waits for the form to close, exact two-field count, completed reads, absent error and painted interactive subject through `assetsConfigured`; it no longer mistakes the Saving label for completion. The owned mirror explicitly runs the real forced refresh after configuration, then must return indexed status, cleared Assets-index-pending flag, the configured field IDs and all four exact indexed memberships/object-reference sets. Every leaf field must be present; the inapplicable Epic remains empty/unavailable with no object refs.

Both actual UI Capacity saves use `createCapacityPreferences.calculate`: the original preferences are durably recorded before any write; current values must match the last acknowledged owned settings before a write intent is recorded. Every actual save acknowledgement is persisted immediately, independently of report completion. Restoration refuses unknown pending outcomes or concurrent values, supplies the checked expected version, and requires two exact original-settings readbacks. The full helper state is retained under `privateSettingsOwnership`. If restoration fails, owned plans remain for recovery rather than becoming dangling selected IDs.

Cancelled adoption now proves the owned current-user draft is null, active-draft registry empty, reopened Table B buffer exactly No, no Save/Apply changes, and every owned stored schedule equals the original capture before positive adoption.

Retained report API assertions cover all four timeline rows and every summary/date/duration/status/buffer/parent field from admitted Jira, all target identity/scope/planned/forecast/availability values, baseline identity and exact B No→Yes change, every person/week/demand/capacity/unknown/available-days/utilization/status value and complete relevant saved profile. HTML checks every existing timeline cell and bar placement, all target cells, all capacity cells, full availability wording and both baseline schedules, plus complete forecast/coverage assumptions. Timeline HTML has no buffer column and capacity HTML has no utilization column: those are checked in API and actual supported UI surfaces, not invented in the export.

Correction dependency: shared preference guard and ordinary caller fixes are frozen at harness `aa90029`. This UAT correction’s seven local controls, unchanged-scope static discovery and typecheck are recorded separately in `correction-proof.txt`, `correction-discovery.txt` and `correction-typecheck.txt` (only the two pre-existing Sentinel errors). Independent original preference-red assertions are owned by the reviewer and retain their original red evidence; the corrected seam calls the real shared guard rather than duplicating inline restoration. Still no authenticated UAT execution or claim of retained live artifacts.
