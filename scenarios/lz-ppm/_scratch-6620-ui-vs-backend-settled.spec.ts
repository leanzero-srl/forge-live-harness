// TESTER (6.62.0): the DECISIVE variant — the SAME comparison on the plan the
// backend has ALREADY settled. If the UI agrees here, the earlier B divergence is
// "an unsettled plan renders its stored dates"; if it disagrees, the two engines
// genuinely disagree about the same plan.
import { test, expect } from "@playwright/test";
import { getTarget } from "../../config/targets";
import { assertLoggedIn, launchHarnessContext } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = process.env.SHOT_DIR || "/tmp";
const STATE = process.env.STATE_FILE || "/tmp/lz-6620-seed.json";
test.describe.configure({ retries: 0, timeout: 1_200_000 });

test("B — the SETTLED plan in the UI, then one small edit", async () => {
  const st = JSON.parse(fs.readFileSync(STATE, "utf8")).B;
  const map: Record<string, string> = st.map;
  const inv = Object.fromEntries(Object.entries(map).map(([a, b]) => [b as string, a]));
  const planId = st.planId as string;
  const pre = await getTestState("lz-ppm", { what: "plan", planId });
  const stored: Record<string, any> = {};
  for (const i of pre.issues || []) if (inv[i.key]) stored[inv[i.key]] = { s: i.startDate ?? null, d: i.dueDate ?? null, dur: i.duration == null ? null : Number(i.duration) };
  console.log("B STORED (already settled) =", JSON.stringify(stored, null, 1));

  const ctx = await launchHarnessContext();
  const page = await ctx.newPage();
  let ui: any = {}; let trig: any = null;
  try {
    await page.setViewportSize({ width: 1700, height: 1100 });
    await assertLoggedIn(page);
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    await page.locator('iframe[data-testid="hosted-resources-iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
    const s = await enterForgeSurface(page, { surface: "custom" });
    const frame: any = (s as any).frame;
    await page.waitForTimeout(2500);
    await frame.getByText(`[harness-test] ${st.tag}`, { exact: false }).first().click({ timeout: 40_000 });
    await page.waitForTimeout(7000);
    await frame.getByRole("button", { name: /^Table/i }).first().click({ timeout: 25_000 });
    await page.waitForTimeout(6000);
    const readRows = async () => frame.locator('[data-testid="table-row"]').evaluateAll((els: any[]) => els.map((e) => ({
      key: e.getAttribute("data-row-key"), s: e.getAttribute("data-row-start"), d: e.getAttribute("data-row-due"), dur: e.getAttribute("data-row-duration") })));
    const before = await readRows();
    const uiBefore = Object.fromEntries(before.filter((r: any) => inv[r.key]).map((r: any) => [inv[r.key], { s: r.s, d: r.d, dur: r.dur === "" ? null : Number(r.dur) }]));
    console.log("B UI ON LOAD =", JSON.stringify(uiBefore, null, 1));
    const loadDiffs = Object.keys(map).filter((k) => uiBefore[k]?.s !== stored[k]?.s || uiBefore[k]?.d !== stored[k]?.d);
    console.log("B LOAD DIFFS (UI vs stored-settled) =", JSON.stringify(loadDiffs.map((k) => ({ k, ui: uiBefore[k], kvs: stored[k] })), null, 1));
    console.log("B STAGED ON LOAD =", ((await frame.locator("body").innerText()).match(/Apply\s+(\d+)\s+change/i) || [])[1] || "0");
    await page.screenshot({ path: `${OUT}/BS-10-load.png` });

    const rf: any = await (await frame.locator(":root").elementHandle())!.ownerFrame();
    console.log("cell click =", await rf.evaluate((k: string) => {
      const row = document.querySelector(`[data-testid="table-row"][data-row-key="${k}"]`) as any;
      const cell = row && Array.from(row.children).find((c: any) => /^(\d+d|Set)$/.test((c.innerText || "").trim()));
      if (!cell) return "no-cell"; (cell as any).click(); return "ok";
    }, map.E0C0));
    await page.waitForTimeout(800);
    const input = frame.locator('input[inputmode="numeric"]').first();
    await input.fill("8"); await input.press("Enter");
    await page.waitForTimeout(4000);
    const after = await readRows();
    ui = Object.fromEntries(after.filter((r: any) => inv[r.key]).map((r: any) => [inv[r.key], { s: r.s, d: r.d, dur: r.dur === "" ? null : Number(r.dur) }]));
    console.log("B UI AFTER EDIT =", JSON.stringify(ui, null, 1));
    console.log("B STAGED =", ((await frame.locator("body").innerText()).match(/Apply\s+(\d+)\s+change/i) || [])[1] || "0");
    trig = ui.E0C0;
    await page.screenshot({ path: `${OUT}/BS-11-after.png` });
  } finally { await ctx.close().catch(() => {}); }

  console.log("clearDrafts =", JSON.stringify(await getTestState("lz-ppm", { what: "clearDrafts", planId })));
  for (const [field, v] of [["startDate", trig.s], ["dueDate", trig.d], ["duration", trig.dur]] as any[]) {
    await getTestState("lz-ppm", { what: "applyEdit", planId, key: map.E0C0, field, value: String(v) });
  }
  const settled = await getTestState("lz-ppm", { what: "settle", planId });
  const be: Record<string, any> = {};
  for (const i of settled.issues || []) if (inv[i.key]) be[inv[i.key]] = { s: i.startDate ?? null, d: i.dueDate ?? null, dur: i.duration == null ? null : Number(i.duration) };
  console.log("B BACKEND AFTER SAME EDIT =", JSON.stringify(be, null, 1));
  const diffs = Object.keys(map).filter((k) => ui[k]?.s !== be[k]?.s || ui[k]?.d !== be[k]?.d);
  console.log("B DIFFS (settled plan) =", JSON.stringify(diffs.map((k) => ({ k, ui: ui[k], be: be[k] })), null, 1));
  expect(diffs).toEqual([]);
});
