# Installed portable Chromium physical viewport controls

Root released the harness instrument before this installation. `forge/portable-viewport.mjs` is byte-identical to app candidate6e2ad54f, independently reviewed and replayed in app14fc333a. The installed portable adapter adds one import and installs the helper immediately after its owned newContext, before retaining the context-close function and performing readiness. Default persistent launch, reservation, auth setup, browser mode and runner remain unchanged.

Commands from the harness root:

```sh
node --test tests/portable-browser/*.test.mjs tests/portable-viewport/*.test.mjs
python3 -B -m unittest discover -s tests/portable-browser -p '*_test.py' -v
node tests/portable-viewport/actual-chrome.mjs
npm run typecheck
```

The first two commands are local fake-resource controls:42 Node checks (30 previous assertions,11 sizing lifecycle controls and one actual installed adapter/helper composition) plus10 runner Python checks. Three old fake contexts gain empty pages and an explicit unused-newPage refusal to satisfy the real BrowserContext surface; none of their existing assertions changes.

`actual-chrome.mjs` is intentionally outside the automatic `*.test.mjs` glob. It starts only owned unauthenticated ephemeral native Chrome152 contexts, routes local hostnames entirely to local fixture HTML, and never reads storage state, calls a real tenant or opens the auth profile. It exercises real OOPIF input and actual PDF/tab lifecycle. Six width/video combinations pass72 exact real DOM event assertions and all requested public/inner/visual viewport assertions. Those tests import the installed helper, not an app scratch copy. `actual-result.json` preserves measurements; `artifact-manifest.json` hashes each retained temporary trace/video/PDF.

The original measured local red remains in the app repository at d5cc6473 and its unchanged independent replay at435a90a4. Candidate integration review is14fc333a. `provenance.json` binds these to installed source and ported test hashes. This is installed local browser evidence. Numeric-report and completed-observation live failures remain failures until actual product reruns pass; neither this helper nor these tests claim arbitrary unmanaged browser popup/window.close synchronization.

Full typecheck still reports only the two known Sentinel errors retained in `typecheck.txt`; it is not globally green. No authenticated run was launched during this installation.
