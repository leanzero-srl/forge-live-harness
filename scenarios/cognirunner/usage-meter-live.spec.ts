// LIVE: does the AI-usage meter actually count RUNTIME AI calls? Reads "calls this month"
// from the admin Settings meter, fires a batch of real AI-VALIDATOR transitions on COGTEST
// (each an always-fail Forge-LLM call), re-reads the meter, and asserts it moved materially.
// Owner question: "6 calls this month is too low — force transitions and prove it counts."
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { enterForgeSurface } from "../../forge/frame";
import { assertLoggedIn } from "../../forge/browser";
// @ts-ignore
import { attachSelfLoopRules, detachByNamePrefix } from "../../data/cogni-workflow.mjs";
// @ts-ignore
import { doTransition, searchJql } from "../../data/jira.mjs";

const T = getTarget("cognirunner-global");
const WF = "Software Simplified Workflow for Project COGTEST";
const HUB = "10003";
const N = 16; // fires (a few absorb rule-attach eventual consistency; blocks == real AI calls)

test.describe.configure({ timeout: 300_000, retries: 0 });

async function readCallsThisMonth(page: any): Promise<number> {
  const surface = await enterForgeSurface(page, { surface: T.surface, readySelector: T.readySelector });
  const frame = surface.kind === "custom" ? surface.frame : null;
  if (!frame) throw new Error("expected admin custom-UI iframe");
  await frame.locator(".tab-btn", { hasText: /^\s*Settings\s*$/ }).first().click();
  await frame.locator(".usage-num").first().waitFor({ timeout: 20_000 });
  const stat = frame.locator(".usage-stat", { hasText: "calls this month" }).locator(".usage-num").first();
  const txt = (await stat.innerText()).replace(/[^0-9]/g, "");
  return parseInt(txt || "0", 10);
}

test("🔢 AI usage meter counts real runtime AI-validator calls", async ({ page }) => {
  test.skip(!T.envId, "COGNI_ENV_ID unresolved");
  const ex = await searchJql(`project = COGTEST AND summary ~ "HARNESS-BARRAGE-FIXTURE"`, ["summary"], 3);
  test.skip(!ex.length, "HARNESS-BARRAGE-FIXTURE issue missing on COGTEST");
  const key = ex[0].key;

  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  const before = await readCallsThisMonth(page);
  console.log(`METER BEFORE: ${before} calls this month`);

  const rules = await attachSelfLoopRules(WF, HUB, [
    { name: `ZMETER-fail-${Date.now()}`, type: "validator", config: { fieldId: "summary", prompt: "Automated meter test. ALWAYS FAIL: return isValid=false no matter what the field says.", enableTools: false } },
  ]);
  let aiCalls = 0;
  try {
    for (let i = 0; i < N; i++) {
      const r = await doTransition(key, rules[0].transitionId);
      if (r.status >= 400 && /AI Validation/i.test(String(r.text || ""))) aiCalls++; // a real AI verdict blocked it
      await new Promise((s) => setTimeout(s, 500));
    }
  } finally {
    await detachByNamePrefix(WF, "ZMETER-").catch(() => {});
  }
  console.log(`FIRED ${N} transitions → ${aiCalls} produced a real AI-validator block (= AI calls)`);

  await new Promise((s) => setTimeout(s, 3000)); // let the last best-effort meter write settle
  await page.reload({ waitUntil: "domcontentloaded" });
  const after = await readCallsThisMonth(page);
  console.log(`METER AFTER: ${after} calls this month  (Δ ${after - before}, aiCalls ${aiCalls})`);

  expect(aiCalls, "the always-fail AI validator must have blocked at least once (AI path runs)").toBeGreaterThan(0);
  expect(after - before, `the meter must increase ~by the number of real AI calls (${aiCalls}); if it stayed flat the runtime meter seam is broken`).toBeGreaterThanOrEqual(Math.ceil(aiCalls * 0.6));
});
