# Exact checkpoint126 recovery with measured harness read pacing

Prepared only. The original `seventeenth-forecast-resume-20260906` remains failed:48 actual successful advances reached126; the last in-run strong status/physical proof was125, and installation KVS429 prevented final storage audits. The separately authorized single read at11:28:48.965→54.383 proved active126,182 hash-valid private artifacts, all40 exact run headers, zero public. It did not re-prove source/preferences. No other live call was made during this preparation.

The new standalone `campaign-seventeenth-paced-resume.spec.ts` first verifies full failed journal333e483b… plus strong admission847489b… and the unchanged complete earlier chain7226→e34→ccca→4b672→da1e/originalthree capture hashes. It replays all48 actual raw replies (raw/body SHA/equality), all47 subsequent successful status/full physical proofs, the exact40 one-run increments, and every retained header. It never seeds40 from a numeric count alone. Fresh live admission must equal the exact strong126 receipt,182 artifact objects/zero public, original134 immutable subset, complete raw5300/meta/pristine snapshot and original45 fingerprint/whole objects, registry3+onlyowned, empty drafts/baseline/lock, private settings65 and unchanged sharedWFH2820 GET-only. No capture creation, repeated forecast, cleanup, settings write or Jira write is allowed.

Pacing is HARNESS ONLY. `rolling-read-budget.mjs` uses a single FIFO3000-unit rolling61s ledger with a monotonic clock. A reservation stays active until its actual response terminates, then remains charged for another61s. Direct owner RPC, test-hook GET, and actual UI resolver traffic share exactly one ledger. Failed/unknown operations remain charged and are never retried. UI requests remain active until the exact requestfinished/requestfailed event; route.continue is only dispatch. Each raw UI response is preserved and unsuccessful HTTP/outer/body responses or failed transport make the final result fail. Errors arising during final drain are graded afterward. Unknown key cost errors are caught, logged, aborted, and prevent any direct advance. Falsy thrown values, clock corruption, cancellation and concurrent reservation races fail closed.

The frozen fixture accounting from app b5fef6e7/63d20bce is copied unchanged as advance-reservations.json and SHA-pinned by the source cost module. Full probe1024, status64, full plan640, snapshot512, summary128, page16; other enumerated UI/read/presence calls64. Prior acknowledged stage chooses the independently measured advance reservation: fold96, forecast/packing128, page writing/provenance192, page verification96, full source checks768; unknown stage768. This reduced per-stage reservation applies only after exact fixture/source admission and never replaces the full physical checks. The source model adds one unit to every GET, then25percent headroom, then rounds upward to32. Actual current probe/page/source rows remain unchanged. These are conservative fixture-value estimates, not platform billing telemetry or a guarantee against unrelated installation activity.

Portable bootstrap performs its existing principal/UI admission before the spec owns routes and then closes its app page. The new spec verifies its only remaining page is about:blank with one frame, records a91s quiet boundary (30s allowance for a prior outstanding25s resolver, plus61s window), and verifies zero routed app requests during it. The measured shared-budget claim begins afterward. Bootstrap is not retrospectively claimed to have been metered. No live operation is admitted by elapsed time alone; every exact source/job guard still follows.

Local UI helpers preserve the same app route/frame/card/Dashboard/Planning predicates with explicit600s response/navigation/action/expect/readiness bounds; shared helpers and other journeys are unchanged. Download still has the existing600s bound. Actual dispatched RPCs remain bounded60s, and hook bodies at8MiB/60s with redirects/retries disabled. The same-job continuation caps100 further checkpoints and120minutes; the complete standalone test caps180minutes to include pacing, full output/export/reopen and independent final audits. The injected-clock model of the measured57 remaining checkpoints plus full admission,318 page reads (first pass, actual UI export, immutable reread), additional UI and final audits takes2,375,600ms (~39.6minutes), max3000 reserved units; that is a model, not a live result. The longer explicit caps accommodate observed-call variation without extending an individual Forge operation or retrying it.

All previous report business assertions remain: full old-producer forecast/inputHash/coverage/seed/runs, exact complete summary/provenance/document,106 full pages/all5300 fields, exact actual downloaded HTML bytes from the frozen old renderer, all5300 visible cells/bars, actual forecast and first/end/weekend row images, actual UI reopen and all106 pages unchanged. Every newly observed private artifact becomes part of the immutable expected subset on the next checkpoint. Final source/snapshot/settings/shared/draft/registry audits run independently after errors. Resources stay retained for root inspection; no cleanup is attempted. This recovery proves report behavior with paced harness verification; it does not prove unpaced product throughput. The separately identified app-only rate sensitivity remains an independent product question.

## Local evidence

`node --test tests/seventeenth-paced-resume/*.test.mjs` —21 controls pass with actual exit0 recorded. Includes all48 real saved acknowledgements, negative receipt/run/header guards, response-held/UI lifecycle, failed/unknown/cancel/falsy/clock cases, shared fullsequence cadence and strict transport body bounds.

`node --test tests/seventeenth-forecast-resume/*.test.mjs` —16 unchanged controls pass, including frozen18 old producer blob equality, actual5300 old40 simulation, full summary106page/HTML oracles. Discovery is exactly1. Typecheck only reports the two pre-existing Sentinel errors, captured separately with exit2. Earlier budget-controls.txt is the six-case initial draft result, not the final21-case freeze.

## Reserved launch (only after root review)

Run ID `seventeenth-paced-forecast-resume-20260906`. Current installed development tuple is Forge6.24.0/UI4.58.586/build20260906/sourceabfeca90f3da74fa213db2a010e7bcba78f7aef3. Root must confirm that same actual runtime remains deployed and freeze the sole browser/runtime lanes before launch. Bind current harness HEAD, instrument hash, exact command and these deployment identities into a fresh durable run directory. No app deployment is made by this harness.

```sh
HEADLESS=1 HARNESS_VIDEO=0 LZ_HARNESS_BROWSER_MODE=portable-chrome152 \
LZ_EXPECTED_ACCOUNT_ID=712020:937bc860-eec2-4294-a65d-8e0fe7c45086 \
LZ_EXPECTED_UI_VERSION=4.58.586 LZ_CAMPAIGN_SOURCE_EXTENSION=null \
LZ_SEVENTEENTH_PACED_PHASE=resume126 \
PLAYWRIGHT_JSON_OUTPUT_NAME="$OWNED_NEW_RUN_DIR/result.json" \
npx playwright test scenarios/lz-ppm/campaign-seventeenth-paced-resume.spec.ts \
 --project=chromium --workers=1 --retries=0 --grep 'paced resume:' \
 --reporter=line,json --output="$OWNED_NEW_RUN_DIR/artifacts"
```

On any failure, preserve exact raw error/last acknowledged versus last strongly verified checkpoint and final-audit limitations. No fresh suite, advance retry, report cancellation or resource deletion follows automatically.
