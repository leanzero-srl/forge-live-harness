# Portable browser: installed-source local regressions

These tests exercise the installed `forge/portable-browser.mjs`, actual `forge/browser.ts` (transpiled in memory) and actual `scripts/lz-campaign.py`. No proposed source copy is imported. Browser objects, state readers, readiness/identity boundaries and subprocesses are faked; no browser is launched, `.auth` file read, credential exported, network request issued or tenant mutation performed.

Run from the harness root:

```sh
node --test tests/portable-browser/*.test.mjs
python3 -B -m unittest discover -s tests/portable-browser -p '*_test.py' -v
```

The first installed-source run passes30 Node tests and10 Python tests. `node-green.txt` and `python-green.txt` retain that actual output. The original requested36 checks were ported, plus the independently authored four complete-wrapper→actual-adapter composition checks. Existing assertions were preserved; only import/source-resolution paths and one proposed-to-installed comment changed.

`adapter.test.mjs` has13 original module checks; `wrapper.test.mjs` has6 installed-wrapper selection/forwarding/refusal checks; `independent-lifecycle.test.mjs` has7 independently authored lifecycle/receipt checks; `independent-wrapper.test.mjs` has4 independently authored full wrapper/adapter compositions. `runner_test.py` has6 runner-binding checks and `independent_cli_test.py` has4 independent actual-CLI/config checks. The original-route fake verifier control remains separate from real identity evidence.

Coverage includes explicit mode selection, default reserved-profile preservation, expected account/UI binding, viewport/video forwarding, runtime-version rejection before newContext, no fallback, auth/export refusal, receipt issuance, missing-receipt cleanup, original-plus-multiple-cleanup errors, late-created context after browser loss, repeated close identity, mode-specific phase environment, resume persistence/refusal and result-stamp separation.

`provenance.json` records exact candidate and installed source SHA256s at this port. The installed adapter/declaration/browser/runner were byte-identical to the reviewed app scratch files from a1755e72/3b3e8056/f6feb963. Independent tests came from ff4e75e3/a7f795c5. The original scratch sources, red witness, proposed patches and prior isolated-browser evidence remain in the app repository under `docs/campaign-2026-09/portable-browser-candidate`; this port does not overwrite them. The hashes are historical port provenance, not a claim that future installed source is unchanged: tests resolve installed paths each run.

These checks do not authenticate a session, prove portable login reuse, fix Chrome152, validate the real retained-report download, or replace live app/source-integrity guards. The tests remain bound to the currently reviewed explicit CfT151 mode until the parent chooses and reviews a separate variant. No harness implementation file or package command was edited in this test-only cut.
