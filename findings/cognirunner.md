# CogniRunner — findings & test evolution

App: AI workflow validators/conditions/post-functions (Jira). Suite: `scenarios/cognirunner/*`. **Fix-owned by the user.**

## Coverage (live, 3× zero-flake)
- Adversarial premade-rule barrage: 29 cases on COGTEST self-loop transitions — field-required, field-comparison (numeric+date boundaries), text-length, field-regex, allowed-values, date-relative, field-cardinality, incl. boundary/coercion/ADF/case probes. (`premade-barrage.spec.ts`)
- Setup-heavy validators (3 cases, 3× green — `premade-extra.spec.ts`):
  - **sub-tasks-resolved** — VERIFIED CORRECT: open subtask (COGTEST "Sub-task") → blocks; resolve the subtask → allows.
  - **attachment-required** — VERIFIED CORRECT: no attachment → blocks; after a REST multipart upload → allows.
  - **comment-required** — block path VERIFIED CORRECT (no comment → blocks). HARNESS CONSTRAINT (not a bug): the validator reads `modifiedFields.comment`, populated only by the transition-screen UI; a REST `update.comment` does NOT surface there, so the allow path isn't REST-reachable (documented).

## Findings
- **F-COGNI-1 (confidence high):** `field-required` allows whitespace-only ("   ") — `isEmpty()` doesn't trim plain strings. Scoped fix: trim in the field-required branch. *(User is handling fixes.)*

## Non-findings (investigated, ruled out)
- date `gt` "rejecting" a future date → Jira stores 2099-01-01 as 1999-01-01 (platform quirk), rule is correct.

## Test plan — open (if loop revisits)
- 11 condition types (mirror as validators); sub-tasks-resolved/attachment-required (seed subtasks/attachments); comment-required/field-changed (transition screen fields); exotic field formats (cascading/Insight/checklist/sprint) via extractFieldDisplayValue.
