# Exact retained fourteenth report — read/export phase only

Prepared one standalone test; no live execution. `campaign-recover-fourteenth-report.spec.ts` never creates, advances, cancels or deletes a report, writes preferences, creates/deletes issues, or changes the retained plan. All current-user RPC calls pass a fixed read-only allowlist. Unexpected report/settings/plan mutation requests are recorded and fail the final audit. No generic campaign identity semantics change.

The source report/job identity is pinned to the immutable failed-run protocol SHA56fc4f75f6b6e2cd44b2a06e69fb6867276c589dec93383945330745ce5d16ff. Admission requires original3 plans plus only plan-test-mtpbanj1-vfroj0, original45 fullfingerprint/zero-original protection change, actual owned issueWFH-2904/projectWFH/label lz-norm-mtpbakob/summary/dates/duration, servercreated harness plan identity and exact one key. It requires no owned draft, no active drafts and no lock. Current preferences are freshly read (version>=lastknown57) and preserved exactly with two final reads, with no restore/write.

The actual failed trace getAllIssues row has buffer string `No`, not a boolean. The independent full expected row is keyWFH2904, original summary, October5–9/duration5/bufferNo/statusnew/parentnull; canonical SHA matches the archived report manifest252b909fc9c9bbd5ed7cd81ac68f8778fa0e3b45648e840668e70adc8ff70d57. Every actual manifest page is read, row count and hash checked, and all rows compared. Full report equals the archived summary before and after actual HTML/PDF export; actual job stayscomplete16 and private6/public5 role-aware probes are recorded before assertions and rechecked twice. Actual HTML DOM verifies every visible row cell, timeline bar, forecast dates and no target/capacity rows or remote script/image/network content. PDF is printed from the actual downloaded local HTML in the same portable context. Every read/export/close error survives.

Original source, registry, owned plan, same owned issue and current preferences have separate final audits, so one failure cannot skip siblings. Retained report/plan/issue deliberately remain for root inspection. This diagnostic does not retrospectively pass the failed lifecycle test or replace later complete original journeys.

Local discovery: `npx playwright test scenarios/lz-ppm/campaign-recover-fourteenth-report.spec.ts --project=chromium --list` =>1test. `npx tsc --noEmit` has only the two pre-existing Sentinel errors. Receipt requires known portable152/native/framework/principal pins and actual UI version supplied from the new deployment binding. Root must review this source and authorize runtime before launch. Planned binding is development6.12.0/UI4.58.585/source da699034bceacc4fd9b08512dd834a8debe4eb2b; it is not live evidence.

After root review, the standalone invocation is:

```sh
HEADLESS=1 HARNESS_VIDEO=0 LZ_HARNESS_BROWSER_MODE=portable-chrome152 \
LZ_EXPECTED_ACCOUNT_ID=712020:937bc860-eec2-4294-a65d-8e0fe7c45086 \
LZ_EXPECTED_UI_VERSION=4.58.585 LZ_CAMPAIGN_SOURCE_EXTENSION=null \
PLAYWRIGHT_JSON_OUTPUT_NAME="$LZ_REPORT_READ_DIR/result.json" \
npx playwright test scenarios/lz-ppm/campaign-recover-fourteenth-report.spec.ts \
 --project=chromium --workers=1 --retries=0 --reporter=line,json \
 --output="$LZ_REPORT_READ_DIR/artifacts"
```

A fresh owned outputdirectory and command/binding JSON must be recorded before dispatch, without copying session/auth data. No automatic retry. Stop after this read/export phase; root inspects actual HTML/PDF before a separately prepared known-owned cleanup phase can execute.

## Separate exact cleanup preparation

Root inspected the actual two-page PDF and full HTML after the read/export test passed. `campaign-cleanup-fourteenth-report.spec.ts` is a separate one-test phase, not imported by read/export. It pins the accepted journal and actual HTML/PDF bytes; admits only the original3 plus exact retained plan; rereads identical same-object issue, plan, full original source, exact report/job and current preferences57. Both original and owned drafts must be absent, owned lockfalse. It records each intent before write and exact acknowledgement afterward.

Sequence is one same-user `deleteSponsorReport` for exact reportID, then checkpoint-acknowledged job cleanup with full historical manifest retained and two strong artifact-absence probes. It rereads report absence twice/listempty, then invokes ordinary same-user `deletePlan` once. Successful non-ghost acknowledgement follows the server's internal strongly verified job/catalog cleanup; independent dev-hook reads verify plan metadata/issues absent twice and registryoriginal3. The hook itself requires existing plan ownership, so it cannot independently inspect a raw job descriptor after plan deletion; the pre-plan full private/public artifact absence and the awaited server deletion acknowledgement are explicitly separate evidence. No arbitrary KVS access or new hook is added. Finally same-object issueWFH2904 is positively reread unchanged, deleted once, and reread404 twice. There is no release/version to delete.

Current preferences57 must match before each destructive phase and twice finally; no preference writes or draft clearing occur. Independent original-source/registry/preferences/original-drafts final audits preserve sibling failures. Partial failure leaves precise intents/acknowledgements and remaining owned resource IDs rather than retrying or recreating anything. One local test discovered; typecheck has only the same two pre-existing Sentinel errors. After root source review, use the same standalone portable152 command above with this exact cleanup spec and a distinct outputdirectory `fourteenth-report-cleanup-20260906`. Bind development6.12/UI585/source da699034 and current frozen harness SHA. No runtime has yet executed this cleanup phase.
