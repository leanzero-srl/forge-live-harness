# Opt-in owned browser lifecycle discriminator

Semantic source freeze: `3982efa`, based on `a8bc0b1e3764ea4561d40635ca82b328147ca211`. Only `forge/browser-process-observation.cjs` and `forge/portable-browser.mjs` affect the harness runtime. No application files, browser flags, dependencies, timeouts, storage state, request handling or shutdown promises changed.

This measures the next run; it does not repair shutdown or retroactively change the failed `retained-toolbar-comparison-20260906` verdict. Installed Playwright 1.61.1 is preserved. Root's upstream references corroborate a possible mechanism: [Chrome issue 39736](https://github.com/microsoft/playwright/issues/39736) reports inherited background-process pipes on macOS; [Edge issue 41210](https://github.com/microsoft/playwright/issues/41210) gives exit-before-stdio timing. The merged [PR 41330](https://github.com/microsoft/playwright/pull/41330) adds a Chromium launch switch that inhibits the updater scheduler. It does not replace process-close with process-exit. No such switch is introduced here, and these reports do not establish the cause of our run.

## Launch binding

The existing supervisor creates its new run directory and sets `LZ_BROWSER_PROCESS_OBSERVATION_DIR` to that absolute path. Its basename is the exact safe run ID, e.g. `retained-toolbar-observed-20260906`. Append `--require=<absolute checkout>/forge/browser-process-observation.cjs` to the owned runner's `NODE_OPTIONS`, preserving any existing options. Do not enable raw DEBUG or DEBUG_FILE. Bind both runtime file hashes in the launch receipt. No caller-supplied credential, browser key, argument or stderr content is written.

The preload wraps Node's existing `child_process.spawn` once. Without the opt-in environment it does not install a wrapper. Until the portable launcher explicitly arms observation, every spawn is forwarded without observation. Once armed, only the exact fixed Chrome executable and portable pipe/argument shape are admitted. A second matching spawn or wrong shape makes the diagnostic incomplete; it neither blocks nor alters the actual spawn. The original receiver, arguments, return object and synchronous error are preserved. No filesystem API interception is installed.

The journal is `browser-process-<actual worker PID>.json`, created exclusively with mode 0600. Other preload-bearing processes that never arm observation do not create a file. Fresh run directories are required; an existing same-PID journal is refused. The raw directory, profile argument, executable path, account identity, stderr/stdout bytes and exception text are absent from its content.

## Schema and terminal interpretation

`schema` is `owned-browser-process-v1`. Top-level fields are `runId`, `workerPid`, `parentPid`, `browserPid`, `failed` and `events`. Every event has fixed `kind` and finite monotonic `atMs`; applicable fields are positive `pid`, `stream` in 1–4, boolean `connected`, integer-or-null `exitCode`, and null or fixed signal names (`OTHER` for an unknown name). No arbitrary text is retained.

A fully observed normal close contains 15 events: armed, spawn-returned, process-spawn, browser-attached, browser-close-start, channel-close-start, process-exit, four stdio-close records, process-close, browser-disconnected, channel-close-complete, browser-close-complete. Their actual interleaving is retained; these are not presented as a forced sequence. The journal cap is 32. Native Playwright may use its existing kill fallback; an exit code/signal is recorded without reclassifying the original close result. The observer sends no signal.

The public API logger records only exact browser.close start/succeeded/failed markers. The public disconnected listener and isConnected observations expose the client boundary. No data/readable/error listeners, stream consumption, stream modification, extra native close calls, timers or asynchronous waits are added by the runtime observer. Existing error listeners retain their original behavior. Evidence writes are synchronous; thrown or asynchronous injected sinks cannot block callbacks or create unhandled rejections, and cannot pass the evidence check.

The original context and browser close calls are still awaited in their original order. After a successful native close, the diagnostic check requires every process/stream/client record exactly once. Missing evidence therefore fails, rather than producing a fabricated passing shutdown. If close remains pending, the journal retains the latest events and the existing worker/supervisor limits still determine failure. An event source or write failure may prevent a trustworthy final journal; `failed:false` by itself is never sufficient admission. Require the complete event set and actual runner terminal.

Exit present with one or more stdio closes absent demonstrates the stalled process-stream boundary for that actual owned PID. All four stream closes plus child close, but no channel completion, narrows the remaining wait to cleanup/server/channel handling. This cut intentionally does not observe temporary-directory removal. Channel completion with no disconnected event narrows the final client wait. No updater/crashpad identity should be inferred from an open pipe alone.

## Local proof and remaining gate

```sh
/Users/mihaiperdum/.nvm/versions/node/v22.22.0/bin/node --test tests/browser-process-observation/observation.test.cjs tests/portable-browser/*.test.mjs tests/portable-viewport/portable-viewport.test.mjs tests/portable-viewport/adapter-composition.test.mjs tests/toolbar-comparison-visual/close.test.mjs
```

59 controls pass: 10 new plus 49 existing. The real installed `launchProcess` is exercised under the actual preload with a test-only lower-level executable bridge that starts a naturally terminating Node process, never Chrome. It proves the installed spawn reference reaches the observer and records exit before inherited pipes close. A second composition uses the actual portable launcher and a held browser close, proving that observation cannot settle it early and launch arguments remain identical apart from the opt-in logger. Other controls preserve original spawn/event exceptions, refuse foreign/duplicate/missing boundaries, and reject credential-like log content and hostile sinks.

Preserved owner reds: an incorrect expected event count (16 instead of 15), malformed stdio observation validation (fixed with an array guard), random uppercase temporary test basename (corrected test run directory), and the installed bundle's private package export (resolved by its actual absolute installed path). None is a live failure or an excuse to weaken observation.

The real blank Chrome152 launch/public logger wiring is a separate pending local gate owned by the sole tester after review. It uses empty storage and a no-op identity seam, with no site/auth calls. Full authenticated live diagnosis is also pending; this document claims neither.
