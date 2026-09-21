// LZ7F0 item 1, ISOLATION: does a stage + Discard All (NO Save) also persist the
// browser's MEASURED duration over the declared one Jira holds?
// Bed LZ7F0b, fresh: WFH-3745 dur 5 in a 2-day span, WFH-3746 dur 10 in a 1-day
// span, both buffer Yes. Jira holds 5 and 10.
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
  return (p.issues || []).map((i: any) => `${i.key} ${i.startDate}|${i.dueDate}|${i.duration}|${i.buffer} orig ${i._original?.duration}|${i._original?.buffer}`);
};
test("F1b: measured duration vs declared, with no Save", async ({ page }) => {
  console.log("PRE\n" + (await rowsNow()).join("\n"));
  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(9000);
  console.log("STAGED_ON_OPEN", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await page.waitForTimeout(8000);
  console.log("AFTER_IDLE_OPEN\n" + (await rowsNow()).join("\n"));
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  console.log("TABLE_DUR", JSON.stringify(await frame.locator('[data-testid="table-row"]').evaluateAll((els: any[]) =>
    els.map((e) => `${e.getAttribute("data-row-key")}=${e.getAttribute("data-row-duration")}`))));
  await page.screenshot({ path: `${OUT}/f1b-00-table.png` });
  for (const k of [bed.A, bed.B]) { await frame.locator(`[title="Select ${k}"]`).first().dispatchEvent("click"); await page.waitForTimeout(500); }
  await frame.locator("button").filter({ hasText: /^No$/ }).last().dispatchEvent("click");
  await page.waitForTimeout(5000);
  console.log("STAGED_AFTER_BULK", ((await bodyText(frame)).match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/gi) || []).join(" | "));
  await page.waitForTimeout(6000);   // let the draft autosave land
  console.log("AFTER_BULK_NO_SAVE\n" + (await rowsNow()).join("\n"));
  await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click");
  await page.waitForTimeout(3000);
  await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click").catch((e: any) => console.log("DISCARD_ERR", String(e).slice(0, 120)));
  await page.waitForTimeout(14000);
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  console.log("AFTER_DISCARD\n" + (await rowsNow()).join("\n"));
  await page.screenshot({ path: `${OUT}/f1b-01-final.png` });
});
