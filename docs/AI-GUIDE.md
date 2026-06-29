# forge-live-harness — AI guide (read me first)

A starter guide + rules for an AI agent (future Claude sessions) to **test the 5 Forge apps live**
with this harness. If you're here to turn a *failed run* into a fix, read [`AGENTS.md`](../AGENTS.md)
instead (that's the evidence→fix contract). This guide is for **writing and running scenarios**.

> One-line mental model: this harness drives the **real, deployed apps on wolfaenpak** — through the
> live Custom-UI iframe (browser) and through Jira/Confluence REST + each app's **dev `_testState`
> webtrigger** — and asserts the result against an independent **oracle**. It is how we catch
> in-product bugs that offline unit tests can't see.

---

## The two testing layers

| Layer | What it does | When to use | Flakiness |
|---|---|---|---|
| **Render smoke** | Browser navigates the module's deep-link, enters the Forge iframe, asserts it mounted + isn't blank | every UI module (globalPage, spacePage, globalSettings) | retry (iframe load) |
| **Deep scenario** | Creates real data via REST, drives the app's logic (settle / fire a transition / edit a page / POST a webtrigger / invoke a task), asserts via a REST or KVS/SQL **oracle** | the actual logic — where ~all bugs live | 0 retries if deterministic |

Most value is in **deep scenarios**. A render smoke proves "it loads"; a deep scenario proves "it's
*correct*".

---

## Repo map (where things live)

```
config/targets.ts      app+module REGISTRY (target ids, deep-links, repos). Add a target here.
config/env.ts          repo-root + BASE_URL; data/env.mjs = the zero-dep .env loader
data/                  REST helpers (ESM, no build):
  jira.mjs               request/get/post, doTransition, searchJql, retry/backoff   (BASE/AUTH from .env)
  confluence.mjs         createPage/readPage/writeAdf, uploadAttachment/mediaNode/setContentProperty
  jira-build.mjs         createIssue/setDates/linkBlocks/deleteIssue (issue fixtures)
  adf.mjs                ADF node builders (paragraph/heading/table/macro/extension)
  cogni-workflow.mjs     attachSelfLoopRules/detachByNamePrefix (CogniRunner workflow rules)
testhook/              dev webtrigger CLIENTS:
  client.ts              getTestState(app, query)  — lz-ppm / cognirunner / sentinel-vault (Bearer HARNESS_SECRET)
  altomata.ts            altomataAction/altomataTrigger — Altomata (POST, x-altomata-secret header)
  licenseleash.ts        licenseLeashState(what, params) — License Leash (x-testhook-secret header)
scenarios/<app>/*.spec.ts   the tests (one dir per app)
scenarios/_support/    renderCheck (shared render smoke), wait (waitForTerminal), lzfixture (createFixtureRetry)
fixtures/forge.ts      Playwright fixture → { page (authed), recorder } for UI specs
forge/                 deeplink.ts (URL builders), frame.ts (enterForgeSurface), host.ts (issuePanel/macro), browser.ts (assertLoggedIn)
findings/coverage-*.md COVERAGE MATRIX per app (FULL/DEEP/SMOKE/NONE-GAP) + remaining gaps — read coverage-INDEX.md
.env  (gitignored)     secrets, env IDs, webtrigger URLs
```

---

## GOLDEN RULES

### Safety (non-negotiable)
1. **wolfaenpak is THE testbed** — freely create/seed/mutate/tear-down there. Targets are baked to the
   wolfaenpak *development* installs. Never point a test at a real customer tenant. (Altomata is *also*
   installed on `alterdomus-sandbox`, License Leash *also* on `axpo-trial` — **leave those alone**.)
2. **Never run an irreversible mutation against real users / licenses / content.** For destructive
   flows use **DRY-RUN or synthetic test data**:
   - License Leash revoke/sync **mutate real group memberships** → the revoke triggers are *disabled*
     in its deployed manifest (an uncommitted safety edit). Keep them disabled. Test the revoke
     *decision* with `invoke=deactivateDryRun` (audit-only). A real round-trip is allowed **only** on a
     disposable account (the `zerobarat1` smurf) with guaranteed `finally` cleanup.
   - Sentinel `expirySweep` is **notification-only** (sets `expiry-notified-*`, no delete) → safe to
     invoke; use a synthetic seal with `contentId:null` so no real page gets a comment.
3. **Tag created data `[harness-test]` and clean up in `finally`** (deleteIssue / deletePage /
   deleteFixture / delKvs / detachByNamePrefix). Exception: **COGTEST issue-delete is 403** → reuse the
   persistent `HARNESS-BARRAGE-FIXTURE`, never accumulate issues there.
4. **Secrets live ONLY in the gitignored `.env`.** Never commit a token/secret/webtrigger URL.
5. **App-code fixes go in the APP repo, not the harness.** Then `forge deploy -e development` *before*
   asserting. Remotes: harness → push `main`; Sentinel → push `harness/test-hook`; **lz-ppm + License
   Leash have NO git remote → commit locally only**; CogniRunner has a remote but its WIP is the owner's.

### Conventions
6. **Deterministic REST/engine specs run at 0 retries** (a failure = a real finding). **Live-UI +
   async-trigger specs carry retries** (iframe flake, trigger latency, REST eventual consistency):
   `test.describe.configure({ retries: 2-3 })`.
7. **Verify a fix by FLIPPING the spec** from asserts-buggy → asserts-correct and watching it go
   red→green. That spec is then the regression guard.
8. **Assert against an independent ORACLE** — a REST read, the app's *own* core function, or a
   trigger's terminal KVS/SQL state — never the thing under test.
9. **Poll async outcomes with `waitForTerminal`** (from `_support/wait`). Don't `sleep`.
10. **To find bugs, probe adversarial/edge inputs** — empties, boundaries (==limit, +1), unicode/emoji,
    dependency cycles, malformed dates, over-budget, missing params. That's where the bugs are.

---

## How to add a scenario (recipes)

**Render smoke** (any UI module):
```ts
// 1) add a target in config/targets.ts with deepLink + (optional) readySelector
// 2) the spec:
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { checkForgeRenders } from "../_support/renderCheck";
const T = getTarget("my-target-id");
test.describe.configure({ retries: 3 });
test("renders", async ({ page, recorder }) => { await checkForgeRenders(page, recorder, T); });
```

**Deep scenario** (the real pattern):
```ts
// create data (REST) → drive logic (hook/REST) → assert via oracle → clean up
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
import { createIssue, deleteIssue } from "../../data/jira-build.mjs";
test("…", async () => {
  const j = await createIssue({ projectKey: "WFH", issueType: "Work package", summary: "… [harness-test]" });
  try {
    /* drive: settle / transition / page-edit / webtrigger / invoke */
    /* assert against an oracle (REST read or the app's own logic) */
  } finally { await deleteIssue(j.key).catch(() => {}); }
});
```

---

## Per-app cheat-sheet

### 1. lz-ppm — "LeanZero Management" (Jira PPM)
- **Targets:** `lz-ppm-dashboard` (globalPage render).
- **Dev hook** — `getTestState("lz-ppm", { what, … })` (Bearer `HARNESS_SECRET`):
  `fieldConfig` · `plans` · `plan` · **`settle`** (runs the real `recalculateFullPlan`) · **`refreshPlan`**
  (the real per-plan scheduled-refresh) · **`incrementalUpdate`** (issue-updated path) ·
  **`createFixture`** (`jql`→indexed plan) · **`applyEdit`** (set a KVS field, keeps `_original`) ·
  **`deleteFixture`**.
- **Data:** `createIssue`/`setDates`/`linkBlocks`/`deleteIssue` (jira-build), `createFixtureRetry`
  (`_support/lzfixture`). WFH field ids: start `cf_10015` / duration `cf_10180` / buffer `cf_10181` /
  due native; link "Blocks" (direction reversed in lz-ppm's model — see `linkBlocks`).
- **Canonical scenario:** create issues + dates + Blocks links → `createFixture` → `settle` → assert the
  cascade / working-days / parent-rollup output (oracle = the app's own `cascade-core`, ported to
  `expected/`).
- **Gotchas:** the calc engine has a `visited`-guard (cycles + diamonds are safe). `SHARD_SIZE = 100`
  (`project = WFH` ≈ 287 issues = 3 shards — see `sharding.spec.ts`). The two blockers (B1/B2) were the
  hourly refresh dropping non-default fields/descendants.

### 2. CogniRunner (Jira AI-workflow)
- **Targets:** `cognirunner-global` (globalPage render).
- **Attach rules** — `data/cogni-workflow.mjs` `attachSelfLoopRules(WF, HUB, [{name,type,config}])`,
  `detachByNamePrefix(WF, prefix)` to clean up. `type` ∈ `validator|condition|static|semantic`.
  `WF = "Software Simplified Workflow for Project COGTEST"`, `HUB = "10003"`. Fixture: the persistent
  COGTEST issue **`HARNESS-BARRAGE-FIXTURE`** (in hub `10003`; delete is 403 → reuse).
- **Fire:** `doTransition(key, transitionId)` → `status >= 400` = BLOCKED.
- **Config shapes:** premade (deterministic) `{ruleKind:"premade", ruleType, fieldId, …}`; AI validator
  `{fieldId, prompt, enableTools:false}` (no `ruleKind`); static PF `{type:"postfunction-static",
  functions:[{code:"await api.updateIssue(api.context.issueKey,{…})"}]}` (sandbox API =
  getIssue/updateIssue/searchJql/transitionIssue/log/context); semantic PF `{type:"postfunction-semantic",
  fieldId:src, conditionPrompt, actionPrompt, actionFieldId:target}`.
- **AI is deterministic with UNAMBIGUOUS prompts** ("ALWAYS FAIL / ALWAYS APPROVE", "Output exactly
  TOKEN"). Provider = Forge LLM (`atlassian`, no key).
- **Gotchas:** ⚠️ **workflow CONDITIONS are UI-only — REST `doTransition` BYPASSES them** (not
  REST-testable). `field-required` allows whitespace (F-COGNI-1). Dev hook (Bearer):
  registry/provider/logs/kvs.

### 3. Sentinel Vault (Confluence content-protection)
- **Targets:** `sentinel-vault-realm` (spacePage render), `sentinel-steward-console` (globalSettings render).
- **Dev hook** — `getTestState("sentinel-vault", …)` (Bearer): `kvs` get · dev `set`/`delete` ·
  **`invoke` `fn=expirySweep`** (drives the scheduled task).
- **Data:** confluence.mjs `createPage`/`readPage`/`writeAdf` + `uploadAttachment`/`mediaNode`/
  `setContentProperty`; adf.mjs builders.
- **Canonical scenarios:** *validation rules* — `set` `validation-config-global`, create a page in a
  probe ADF, poll the page-content-trigger's terminal outcome (`validation-lastgood-{id}` set =
  compliant, a comment posted = violation). *Sealed section/media restore* — set the seal KVS record +
  a `protection-` (media) / `section-protection-` (section) **content property** (the trigger's
  fast-path gate), edit the page, poll for restore.
- **Sealed MEDIA:** ⚠️ synthetic media fileIds are stripped on write → **upload a REAL attachment**,
  embed `mediaNode(fileId, pageId)`; seal = KVS `protection-{attId}` `{contentId, lockedBy,
  sealedFileId}`. See `sealed-media.spec.ts`.
- **Gotchas:** the rules engine is the most bug-prone surface (SV-m4/m5/M4 + the deepening-found
  SV-NEW-1 emoji code-points, SV-NEW-2 expand outline). `extractPlainText` counts **code points**;
  `collectHeadings` excludes table/panel/macro bodies but **includes expands**. `expirySweep` is
  notification-only (safe).

### 4. Altomata (Jira automation)
- **Targets:** `altomata-hub` (globalPage render).
- **Dev hook** — ⚠️ **DIFFERENT from the others**: `testhook/altomata.ts` `altomataAction(actionKey,
  params)` / `altomataTrigger({probe,…})` — **POST** with an **`x-altomata-secret`** header (not Bearer).
  The backend uses HTTP **422** for graceful `{ok:false}` failures (the client returns the JSON body for
  any status).
- **Canonical scenario:** *clone* — `createIssue` source → `altomataAction("clone", {sourceKey,
  targetProjectKey, targetIssueTypeId})` → REST-verify the copy (Cloners link + comment). Adversarial
  inputs (bad project/type/missing params) → graceful `{ok:false, error}`.
- **Gotchas:** tested on **wolfaenpak** (the Forge CLI principal lacks alterdomus-sandbox admin to mint
  a webtrigger URL there). Secret = `ALTOMATA_TRIGGER_SECRET`, URL = `ALTOMATA_TRIGGER_URL_WOLF` (both
  from the `alterdomus` skill's `credentials.env`).

### 5. License Leash (axpo-license-manager, Confluence license enforcement)
- **Targets:** `license-leash-reactivation` (globalPage render), `license-leash-admin` (globalSettings render).
- **Dev hook** — `licenseLeashState(what, params)` (`x-testhook-secret` header): **READ**
  `counts` / `schema?table=` / `activity?accountId=` / `deactivationLog?accountId=` / `config?key=` ;
  **`invoke` `fn=deactivateDryRun&accountId=`** (safe — audit-only).
- **Canonical scenarios:** reactivation webtrigger token-rejection (`callReactivationWebtrigger`:
  missing→400, forged→reject); activity pipeline (create a page → `user_activity` records the actor);
  SQL state (8 tables migrated + schema); deactivation flow **dry-run** (asserts a `DRY_RUN_DEACTIVATE`
  audit row).
- **SAFETY:** ⚠️ revoke triggers are DISABLED in the deployed manifest. **Never** drive a real
  revocation/sync that touches real users — use dry-run / synthetic / the smurf-with-cleanup.
- **Gotchas:** Forge SQL (8 tables). The reactivation HMAC secret is only generated on the first real
  deactivation. The 424 bug (webtrigger string headers) is fixed.

---

## Forge platform gotchas / facts (hard-won this campaign)

1. **Webtrigger response headers MUST be array-valued** — `{'Content-Type': ['text/html']}`. A string
   value → the platform returns **424** before your handler logic runs (this was the License Leash bug).
2. A **`forge variables set` change needs a `forge deploy`** to take effect — until then the function
   sees the old value (a secret-gated webtrigger returns 404).
3. A **webtrigger function must NOT declare `timeoutSeconds`** (only `consumer`/`scheduledTrigger` may).
4. **Forge SQL** rejects a *bound* param for `LIMIT`, and a no-`WHERE` `ORDER BY` on some varchar
   columns — interpolate a clamped int / add a `WHERE`.
5. **Forge workflow CONDITIONS are UI-visibility-only** — the REST transition API runs regardless
   (verified: a false `field-has-value` condition still returns 204). Not REST-testable.
6. **Confluence strips synthetic media nodes** on write — upload a real attachment and reference its
   `fileId`.
7. **Deep-links** (`forge/deeplink.ts`): `jiraGlobalPage`, `confluenceGlobalPage`,
   `confluenceSpacePage`, **`confluenceGlobalSettings` = `/wiki/admin/forge/apps/{appUuid}/{env}/{module}`**
   (under admin → Settings → Apps). `jiraIssuePanel` + `confluenceMacro` are **NOT** deep-linkable →
   drive them via `forge/host.ts`.
8. **Jira mangles far-future years** (2099 → 1999) on storage — avoid them in date tests.

---

## Where to look next
- **[`findings/coverage-INDEX.md`](../findings/coverage-INDEX.md)** — the live coverage matrix per app
  (FULL/DEEP/SMOKE/NONE-GAP) + the remaining gaps and *why* each is open (platform-limited /
  mutation-risky / non-deterministic).
- **[`FINDINGS.md`](../FINDINGS.md)** — the bug findings.
- **[`AGENTS.md`](../AGENTS.md)** — the evidence→fix-report contract (the failure-loop side).
- **[`RUNBOOK.md`](../RUNBOOK.md)** — run commands + the full target table.
