// TESTER scratch: drive the FRONTEND cascade on the chained-summary shape (the UI does not
// settle a plan on open, so the rule is only exercised by an EDIT). Edit P's duration in
// the Table, read the preview key-for-key + the staged count, then do the SAME edit on the
// backend (applyEdit + settle) and compare. Discards the draft; never applies to Jira.
import { test, expect } from "@playwright/test";
import { getTarget } from "../../config/targets";
import { assertLoggedIn, launchHarnessContext } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";
import fs from "node:fs";
const T = getTarget("lz-ppm-dashboard");
const OUT = process.env.SHOT_DIR || "/tmp";
const STATE = process.env.CS_STATE || "/tmp/chained-summary-state.json";
test.describe.configure({ retries: 0, timeout: 900_000 });
const text = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";

test("edit P duration -> the rule in the UI, then the same on the backend", async () => {
  const st = JSON.parse(fs.readFileSync(STATE, "utf8"));
  const keys: Record<string, string> = st.keys;
  const plan = st.uiPlan;
  const ctx = await launchHarnessContext();
  const page = await ctx.newPage();
  let uiMap: any = null; let staged = "?";
  try {
    await page.setViewportSize({ width: 1700, height: 1100 });
    await assertLoggedIn(page);
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    await page.locator('iframe[data-testid="hosted-resources-iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
    const s = await enterForgeSurface(page, { surface: "custom" });
    const frame: any = (s as any).frame;
    await page.waitForTimeout(2500);
    await frame.getByText("TESTER chained-summary UI", { exact: false }).first().click({ timeout: 30_000 });
    await page.waitForTimeout(6000);
    await frame.getByRole("button", { name: /^Table/i }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(4000);
    const before = await frame.locator('[data-testid="table-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-row-key"), s: e.getAttribute("data-row-start"), d: e.getAttribute("data-row-due"), dur: e.getAttribute("data-row-duration") })));
    console.log("UI BEFORE =", JSON.stringify(before));
    // P's duration cell: the row for P, the cell reading "10d".
    const prow = frame.locator(`[data-testid="table-row"][data-row-key="${keys.P}"]`).first();
    await prow.getByText(/^10d$/).first().click({ timeout: 15_000 });
    await page.waitForTimeout(800);
    const inp = frame.locator('input[inputmode="numeric"]').first();
    console.log("editor visible =", await inp.isVisible().catch(() => false));
    await inp.fill("12");
    await inp.press("Enter");
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${OUT}/32-after-edit.png` });
    const after = await frame.locator('[data-testid="table-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-row-key"), s: e.getAttribute("data-row-start"), d: e.getAttribute("data-row-due"), dur: e.getAttribute("data-row-duration") })));
    console.log("UI AFTER =", JSON.stringify(after, null, 1));
    const t = await text(frame);
    staged = (t.match(/Apply\s+(\d+)\s+change/i) || [])[1] || (t.match(/Save\s*\((\d+)\)/i) || [])[1] || "0";
    console.log("STAGED after the edit =", staged);
    console.log("TOOLBAR =", (t.match(/Apply[^\n]{0,60}|Save \(\d+\)[^\n]{0,40}/g) || []).join(" | "));
    uiMap = Object.fromEntries(after.map((r: any) => [r.key, { s: r.s, d: r.d, dur: Number(r.dur) }]));
  } finally {
    await page.screenshot({ path: `${OUT}/33-final.png` }).catch(() => {});
    await ctx.close().catch(() => {});
  }
  // discard the draft the autosave wrote
  const cd = await getTestState("lz-ppm", { what: "clearDrafts", planId: plan });
  console.log("clearDrafts =", JSON.stringify(cd));
  // the same edit on the backend
  await getTestState("lz-ppm", { what: "applyEdit", planId: plan, key: keys.P, field: "duration", value: "12" });
  const s1 = await getTestState("lz-ppm", { what: "settle", planId: plan });
  const be = Object.fromEntries((s1.issues || []).map((i: any) => [i.key, { s: i.startDate, d: i.dueDate, dur: i.duration }]));
  console.log("BACKEND AFTER SAME EDIT =", JSON.stringify(be, null, 1));
  console.log("UI MAP =", JSON.stringify(uiMap, null, 1));
  const diffs: string[] = [];
  for (const k of Object.values(keys)) {
    if (uiMap[k]?.s !== be[k]?.s || uiMap[k]?.d !== be[k]?.d) diffs.push(`${k}: UI ${uiMap[k]?.s}→${uiMap[k]?.d} vs BE ${be[k]?.s}→${be[k]?.d}`);
  }
  console.log("KEY-FOR-KEY DIFFS =", diffs.length ? diffs.join(" | ") : "(none — byte-identical)");
  expect(diffs).toEqual([]);
});
