# Genuine Capacity wire lifecycle

This isolated change owns only `scenarios/lz-ppm/capacity-wire-lifecycle.mjs` and this directory. No browser, tenant, app, dependency, version, or existing harness scenario was changed. Synthetic token-shaped fixtures cannot authenticate anywhere.

Run with Node22:

```sh
node --test tests/capacity-wire-lifecycle/lifecycle.test.mjs
```

Fifteen controls cover completed-response admission, concurrent acquisition, identity/endpoint/principal/preferences failures, atomic immutable headers/envelope, malformed and expired scheduling claims, actual rolling-ledger queue aging and retained charges, aged UI-route requests, dispatched failure/no-retry, bounded unsent requeues, nonextending tokens, export duration/exclusion, final audits, invalid clocks and delayed audit callbacks. `first-controls.txt` preserves the initial13/14 result: an unresolved headers Promise was rejected by structuredClone rather than by the explicit fixed admission error. The plain-object header gate corrects that boundary; all15 current controls pass in `controls.txt`.

## Integration contract

`createCapacityWireLifecycle({acquire,expected,identityOf,tokenOf,now,onEvent})` does not invent credentials or perform navigation itself. `acquire` must make exactly one genuine Capacity UI acquisition in the existing browser, under the unchanged route budget/write blocker. It returns:

```js
{wire: {url, data, headers}, accountId, httpStatus, outerSuccess, errors, body,
 requestedAtMs, dispatchedAtMs, completedAtMs}
```

All headers must already be resolved plain strings. Bind the candidate to the same actual request's completed response and dispatch timestamp; a request listener alone is insufficient. Obtain `accountId` using same-context `page.request.get('/rest/api/3/myself')`, never the separate API-token Jira helper. `body` must equal the full expected saved Capacity preferences. Open top-level Plans→Capacity only; do not mount the retained plan's report while acquiring. Do not click Calculate/Save. With empty selectedPlanIds the actual Capacity mount reads settings and does not automatically request a capacity report.

The call-site `expected` includes an independently approved exact endpoint, current account, full preferences and exact stable extension identity. `identityOf` must bind operationName, entryPoint, extensionId and contextIds, including app/environment/module/site/workspace. Actual captured token location is `wire.data.variables.input.payload.contextToken`. Decode claims only for freshness; never modify them or adopt a reply's contextToken. Successful server response, same-context identity and exact extension admission remain required.

`ensureFresh({force:false})` returns safe numeric generation/lifetime metadata. A single flight shares one acquisition. `run({budget,label,cost,dispatch})` checks expiry before queueing and again after the existing ledger reservation. The callback gets one immutable wire generation with resolved headers, plus a safe dispatch receipt. It must construct and POST synchronously up to the actual HTTP call: no awaited header resolution, journal IO, or other scheduling gap after that guard. Keep `maxRetries:0`, no redirects and the existing60s timeout. Only update the actual-dispatch counter in that callback. Any actual return or throw is returned unchanged, never retried.

An aged queued request returns a private local-unsent sentinel without calling dispatch. Its unchanged ledger reservation remains charged. The helper reacquires outside that reservation, then enqueues the still-unsent operation again, at most twice. It does not reset ledger history. Guard every approved actual UI request with `assertCapacityWireFresh` immediately before route.continue after its own ledger wait; an aged UI request must not be promoted just because it was observed recently.

`withExport(operation,{maxMs:600000})` forces a real acquisition, requires the entire phase bound plus120s remaining, then excludes refresh and replay RPC until the actual operation settles. The callback owns its normal bounded UI actions and route budget. No racing timeout releases that exclusion while UI work remains active. On success, elapsed time must stay within the declared bound. Use separate bounded export/reopen phases if needed; final resolver audits use `run` again so they reacquire normally afterward.

`onEvent` receives `wire-promoted` numeric candidate metadata and `wire-unsent-after-queue` label/cost/attempt/time. A delayed or failed audit callback can reject candidate promotion, so the candidate event alone never proves use: only a returned ensureFresh receipt or actual dispatch receipt establishes accepted/used generation. Never journal the wire, token, or headers. Actual failed/unknown write responses still stop recovery. Final audits must preserve original failures if their own acquisition fails.

The parser does not verify JWT signatures and does not claim to authenticate. It rejects invalid timing hints and missing120s margin. Lifetime is measured from the captured token; there is no assumed universal fifteen-minute Forge lifetime. Live acquisition and complete report acceptance remain pending the separate frozen scenario review/run.

## Response receipts

`serializeForgeResponse(raw,{requestToken,requestHeaders})` in `forge-response-record.mjs` receives only in-memory inputs. Every valid Forge response returns sanitized `raw`, `rawEncoding:'forge-response-context-token-redacted-v1'`, original `responseSha256/responseBytes`, retained `retainedResponseSha256/retainedResponseBytes`, and sanitized parsed `data`. Only `data.invokeExtension.contextToken` is removed. All business body/error fields remain exact, including failed outer/app responses. The encoding is present even when the original response has no context token.

Malformed JSON, unexpected credential locations or an echoed request/response credential throw fixed `ForgeResponseRecordError` with a `.receipt` containing only encoding, original digest/count and fixed refusal. There is no retained raw/body. The call site records that receipt and fails; it must never serialize the original response or raw request credentials in its catch. Request headers are used only in memory to detect credential echoes: the full Cookie header, individual auth/session/token cookie values, and authorization values. Trivial preference cookies such as feature=1 are not treated as substrings to censor every issue key. Eight additional local controls in `response-record.test.mjs` prove these boundaries. Historical raw receipts and hook responses are unchanged; only the new155 scenario adopts this encoding. Its network trace must also stay disabled so it cannot bypass the explicit receipt serializer.

The actual returned transport token has exact `{jwt:string,expiresAt:string}` shape; that object is removed in full and its jwt joins the echo detector. String/null transport forms also remain supported. Unknown object fields fail closed. `serializer-precorrection-red.txt` runs the current eight assertions against archived c1b0f34 serializer source (only the import is redirected in a temporary directory): six pass, two fail on actual object shape and trivial-cookie false refusal. `corrected-combined-controls.txt` proves all23 lifecycle/serializer assertions pass on the corrected source.
