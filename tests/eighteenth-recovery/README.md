# Exact eighteenth recovery — local preparation, not dispatched

This standalone unit admits only the three retained plans/jobs and WFH-2978/2979/2980 in `pinned.json`. The successful baseline-drift fixture WFH-2981, WFH-2820, original plans and all foreign records are excluded from writes. The failed eighteenth outcome remains failed. Removing the three owned extra plans restores the original three-plan registry; no original schedule or preference restoration write is justified by the evidence.

The pin contains exact public job status, full physical probe, seeded source fields, marker/name, and SHA256 bindings for all nine original fixture/report/protocol files plus terminal receipt and summary. No fresh terminal site probe was recorded by the failed run. Accordingly fresh admission requires exactly the pinned state, rather than assuming the old observation is current. Any drift, unexpected owner, missing artifact, changed source/issue, foreign registry row or new report refuses before mutation.

There are at most eight mutations: two single owner cancel calls (resume and source-drift, checkpoint1→cancelled2 with cleanupDone true), three normal owner Plan-list deletions, and three exact Jira DELETE calls. The cancelled fixture does not receive another cancel. All three payload cleanups finish before the first plan deletion. Each plan has two strong full private/public absence probes after cancellation plus a fresh absence probe immediately before deletion. Source and Jira fields remain exact until their respective deletion. Jira DELETE has a positive same-object GET immediately before it and two exact GET404 checks after its204 acknowledgement. No recursive subtask deletion, issue search, new capture, advance, report delete, preference write or retry is available. An unknown or failed mutator response stops the sequence; final audits are read-only.

The unit does not mount PlanView or use the changing report-departure adapter. It uses the already-proven Capacity/Plan-list wire acquisition, verified same browser principal, post-queue120-second token margin, redacted Forge response serializer and3000/61000ms read ledger. All observed app UI replies must succeed; only the one armed exact normal plan delete may write. Tracing is discarded before fresh credentials. Browser Jira transport is a single `page.request.fetch` with maxRetries0/maxRedirects0/timeout60000 and an exact three-key allowlist. This intentionally avoids the generic Jira client's automatic retries.

The45-row source matches the pinned historical complete schedule/meta fingerprint. Full current45/54/5300 original sources are compared before/after; original registry rows, empty drafts and preference version65 are preserved. No prior full54/5300 raw snapshots are claimed by this failed lifecycle receipt; these two are fresh paired preservation controls. Post-plan-delete catalog metadata physical absence is not independently observable via the existing guarded hook; all payload keys are strongly absent while the plan is still resolvable, then exact plan metadata/rows and registry absence are verified.

## Inputs and discovery

No phase means an inert skipped test, with no browser launched. A nonempty wrong phase or missing approval fails before registration. The explicit phase is `LZ_EIGHTEENTH_RECOVERY_PHASE=approved-three-fixtures` and requires:

- `LZ_EIGHTEENTH_RECOVERY_EVIDENCE`: the closed `eighteenth-report-acceptance-20260906` directory, containing the pinned receipt, summary and nine exact journal files.
- `LZ_EIGHTEENTH_RECOVERY_APPROVAL`: an externally authored root approval JSON path.
- `LZ_EIGHTEENTH_RECOVERY_APPROVAL_SHA256`: exact bytes digest of that root file.

Root approval schema: `schema:'eighteenth-root-recovery-approval-v1'`, `approveRecovery:true`, `terminalSha256` and `pinSha256` from `source-freeze.json`, `principal` from the pin, ordered `planIds`, `issueKeys`, `jobIds` from the three pin entries, and full40hex `rootDispatchCommit`. The author does not generate a live approval. Test-generated approvals are temporary local fixtures deleted after `--list`; none is retained as dispatch authority.

After independent source review and separate root dispatch, the existing durable supervisor may run:

```
npx playwright test scenarios/lz-ppm/campaign-eighteenth-recovery.spec.ts --project=chromium --workers=1 --retries=0 --reporter=line,json --output=<owned-run-directory>/artifacts
```

Use the already-reviewed portableChrome152 launch environment and current root-pinned UI/runtime/account admission. Set JSON report output and journal run directory exactly in the durable command receipt; do not use a token or header in command arguments. The spec's two-hour stopping deadline bounds this finite8-mutation flow plus fresh wire acquisitions and preservation audits; no operation timeout is raised and no returned failure is retried. KVS reservations reuse conservative full5300 measured maxima: cancel192, UIplanDelete768, probe1024, source640, other64; these are model reservations, not billed telemetry. Jira REST/principal reads consume no KVS reservation and remain separately timestamped.

## Local evidence

`node --test tests/eighteenth-recovery/*.test.mjs` proves exact successful mutation order and pre/postphysical checks, wrong principal/settings/registry/source/checkpoint/missingartifact/issue404/label refusals, generic cancel failure and lost delete acknowledgements without retries, false cleanupDone, exact UI mutation gating, all pinned files and five actual CLI admission controls. No browser/site calls occur in these controls. TypeScript reports only the two inherited Sentinel findings. Existing wire, serializer, pacing and readonly-surface controls are retained and rerun separately.
