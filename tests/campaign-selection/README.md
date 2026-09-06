# Selected campaign completion correction

The sole runtime change is scripts/lz-campaign.py. It runs the same selected units and preserves the existing result stamps, entry guard, phase classification, source/identity checks, retries policy, time budgets and process ownership. No browser/site/test journey was executed for this correction.

The actual final-six-regressions-20260906 run selected normalization and persistence-durability. Both have passed before/tests/after receipts with one and five business tests respectively. The archived runner reported incomplete/exit 2 because summarize.complete covered every manifest entry, including unselected and planned features. Exact metadata copies and original paths/SHA-256/byte counts are under actual-six. The original summary/state remain incomplete and are never rewritten. This metadata reproduction is not a replacement for the independent business/visual acceptance review of that run.

`summary.complete` and `summary.features` retain their whole-manifest meanings. New `summary.selectedRun = {featureIds, complete}` contains the exact validated selection in manifest order. Its completion uses the same stamped rows and blocker, never a separate pass shortcut. The runner's terminal state/exit now uses selectedRun.complete. Markdown labels both scopes explicitly. Status/results display invalidates both completion flags when the instrument changes; historical summaries lacking selectedRun keep their original schema. The status command still returns 0 for a successful inspection, not as a campaign acceptance assertion.

Omitted/null selection still means the full inventory. Explicit selections must be a nonempty list of unique exact known IDs. Malformed/unknown/empty/duplicate selections refuse before lane acquisition and before summary publication. A planned selected unit, missing/failed/known-defect/running/timed-out/stale result, wrong identity stamp or blocker cannot complete. No automatic migration or reclassification of past results is performed.

Consumer search covered tracked scripts/tests/scenarios/config and README, excluding bulky historical evidence and foreign binary artifacts. The only readers of this runner's completion bit are run terminal handling, its status/results view and its Python controls. The eighteenth recovery contract SHA-pins an existing historical summary and remains unchanged. scripts/run-batches.sh generates a separate batch summary schema; unrelated CogniRunner analysis summaries are likewise not this runner's consumers. All original 23 runner, six browser-binding and four independent CLI tests pass unchanged.

The new nine controls replay the pinned actual-six metadata through summarize and the real run orchestration (only the fresh entry phase and local lane/instrument transport are substituted; unexpected phase execution refuses). They assert selected completion and exit 0 while retaining whole-manifest incompletion and byte-identical result receipts. Additional controls reject stale source/UI/Forge/app/instrument/browser/principal identities, missing/failed/unknown states, explicit invalid selections, failed entry and a final instrument change. Default all-pass/all-unfinished cases and stale CLI output are covered. Original-red.txt preserves the first archived-source refusal; test/evidence freeze 541f75b precedes the runtime correction.

Reproduce locally:

```
python3 tests/campaign-selection/selected_test.py
python3 -m unittest discover -s scripts/tests -p 'test_lz_campaign.py'
python3 tests/portable-browser/runner_test.py
python3 tests/portable-browser/independent_cli_test.py
```

42 controls pass. Existing process-lifecycle tests create and clean only their own local subprocess groups. No shared config/state/result was written. This isolated patch changes the runner instrument hash and must be integrated only outside an active campaign; it cannot make the archived instrument current or retroactively change its exit code.

## CLI admission follow-up

Root found that the initial CLI still converted explicit --features '' into None and allowed a detached launch before run() rejected other invalid selections. f4a2d97 preserves the actual CLI red: explicit empty, delimiter-only, unknown, mixed-unknown, duplicate and whitespace-altered selections for both start and resume previously reached the launch branch. The first fake child returned None, producing an irrelevant pid failure; cli-prelaunch-red.txt is retained and cli-prelaunch-exact-red.txt uses a real-shaped local stub to prove the missing prelaunch refusal directly. No process was launched by either control.

The CLI now distinguishes absent from explicitly empty and validates the assembled selection before creating the run directory, writing config/state, clearing STOP or spawning its detached child. Invalid selections yield argparse exit2 and leave original config/state/summary bytes unchanged. Omitted selection still persists None and means all features; explicit valid selection is preserved exactly. This is the same selected_feature_ids validator used by run and summarize, with no new execution policy. All 44 local controls pass (11 selection/CLI plus unchanged 23 runner, six binding and four independent CLI). The source remains isolated while the private live witness holds the shared instrument frozen.
