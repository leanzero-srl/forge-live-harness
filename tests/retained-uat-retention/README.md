# Retained UAT experiment policy

Semantic source freeze: `764effc`, based on independently reviewed departure cut `c2e75b3`. This is an isolated preparation, not a live UAT verdict. No browser, Jira or Forge calls were executed by these local controls.

The actual UAT opts into `createRetainedUat(info,{retainExperiments:true})`. The fixture defaults remain unchanged for callers without that explicit option. On failed admission or journey, known plans, Jira issues, parent links and published reports remain. Unknown create replies retain the original intent and exact known IDs; the existing read-only reconciliation and positive ownership checks still fail closed. The fixture never retries a create or invents an ID. Preference restoration, source checks and exact registry checks remain mandatory. Successful UAT behavior and its deliberate duplicate-capture deletion remain unchanged.

A guarded failed fixture is labelled `retained-after-failure`; a failed guard remains `recovery-required`. Neither label claims passing UAT. Original errors are rethrown unchanged when recovery guards succeed and retained as original objects in an AggregateError when independent guards fail. The spec skips generic report cleanup on a failed body under this policy; its successful path still uses the original `retainPublished:true` behavior.

## Evidence

`original-red.txt` records the first test invocation's unavailable local TypeScript dependency. After linking existing local dependencies, `original-behavior-red.txt` records the actual original behavior: three retention failures, two controls passing. `corrected-green.txt` is the same five controls passing against the source correction.

`combined-first.txt` preserves the first combined result (20 passing, one failed). The sole failure asserted that the entire fixture still equalled the pre-retention source. The owned departure test now checks unchanged shared helpers separately and pins the intentional fixture change to its independently reviewable source commit `764effc`. It also requires the actual explicit opt-in admission before assigning departure ownership; the previous substring was no longer present. No business assertion, wait budget, shared helper or independent reviewer test was changed.

`combined-green.txt`: 24 tests pass, including seven new controls. They execute compiled actual admission/finalizer code, preserve two plans and four issues without cleanup writes, preserve uncertain intent and original errors, prove preference/source audit behavior, and compare the full original UAT business body byte-for-byte. Existing default-admission, report-oracle and departure controls remain green.

Run from this isolated worktree:

```sh
/Users/mihaiperdum/.nvm/versions/node/v22.22.0/bin/node --test tests/retained-uat/*.test.mjs tests/retained-uat-departure/*.test.mjs tests/retained-uat-retention/*.test.mjs
```

`typecheck.txt` contains only the two inherited, unrelated Sentinel errors. The two changed UAT source files introduce no reported type errors. Local tests are not evidence of actual field applicability, successful live admission, retained UI content or human UAT acknowledgement; those gates remain pending.
