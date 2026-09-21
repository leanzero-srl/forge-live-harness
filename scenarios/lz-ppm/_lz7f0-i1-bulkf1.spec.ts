// LZ7F0 item 1 — the BREAK-bulk-publish-resettle F1 bed, LIVE, on WFH.
// Bed (plan "LZ7F0 bulk F1 bed", REST-created so the browser account owns it):
//   X 06-01|06-01 1d No  -> B ; A 06-01|06-02 5d Yes -> D
//   B 06-01|06-01 10d Yes-> D ; D 06-03|06-04 2d No  preds [A,B]
// Gesture: multi-select A and B in the Table, bulk Set buffer -> No.
// Independent expectation (computed by hand, Mon-Fri calendar, no holidays):
//   published A 06-01|06-02 dur5 No ; B 06-01|06-01 dur10 No
//   settle(published): A 06-01|06-05 ; B start 06-02 (X pushes) + 10wd -> 06-15
//                      D start = next wd after 06-15 = 06-16, +2wd -> 06-17
// So the Apply review MUST offer D at 06-16/06-17 (pre-cut it offered 06-08/06-09),
// the Gantt MUST draw D at 06-16..06-17, and a backend settle of the saved state
// MUST agree. Then Discard All must leave the plan clean.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7f0";
const bed = JSON.parse(fs.readFileSync("/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz7f0/bed.json", "utf8"));
const PLAN = bed.planName, PLAN_ID = bed.planId;
test.describe.configure({ retries: 0, timeout: 1_800_000 });

const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const rowsNow = async () => {
  const p: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  return (p.issues || []).map((i: any) => `${i.key} ${i.startDate}|${i.dueDate}|${i.duration}|${i.buffer}  orig ${i._original?.startDate}|${i._original?.dueDate}|${i._original?.duration}|${i._original?.buffer}`);
};

test("F1: bulk Buffer->No stages the successor at the schedule the Gantt draws", async ({ page }) => {
  console.log("PRE_ROWS\n" + (await rowsNow()).join("\n"));
  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  const shell = await bodyText(frame);
  console.log("SHELL_HEADER", JSON.stringify((shell.match(/(dev|prod)?\s*7\.\d+\.\d+[^|]{0,40}|rev\s*v?[\d.]+/gi) || []).slice(0, 6)));
  await frame.getByText(PLAN, { exact: true }).first().click().catch((e: any) => console.log("PLAN_CLICK_ERR", String(e).slice(0, 120)));
  await page.waitForTimeout(9000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  console.log("STAGED_ON_OPEN", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));

  const bars = async () => await frame.locator('[data-testid="gantt-bar"]').evaluateAll((els: any[]) =>
    els.map((e) => `${e.getAttribute("data-key")} ${e.getAttribute("data-bar-start")}..${e.getAttribute("data-bar-due")}`));
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  console.log("BARS_BEFORE", JSON.stringify(await bars()));
  await page.screenshot({ path: `${OUT}/f1-00-gantt-before.png` });

  // ---- the gesture, in the Table ----
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  console.log("TABLE_ROWS", JSON.stringify(await frame.locator('[data-testid="table-row"]').evaluateAll((els: any[]) =>
    els.map((e) => ({ k: e.getAttribute("data-row-key"), s: e.getAttribute("data-row-start"), d: e.getAttribute("data-row-due"), dur: e.getAttribute("data-row-duration"), der: e.getAttribute("data-row-derived") })))));
  for (const k of [bed.A, bed.B]) {
    const cb = frame.locator(`[title="Select ${k}"]`).first();
    console.log("CHECKBOX", k, await frame.locator(`[title="Select ${k}"]`).count());
    await cb.dispatchEvent("click");
    await page.waitForTimeout(600);
  }
  const bulk = await bodyText(frame);
  console.log("BULK_BAR", JSON.stringify((bulk.match(/\d+ selected.{0,120}/) || [])[0] ?? null));
  await page.screenshot({ path: `${OUT}/f1-01-selected.png` });
  const noBtn = frame.locator("button").filter({ hasText: /^No$/ }).last();
  console.log("NO_BTN_COUNT", await frame.locator("button").filter({ hasText: /^No$/ }).count());
  await noBtn.dispatchEvent("click");
  await page.waitForTimeout(4000);
  const afterBulk = await bodyText(frame);
  console.log("BULK_TOAST", JSON.stringify((afterBulk.match(/[^.·]*(staged|nothing was staged|buffer)[^.·]*/i) || [])[0] ?? null));
  console.log("STAGED_AFTER_BULK", ((afterBulk.match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/gi) || []).join(" | ")) || "(none)");
  console.log("TABLE_ROWS_AFTER", JSON.stringify(await frame.locator('[data-testid="table-row"]').evaluateAll((els: any[]) =>
    els.map((e) => ({ k: e.getAttribute("data-row-key"), s: e.getAttribute("data-row-start"), d: e.getAttribute("data-row-due"), dur: e.getAttribute("data-row-duration"), der: e.getAttribute("data-row-derived") })))));
  await page.screenshot({ path: `${OUT}/f1-02-after-bulk.png` });

  // ---- what the GANTT draws ----
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  const barsAfter = await bars();
  console.log("BARS_AFTER", JSON.stringify(barsAfter));
  console.log("GANTT_D", barsAfter.find((b: string) => b.startsWith(bed.D)));
  await page.screenshot({ path: `${OUT}/f1-03-gantt-after.png` });

  // ---- what the APPLY REVIEW offers ----
  const applyBtn = frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first();
  console.log("APPLY_BTN", ((await applyBtn.textContent().catch(() => "")) || "").trim());
  await applyBtn.dispatchEvent("click");
  await page.waitForTimeout(3500);
  const reviewRows = await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) =>
    els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })));
  console.log("REVIEW_ROWS", JSON.stringify(reviewRows, null, 1));
  console.log("REVIEW_MODAL_TEXT", (await frame.locator('[data-testid="apply-review-modal"], [role="dialog"]').first().textContent().catch(() => "")).replace(/\s+/g, " ").slice(0, 1800));
  await page.screenshot({ path: `${OUT}/f1-04-review.png` });

  // ---- SAVE (persists the published rows) so a BACKEND settle can be asked the
  //      same question; the plan is deleted at the end of the run either way. ----
  await frame.locator('[data-testid="apply-review-modal"] button, [role="dialog"] button').filter({ hasText: /^(Cancel|Close)$/i }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(1500);
  const saveBtn = frame.locator("button").filter({ hasText: /^Save\s*\(\d+\)/ }).first();
  console.log("SAVE_BTN", ((await saveBtn.textContent().catch(() => "")) || "(none)").trim());
  await saveBtn.dispatchEvent("click").catch((e: any) => console.log("SAVE_ERR", String(e).slice(0, 120)));
  await page.waitForTimeout(9000);
  console.log("SAVE_BTN_AFTER", ((await frame.locator("button").filter({ hasText: /Save|Saved/ }).first().textContent().catch(() => "")) || "").trim());
  console.log("SAVED_ROWS\n" + (await rowsNow()).join("\n"));
  const settle: any = await getTestState("lz-ppm", { what: "settle", planId: PLAN_ID, dry: "1" });
  console.log("BACKEND_SETTLE", JSON.stringify((settle.issues || []).map((i: any) => `${i.key} ${i.startDate}|${i.dueDate}|${i.duration}|${i.buffer}`)));
  console.log("BACKEND_SETTLE_CHANGED", JSON.stringify(settle.changed), "wouldMove", settle.wouldMove);

  // ---- Discard All -> clean ----
  await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(3000);
  await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click").catch((e: any) => console.log("DISCARD_ERR", String(e).slice(0, 120)));
  await page.waitForTimeout(12000);
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  console.log("FINAL_ROWS\n" + (await rowsNow()).join("\n"));
  console.log("FINAL_BARS", JSON.stringify(await bars()));
  await page.screenshot({ path: `${OUT}/f1-05-final.png` });
});
