# Passive measurement of the existing large report UI

Prepared in isolated worktree `/private/tmp/lz-report-product-throughput-20260906`, branch `codex/report-product-throughput`, pinned shared harness base `c66b5f97e059fd82effdc94b5b62673137d6f9ce`. Main source, active instrument, browser and tenant were not edited or run. Shared node_modules is a local dependency symlink only; no `.env`, authentication state or profile was copied. Root review is required before integration.

Only the existing mandatory large-history test opts in. The other six report cases and all default helper callers keep their original paths. UI begin/advance/automatic cleanup, every original content/physical assertion, zero retries, the 600,000 ms capture wait and the test's 1,800,000 ms timeout remain unchanged. There is no pacing, route interception, extra request, manual advance, cap change or credential refresh in this cut. The existing direct replay transport retains its original behavior, including any token-expiry failure; a separate approved transport fix must not be overwritten by this branch.

## Observation contract

The exact dashboard app/environment/module extension ARI is built from the existing target configuration. It matches the actual trace's `variables.input.extensionId`. Every RPC key for that extension is captured, including planless settings and background presence/notifications; future keys are not dropped by an operation allowlist. Foreign extension traffic is ignored. Malformed or undecodable potentially relevant GraphQL traffic is explicitly unclassified and prevents a clean evidence grade.

Page `request`, `response`, `requestfinished` and `requestfailed` handlers timestamp immediately on entry, with monotonic milliseconds plus wall-clock epoch. They do not queue behind another response body. `request.timing()` at terminal records the browser's native request/response timing fields for correlation. Body retrieval happens independently and its resolution has a separate timestamp. A callback-observed dispatch is not a claim to know the exact network socket send time; native timing and callback timing are both retained. Wall time is for correlation, monotonic time for intervals.

Optional seams in `currentUserResolver` and `getTestState` record existing direct audits too, because Playwright APIRequestContext and Node fetch do not appear in page request events. The default branches preserve the original code. A direct APIRequestContext response resolves after its buffered response is available: this is labeled `api-response-available`, **not** a fabricated header-arrival time. The Node hook's fetch resolution is header availability; a clone reads the same response independently while the original consumer remains unchanged. `external-consumer-terminal` records the original caller's completion/rejection. These are coarser surfaces than native browser timing and are not interchangeable.

Only function name, plan/job/checkpoint selection, returned job progress, status, selected `atl-traceid`, byte count, hash and timing enter the event ledger. Request headers, context, contextToken and full request bodies are never persisted. Successful response bodies are hashed then discarded after extracting job progress. Every unsuccessful HTTP/outer/body/JSON response retains its ORIGINAL SHA-256/byte count in the ledger, plus a separately hashed, explicitly sanitized JSON evidence file. The parsed envelope removes contextToken and headers/authorization/cookie properties recursively, and redacts echoes of those known values in other strings. The evidence declares originalRawRetained:false; it is never presented as byte-exact original text. Unparseable text is represented only by its hash, byte count and explicit content-omitted marker because a malformed envelope cannot be safely sanitized. A body-read failure has no invented raw content. HTTP errors, outer errors, body refusals, transport errors and observation/sink failures remain explicit, even for background APIs the UI normally swallows.

The global phase marks are test milestones: preparation, capture, post-capture audit, direct page audit, UI download, source checks, failure cleanup and final cleanup. Each record preserves its dispatch phase; each event also preserves its current phase. Overlap remains visible. Product first-page preview may overlap the external post-capture audit. Within capture, returned job states distinguish active advances, publication and automatic private cleanup; the existing full protocol remains the stronger business-transition oracle. Neither phase names nor API response bytes are claimed as platform read-unit billing.

## Completion and failure behavior

Event persistence is append-only during execution, bounded to 10,000 emitted records. Exceeding that bound is an evidence failure, never truncation declared complete. Observer callbacks are not awaited by helper operations; thrown/rejected sinks are recorded and cannot replace the original helper result/error. All HTTP operations remain the existing calls.

Only after the existing test cleanup completes does the observer detach new request intake and drain its already-started local body/sink reads, bounded to ten seconds for the body drain and ten seconds for a pending terminal sink. There is no inserted wait between UI advances or other product calls. Missing terminals, drain timeouts and late body errors cause an incomplete/failing evidence result. The final grade also requires actual UI begin, advance and cleaned publication coverage, so a wrong app filter cannot quietly produce a green empty ledger. It does not claim report correctness: `productPassed` stays false; the existing full-content assertions and subsequent independent grading decide that.

Any observation failure makes the test fail after its existing cleanup and retains an original body failure in an AggregateError where present. All errors, including deliberate-navigation transport aborts, are preserved; this cut does not pre-excuse such events. A future observed expected abort needs explicit evidence-based interpretation, not a hidden success filter.

Artifacts: `large-throughput-events.jsonl`, `large-throughput-failure-N.json` for sanitized failed envelopes with original hashes, and `large-throughput-final.json`. Original large-history/protocol/full HTML artifacts remain unchanged. Fresh runner output directories are required as usual; this code adds no campaign or run.

## Local evidence

Run only local fake transports:

```
node --import tsx --test tests/report-throughput/*.test.* tests/report-capture/adapter.test.ts tests/report-capture/held-step.test.ts tests/report-capture/*.test.mjs
node_modules/.bin/tsc --noEmit
```

46 controls pass: sixteen new plus thirty existing. New controls cover an independently held first body with a later background request, real event versus body completion timing, all exact-app keys/foreign exclusion, HTTP/outer/body failures with exact raw hashes, malformed JSON/body rejection/requestfailed, bounded unknown completion, throwing/rejected/terminal sinks, falsy helper errors, clock corruption, direct/hook one-dispatch result parity and original errors, missing capture coverage, and an AST comparison of every preexisting `expect` expression in the large/shared-capture files against the pinned baseline.

The first typecheck recorded missing files from the initial sparse checkout and two new inferred callback-arity errors. The sparse source inventory was completed and callback defaults made explicit; `typecheck-final.txt` contains only the two inherited Sentinel findings. No Sentinel file was changed. No Playwright test or discovery/browser command was run. This is local instrumentation proof, not a large-report throughput verdict.

## Root review correction

Root found that even an outer-success/body-failure response can contain a renewed contextToken. The initial abc179f raw-envelope writer therefore violated the intended credential boundary. The two new actual-shaped regression controls fail against archived abc179f (`credential-original-red.txt`) and pass after explicit sanitized-envelope retention and nonarray-error detection (`credential-correction.txt`). No operation/transport/timing behavior changed. Original raw hashes/byte counts remain available, while persisted evidence never claims the sanitized envelope is the original raw body. The final typecheck still has only the two inherited Sentinel findings.
