# Retained UAT departure cut

This isolated cut starts at reviewed union `b5a97100363a6f33783c2925554f2edb3a484610`. Only `journey-campaign-retained-uat.spec.ts` changes harness behavior. Shared departure/document/presence/capture helpers, the fixture, app runtime, manifests, and all other scenarios remain unchanged.

The UAT opts into the existing departure adapter and registers the actual admitted main plan ID/name before the first Table navigation. The mirror remains an API/Capacity fixture and is never adopted as the mounted owner. The existing final blank now uses the same safe stop that ordinary Table/Plans navigation and report cleanup already consult. The adapter still requires a real owned successful presence leave; this cut neither synthesizes a leave nor ignores an abort/failure.

A sticky departure failure bypasses dependent report cleanup, is preserved as `journal.reportRecovery`, and records the original `{main,mirror}` plan ledger and all four issue records in `journal.retainedForRecovery`. An error raised during report cleanup or the final stop has the same disposition. `f.finish(false)` cannot delete either plan or its issues while that failure is present. Preference restoration, route/document cleanup, and the existing independent standing-source audit still execute. A safe normal failure retains the original `f.finish(false)` cleanup behavior; a safe pass retains the original `f.finish(true)` handoff.

The complete original test body is byte-identical. AST controls retain all original expectations and wait/timeout expressions. The label-only Assets injection, deliberate 503 response, every UI interaction, retries=0, 1,800,000ms test budget, oracle/HTML/PDF assertions and private settings restoration are unchanged. This cut introduces no sleeps, retries, extra live cases, or UAT execution.

## Local proof

Use Node 22.22.0 and the existing harness dependencies (`node_modules` may be a local-only symlink to the shared harness dependency directory).

```
PATH=/Users/mihaiperdum/.nvm/versions/node/v22.22.0/bin:$PATH node --test tests/retained-uat-departure/finalizer.test.mjs tests/report-throughput/departure-retention.test.mjs
PATH=/Users/mihaiperdum/.nvm/versions/node/v22.22.0/bin:$PATH LZ_OLD_UAT_DEPARTURE=1 node --test tests/retained-uat-departure/finalizer.test.mjs
PATH=/Users/mihaiperdum/.nvm/versions/node/v22.22.0/bin:$PATH node node_modules/typescript/bin/tsc --noEmit
```

The first command passes 12/12 (9 new actual-source/AST controls plus 3 unchanged shared finalizer controls). The second intentionally fails 6/9 against the archived original source, including deletion after a previously poisoned departure with no registered capture, and missing final safe stop. Original red commit `0f62dd8` and its log are retained. The follow-up fixture uses the exact real ledger shape `{main,mirror}` plus E/A/B/L; assertions are unchanged and `original-ledger-shape-red.txt` reproduces the same six failures.

The source-derived tests compile the actual UAT finalizer, not a substitute implementation. They instrument fixture deletion, report cleanup, settings restoration and source audits to prove both failed and successful dispositions. They do not call the site or create a browser. Shared helper and fixture byte equality against the base is checked in the same tests.

Typecheck exits 2 exclusively for the two inherited Sentinel diagnostics (`my-work-page.spec.ts:80` implicit-any, `steward-console-deep.spec.ts:31` string|number.replace). The UAT cut adds no TypeScript diagnostic. Full output is retained in `typecheck.txt`.

This is local implementation evidence only. Root and Dewey must independently review the frozen cut. No UAT launch, live acceptance, deployment, shared source transfer, or private-report witness is claimed.
