// B11 (worklist #11) — the LIVE semantic AI validation pipeline, end-to-end with the REAL Forge LLM
// (Atlassian-hosted Claude Haiku). Enables AI on a disposable violating page, enqueues a manual review
// as a REAL steward (read from the space admin config), polls the queue job to terminal, and asserts the
// model returned concrete findings that carry per-finding triage state + token accrual.
//
// OPT-IN (costs vendor-billed tokens): runs ONLY when SV_LIVE_LLM=1. The default CI coverage stays the
// simulated verdict path — this is the one live Haiku run the plan called for, kept out of grade.sh.
//
// This spec also STANDS GUARD over the B11 authz fix: enqueue-page-validation authorizes against the
// page's REAL space, resolved from its id. The old v1 read (`/wiki/rest/api/content/{id}?expand=space`)
// now returns 410 Gone for the app → resolvePageSpaceKey returned null → EVERY steward was denied. The
// fix resolves via v2 (page → spaceId → space key). A successful enqueue here proves that path is live.
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage } from "../../data/confluence.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const GKEY = "validation-config-global";
const SKEY = `validation-config-space-${SPACE}`;
const HAIKU = "claude-haiku-4-5-20251001";
const inv = (fn: string, params: Record<string, string>) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });

test.describe.configure({ timeout: 240_000, retries: 0 });

test.skip(!process.env.SV_LIVE_LLM, "live-LLM spec — set SV_LIVE_LLM=1 to run (costs vendor-billed tokens)");

test("B11: live AI validation (real Haiku) — enqueue → queue → findings, with steward authz", async () => {
  // A real steward of the space, straight from the admin config (no hardcoded personal id).
  const adminCfg = await getKvs(`admin-settings-space-${SPACE}`);
  const stewards: any[] = adminCfg?.adminUsers || [];
  const stewardId = stewards.map((s) => (typeof s === "string" ? s : s?.accountId)).find(Boolean);
  expect(stewardId, `space ${SPACE} must list at least one steward in adminUsers`).toBeTruthy();

  const origGlobal = await getKvs(GKEY);
  const origSpace = await getKvs(SKEY);
  const spaceId = await spaceIdByKey(SPACE);
  const page = await createPage({
    spaceId,
    title: `HARNESS sv-aival-live ${Date.now()}`,
    adf: doc(
      heading("Quarterly Revenue Numbers", 2),
      paragraph("This document has no assigned owner and no review date."),
      paragraph("TODO: fill in the rest later. asdfasdf lorem ipsum placeholder text."),
    ),
  });

  try {
    // AUTHZ NEGATIVE: a non-steward actor is denied (proves the gate is real, not vacuous).
    const denied = await inv("enqueuePageValidation", { page: page.id, space: SPACE, actor: "sv-aql-not-a-steward" });
    expect(denied.result?.success, "a non-steward cannot enqueue an AI review").toBeFalsy();
    expect(denied.result?.reason, "the denial names the steward requirement").toMatch(/steward/i);

    // Enable AI at the SPACE level (a space config with ai.enabled defined shadows the global one).
    await setKvs(SKEY, {
      ...(origSpace || {}),
      ai: {
        ...(origSpace?.ai || {}),
        enabled: true,
        model: HAIKU,
        monthlyTokenBudget: 0,
        notifyAuthor: false,
        severityThreshold: "low",
        rules: 'Every page must contain a "Document Owner" line naming a responsible person. Flag pages that lack one, and flag any leftover TODO/placeholder/lorem-ipsum text.',
      },
    });

    // ENQUEUE as the real steward → authz passes (the v2 page→space resolution fix).
    const enq = await inv("enqueuePageValidation", { page: page.id, space: SPACE, actor: stewardId });
    expect(enq.result?.success, `steward enqueue must succeed (authz fix live): ${JSON.stringify(enq.result)}`).toBe(true);
    const taskId = enq.result.taskId;
    expect(taskId, "an enqueue returns a task id to poll").toBeTruthy();

    // POLL the queue job to a terminal state (the consumer runs the real Haiku call, up to ~120s).
    let job: any = null;
    for (let i = 0; i < 60; i++) {
      const j = await inv("getValidationJob", { task: taskId });
      const st = j.result?.status;
      if (st === "done" || st === "error") { job = j.result; break; }
      await new Promise((r) => setTimeout(r, 3000));
    }
    expect(job, "the AI validation job reached a terminal state").toBeTruthy();
    expect(job.status, `the real Haiku run completed without error: ${JSON.stringify(job)}`).toBe("done");

    const res = job.result;
    expect(res.model, "the run is pinned to Haiku (cost backstop)").toMatch(/haiku/i);
    expect(res.parseError, "the model output parsed (no fail-closed parse error)").toBeFalsy();
    expect(Array.isArray(res.findings) && res.findings.length, "the model produced concrete findings on a violating page").toBeGreaterThan(0);
    expect(res.usage?.totalTokens, "token usage was recorded (budget accrual)").toBeGreaterThan(0);
    // The seeded page clearly lacks a Document Owner — the model should surface that rule.
    const refs = res.findings.map((f: any) => `${f.ruleRef} ${f.explanation}`.toLowerCase()).join(" | ");
    expect(refs, "a finding references the missing Document Owner rule").toMatch(/owner|document owner/);

    // getAiFindings returns the stored findings with per-finding triage state attached.
    const fnd = await inv("getAiFindings", { page: page.id, space: SPACE });
    expect(fnd.result?.aiEnabled, "getAiFindings reports AI enabled for the space").toBe(true);
    expect(fnd.result?.findings?.findings?.length, "findings are retrievable after the run").toBeGreaterThan(0);
    expect(fnd.result.findings.findings[0].state, "each finding carries a triage state (default open)").toBeTruthy();

    console.log(`### LIVE AI validation: ${res.findings.length} finding(s), ${res.usage.totalTokens} tokens, model ${res.model} ✓`);
    console.log(`###   summary: ${res.summary}`);
  } finally {
    // it47 durable restore: put both configs back exactly, and remove the disposable artifacts.
    if (origSpace) await setKvs(SKEY, origSpace);
    if (origGlobal) await setKvs(GKEY, origGlobal);
    await delKvs(`ai-latest-${page.id}`).catch(() => {}); // the getLatestFindings row (no TTL)
    await deletePage(page.id).catch(() => {});
  }
});
