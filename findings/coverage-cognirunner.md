# Coverage matrix — CogniRunner (Jira AI-workflow)

Module × live behaviour × asserting spec (in `scenarios/cognirunner/`) × rating. See [INDEX](coverage-INDEX.md).

| Module (key) | Type | Live platform behaviour | Asserting spec | Coverage |
|---|---|---|---|---|
| ai-text-field-validator | jira:workflowValidator | Blocks a transition when a rule fails | `premade-barrage.spec.ts` (21 cases) + `premade-extra.spec.ts` (3 cases: sub-tasks/attachment/comment) — **premade rules only** (`ruleKind:"premade"`) | DEEP (premade) |
| ai-text-field-condition | jira:workflowCondition | Hides a transition when a rule fails | — *(NOT REST-testable: Forge conditions are UI-visibility-only — verified that the REST `doTransition` executes regardless, status 204, even with a `field-has-value` condition false. Needs real Jira-UI driving.)* | NONE-GAP (platform-limited) |
| ai-semantic-post-function | jira:workflowPostFunction | AI reads source field → writes target field post-transition | — (AI-evaluated → non-deterministic) | NONE-GAP |
| ai-static-post-function | jira:workflowPostFunction | Runs sandboxed saved JS steps post-transition | `static-postfunction.spec.ts` — a saved `api.updateIssue` step runs on a real transition and writes a field, verified via REST | DEEP |
| cognirunner-global-page | jira:globalPage | Admin panel render | `global.spec.ts` (render smoke) | SMOKE |
| cognirunner-admin-settings | jira:adminPage | Provider/key/model settings | — | NONE-GAP |
| cogni-llm | llm | Atlassian-hosted Claude provider | — | NONE-GAP |
| async-ai-consumer | consumer | Codegen/fix/review async tasks (120s) | — | NONE-GAP |
| attachment-bridge | webtrigger | Serves an attachment as base64 behind a one-shot token | — | NONE-GAP |
| attachment-upload | webtrigger | Receives base64 → attaches to issue | — | NONE-GAP |
| harness-test-state | webtrigger (dev) | registry/provider/logs/kvs reads | not used by current specs (specs use Jira REST) | infra |

## Gaps → covering test (priority order)
1. ✅ **DONE — static post-function** (`static-postfunction.spec.ts`): a saved sandbox step runs on
   a real transition + writes a field. **Platform-limited — condition**: Forge conditions are
   UI-visibility-only (REST `doTransition` bypasses them), so they need real Jira-UI driving, not REST.
   **Still open — AI validator + AI semantic post-fn**: these invoke the LLM at runtime, so block/allow
   and the written value are non-deterministic. A test could assert the path *runs* (a result returns)
   but not assert correctness; acceptance belongs in unit tests with a mocked LLM. Lower priority.
2. **cognirunner-admin-settings** (NONE): render the admin page, flip the provider, assert the KVS
   `COGNIRUNNER_AI_PROVIDER` via the dev hook.
3. **async-ai-consumer** (NONE): enqueue a long task, poll the result through queued→complete.
4. **attachment-bridge / attachment-upload** (NONE): exercise the one-shot-token read + write,
   assert single-use enforcement and that bytes attach to the bound issue.

## What IS covered
The **premade workflow-validator engine** is covered DEEP/adversarially: 24 cases across
field-required (incl. the F-COGNI-1 whitespace finding), comparison, text-length boundaries, regex,
allowed-values, date-relative, cardinality, plus stateful sub-tasks/attachment/comment gating — all
on REAL self-loop transitions. **The entire AI path (the app's reason for existing) is the gap.**
CogniRunner's fixes (F-COGNI-1 + unicode code-points + numeric coercion) shipped earlier (commit
`53ee5bd`) and the barrage guards them.
