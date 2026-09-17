// TESTER scratch: the SAME shape in the UI. Creates a SECOND, UNSETTLED fixture over the
// same issues, opens it, reads the rendered dates key-for-key and the staged-change count
// BEFORE any user edit. Deletes the extra fixture at the end.
import { test, expect } from "@playwright/test";
import { getTarget } from "../../config/targets";
import { assertLoggedIn, launchHarnessContext } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";
import { createFixtureRetry } from "../_support/lzfixture";
import fs from "node:fs";
const T = getTarget("lz-ppm-dashboard");
const OUT = process.env.SHOT_DIR || "/tmp";
const STATE = process.env.CS_STATE || "/tmp/chained-summary-state.json";
test.describe.configure({ retries: 0, timeout: 900_000 });
const text = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";

test("UI: the same plan, unsettled", async () => {
  const st = JSON.parse(fs.readFileSync(STATE, "utf8"));
  const keys: Record<string, string> = st.keys;
  const all = Object.values(keys);
  const cf = await createFixtureRetry(`TESTER chained-summary UI ${Date.now().toString(36)}`, `key in (${all.join(",")})`, all);
  const uiPlan = cf.planId as string;
  fs.writeFileSync(STATE, JSON.stringify({ ...st, uiPlan }));
  console.log("UI PLAN =", uiPlan, "(unsettled)");
  const ctx = await launchHarnessContext();
  const page = await ctx.newPage();
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
    await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${OUT}/30-gantt.png` });
    let t = await text(frame);
    console.log("HEADER BAND =", t.slice(0, 700).replace(/\s+/g, " "));
    const staged = (t.match(/Apply\s+(\d+)\s+change/i) || [])[1] || "0";
    const save = (t.match(/Save\s*\((\d+)\)/i) || [])[1] || null;
    console.log("STAGED (Apply N changes) =", staged, "| Save(N) =", save);
    // Table view carries the rendered trio on each row.
    await frame.getByRole("button", { name: /^Table/i }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(5000);
    const rows = await frame.locator('[data-testid="table-row"]').evaluateAll((els: any[]) => els.map((e) => ({
      key: e.getAttribute("data-row-key"), s: e.getAttribute("data-row-start"), d: e.getAttribute("data-row-due"), dur: e.getAttribute("data-row-duration") })));
    console.log("UI ROWS =", JSON.stringify(rows, null, 1));
    await page.screenshot({ path: `${OUT}/31-table.png` });
    t = await text(frame);
    const staged2 = (t.match(/Apply\s+(\d+)\s+change/i) || [])[1] || "0";
    console.log("STAGED (table view) =", staged2);
    // Which rows are flagged as changed?
    const changed = await frame.locator('[data-testid="table-row"] [data-changed="true"], [data-testid="table-row"].row-changed').count().catch(() => -1);
    console.log("changed-cell markers =", changed);
    const ui = Object.fromEntries(rows.filter((r: any) => all.includes(r.key)).map((r: any) => [r.key, { s: r.s, d: r.d, dur: Number(r.dur) }]));
    console.log("UI MAP =", JSON.stringify(ui, null, 1));
    console.log("BACKEND MAP =", JSON.stringify(st.backend, null, 1));
    for (const k of all) {
      expect(ui[k]?.s, `${k} start UI vs backend`).toBe(st.backend[k].s);
      expect(ui[k]?.d, `${k} due UI vs backend`).toBe(st.backend[k].d);
    }
    console.log("KEY-FOR-KEY: UI preview == backend settle for all", all.length, "keys");
  } finally {
    await page.screenshot({ path: `${OUT}/39-final.png` }).catch(() => {});
    await ctx.close().catch(() => {});
  }
});
