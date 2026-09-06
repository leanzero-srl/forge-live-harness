# Two fixed read-only forensic modes

Prepared only; no live calls. New development-only secret-gated `what=reportCaptureForensic` contract is owned by the app author. This harness is a separate diagnostic and changes neither ordinary seven tests nor regressions. One discovered test performs exactly context then analyze, each once. It never invokes advance/cancel/delete or acquires/releases a report operation lease.

Admission checks the exact latest prelude receipt SHA ccca27e6370abbc8fc784b31e5561e0c72464c79c64b59bd574ecaa768846752/return1788686653652, the previous context-first4b672... and originalda1e... full chain, then original failed journal/protocol/raw5300 SHA pins. All three admitted full jobs/probes must match. The conservative elapsed120-second boundary is preserved. Fresh original3+only owned registry, source45/fullobjects, raw5300/pristine snapshot/fullfields/hash, baseline/drafts/owned lock, current empty preferences65 and sharedWFH2820 exact full projected GETs are verified before. No shared issue write is imported.

The existing same-user Capacity read supplies only read-only ordinary RPCs for status/snapshot/preferences/drafts. The forensic webtrigger GET uses existing configured endpoint/secret privately; only fixed query fields what/mode/planId/jobId/expectedCheckpoint are allowed, query≤512B and request body0. Mode order is context→analyze, each once even after a transport failure; no duplicate mode/retry. Each call has60s client deadline, redirect refusal and64KiB streamed response bound. Full bounded raw HTTP body/status/hash/timings are recorded before response grading; URL and secret are excluded. Oversized response cancels streaming, records observed byte count/failure and fails. A failed first read may proceed to the second fixed mode only after all fresh job/probe/source/snapshot/baseline/settings post-call checks still pass. Any changed/unverifiable state stops; original mode errors and guard error remain together.

Response schema1 requires readOnlytrue/committedfalse/exactcheckpoint78/plan/job. Entry hashes match before/after and across successful modes; meta hashes equal canonical actual admitted plan meta. Context requires exact registered source-context hash, measured979bytes and all4 ordered GET/check phase events. Analyze requires all20 ordered actual context-first stage events and hypothetical not-committed/baseline79/commitCount1/writeCount2. Exact prospective identities are only analysis private artifact and checkpoint entry, with unique full-key hashes, value hashes and bounded sizes. This is a hypothetical computation summary, never a published report or completed job. The actual job/probe must still equal the admitted checkpoint78/full134 private key/hash pairs/0public after each mode.

Two status reads plus fullphysical probe and fullsource/snapshot/preferences guards follow EACH mode. Finally independent originalsource, ownedsource, registry, prefs65(two reads), drafts/baseline and sharedWFH2820(two exact GETs) execute even after errors. No owned resources are removed. Passing this diagnostic means both read-only modes returned the exact graded summaries and state stayed unchanged; it does not close report publication/export/cleanup acceptance. Any mode failure remains an overall failure with raw evidence retained.

Local controls:24 pass (3 exact latest-chain,4 bounded transport,4 response summary negatives/positives,13 unchanged prior controls); discovery1; tsc only2existingSentinel. Logs adjacent. No tenant fixture was synthesized.

Reserve `evidence/lz-campaign/seventeenth-forensic-readonly-20260906`. Wait for root actual deployment success/source tuple and independent review; record full tuple/harnessHEAD/instrument/command before launch. Recipe:

```sh
HEADLESS=1 HARNESS_VIDEO=0 LZ_HARNESS_BROWSER_MODE=portable-chrome152 \
LZ_EXPECTED_ACCOUNT_ID=712020:937bc860-eec2-4294-a65d-8e0fe7c45086 \
LZ_EXPECTED_UI_VERSION=4.58.585 LZ_CAMPAIGN_SOURCE_EXTENSION=null \
LZ_SEVENTEENTH_FORENSIC_PHASE=readonly \
PLAYWRIGHT_JSON_OUTPUT_NAME="$OWNED_NEW_RUN_DIR/result.json" \
npx playwright test scenarios/lz-ppm/campaign-seventeenth-forensic.spec.ts \
 --project=chromium --workers=1 --retries=0 --grep 'forensic readonly:' \
 --reporter=line,json --output="$OWNED_NEW_RUN_DIR/artifacts"
```

Both mode calls are read-only. Stop afterward and retain every resource for root inspection. No automatic advance or cleanup.
