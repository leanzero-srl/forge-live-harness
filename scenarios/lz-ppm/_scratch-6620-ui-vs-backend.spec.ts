// TESTER (6.62.0, item 3 second half): UI preview vs backend settle, key-for-key,
// after ONE small edit — on both engine shapes. Creates a SECOND, UNSETTLED fixture
// over the same seeded issues, drives a duration edit in the Table, reads every row,
// then clears the draft, applies the SAME trio through the hook, settles, compares.
import { test, expect } from "@playwright/test";
import { getTarget } from "../../config/targets";
import { assertLoggedIn, launchHarnessContext } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";
import { createFixtureRetry } from "../_support/lzfixture";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = process.env.SHOT_DIR || "/tmp";
const STATE = process.env.STATE_FILE || "/tmp/lz-6620-seed.json";
test.describe.configure({ retries: 0, timeout: 1_200_000 });

async function drive(shape: "A" | "B", triggerId: string, newDuration: number) {
  const st = JSON.parse(fs.readFileSync(STATE, "utf8"))[shape];
  const map: Record<string, string> = st.map;
  const inv = Object.fromEntries(Object.entries(map).map(([a, b]) => [b as string, a]));
  const all = Object.values(map);
  const name = `[harness-test] UI ${shape} ${Date.now().toString(36)}`;
  const cf = await createFixtureRetry(name, `key in (${all.join(",")})`, all);
  const uiPlan = cf.planId as string;
  console.log(`${shape} UI PLAN = ${uiPlan} (unsettled)`);
  const prev = JSON.parse(fs.readFileSync(STATE, "utf8"));
  fs.writeFileSync(STATE, JSON.stringify({ ...prev, [`${shape}ui`]: uiPlan }, null, 1));

  const ctx = await launchHarnessContext();
  const page = await ctx.newPage();
  let ui: any = {};
  let trigTrio: any = null;
  try {
    await page.setViewportSize({ width: 1700, height: 1100 });
    await assertLoggedIn(page);
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    await page.locator('iframe[data-testid="hosted-resources-iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
    const s = await enterForgeSurface(page, { surface: "custom" });
    const frame: any = (s as any).frame;
    await page.waitForTimeout(2500);
    await frame.getByText(name, { exact: false }).first().click({ timeout: 40_000 });
    await page.waitForTimeout(7000);
    await frame.getByRole("button", { name: /^Table/i }).first().click({ timeout: 25_000 });
    await page.waitForTimeout(6000);
    const readRows = async () => frame.locator('[data-testid="table-row"]').evaluateAll((els: any[]) => els.map((e) => ({
      key: e.getAttribute("data-row-key"), s: e.getAttribute("data-row-start"), d: e.getAttribute("data-row-due"), dur: e.getAttribute("data-row-duration") })));
    const before = await readRows();
    console.log(`${shape} UI ROWS BEFORE EDIT =`, JSON.stringify(before.map((r: any) => ({ ...r, id: inv[r.key] })), null, 1));
    await page.screenshot({ path: `${OUT}/${shape}-10-before.png` });

    // one small edit: the trigger's DURATION
    const trigKey = map[triggerId];
    const rf: any = await (await frame.locator(":root").elementHandle())!.ownerFrame();
    const clicked = await rf.evaluate((k: string) => {
      const row = document.querySelector(`[data-testid="table-row"][data-row-key="${k}"]`) as any;
      if (!row) return "no-row";
      const cell = Array.from(row.children).find((c: any) => /^(\d+d|Set)$/.test((c.innerText || "").trim()));
      if (!cell) return "no-cell:" + Array.from(row.children).map((c: any) => JSON.stringify((c.innerText || "").trim())).join("|");
      (cell as any).click();
      return "ok";
    }, trigKey);
    console.log(`${shape} duration cell click =`, clicked);
    await page.waitForTimeout(800);
    const input = frame.locator('input[inputmode="numeric"]').first();
    await input.fill(String(newDuration));
    await input.press("Enter");
    await page.waitForTimeout(4000);
    const after = await readRows();
    console.log(`${shape} UI ROWS AFTER EDIT =`, JSON.stringify(after.map((r: any) => ({ ...r, id: inv[r.key] })), null, 1));
    const body = await frame.locator("body").innerText();
    console.log(`${shape} STAGED =`, (body.match(/Apply\s+(\d+)\s+change/i) || [])[1] || "0");
    await page.screenshot({ path: `${OUT}/${shape}-11-after.png` });
    ui = Object.fromEntries(after.filter((r: any) => inv[r.key]).map((r: any) => [inv[r.key], { s: r.s, d: r.d, dur: r.dur === "" ? null : Number(r.dur) }]));
    trigTrio = ui[triggerId];
  } finally {
    await ctx.close().catch(() => {});
  }

  // clear the draft the UI autosaved, then apply the SAME trio through the hook
  console.log(`${shape} clearDrafts =`, JSON.stringify(await getTestState("lz-ppm", { what: "clearDrafts", planId: uiPlan })));
  for (const field of ["startDate", "dueDate", "duration"] as const) {
    await getTestState("lz-ppm", { what: "applyEdit", planId: uiPlan, key: map[triggerId], field, value: String(trigTrio[field === "startDate" ? "s" : field === "dueDate" ? "d" : "dur"]) });
  }
  const settled = await getTestState("lz-ppm", { what: "settle", planId: uiPlan });
  const be: Record<string, any> = {};
  for (const i of settled.issues || []) if (inv[i.key]) be[inv[i.key]] = { s: i.startDate ?? null, d: i.dueDate ?? null, dur: i.duration == null ? null : Number(i.duration) };
  console.log(`${shape} BACKEND AFTER SAME EDIT =`, JSON.stringify(be, null, 1));
  console.log(`${shape} cycleEdges =`, JSON.stringify(settled.meta?.cycleEdges));
  const ids = Object.keys(map).sort();
  const diffs = ids.filter((k) => ui[k]?.s !== be[k]?.s || ui[k]?.d !== be[k]?.d);
  const durDiffs = ids.filter((k) => (ui[k]?.dur ?? null) !== (be[k]?.dur ?? null));
  console.log(`${shape} DATE DIFFS UI vs BACKEND =`, JSON.stringify(diffs.map((k) => ({ k, ui: ui[k], be: be[k] })), null, 1));
  console.log(`${shape} DURATION DIFFS =`, JSON.stringify(durDiffs.map((k) => ({ k, ui: ui[k]?.dur, be: be[k]?.dur })), null, 1));
  await getTestState("lz-ppm", { what: "deleteFixture", planId: uiPlan }).catch(() => {});
  expect(diffs, `${shape}: UI preview must equal backend settle on every key`).toEqual([]);
}

test("A — UI vs backend after one small edit (inherited-edge loop)", async () => { await drive("A", "X", 8); });
test("B — UI vs backend after one small edit (4 chained Epics)", async () => { await drive("B", "E0C0", 8); });
