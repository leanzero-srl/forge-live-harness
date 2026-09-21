// LZ7H0 item 1d — the TYPED duration on a CLEAN bed (no earlier pin).
// A holds Jira's declared 5 over a 2-day span. Type 4 in the Table:
//   review must read `Dur: 5 → 4d` (JIRA'S number as the baseline, not the 2d span)
//   Save must store 4
//   Discard All must put JIRA'S 5 back (not the measured 2), savedEdits ABSENT.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";
import * as fs from "fs";
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7h0";
const bed = JSON.parse(fs.readFileSync("/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz7h0/bed.json", "utf8"));
const { A, B, D, planId: PLAN_ID, planName: PLAN } = bed;
test.describe.configure({ retries: 0, timeout: 1_800_000 });
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const snap = async () => {
  const p: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  const r: any = {};
  for (const i of p.issues || []) r[i.key] = `${i.startDate}|${i.dueDate} dur=${JSON.stringify(i.duration)} ORIGdur=${JSON.stringify(i._original?.duration)} cleared=${JSON.stringify(i.durationExplicitlyCleared)}`;
  return { r, savedEditsKey: p.meta && Object.prototype.hasOwnProperty.call(p.meta, "savedEdits") };
};

test("H1d: a typed 4 is measured against Jira's 5 and Discard puts the 5 back", async ({ page }) => {
  console.log("PRE", JSON.stringify(await snap(), null, 1));
  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  console.log("SHELL_REV", ((await bodyText(frame)).match(/rev\s*v?([\d.]+)/) || [])[1]);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(11000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(7000);
  console.log("STAGED_ON_OPEN", ((await bodyText(frame)).match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/gi) || []).join(" | "));
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  const readTable = async (tag: string) => {
    const rows = await frame.locator('[data-testid="table-row"]').evaluateAll((els: any[]) => els.map((e) => ({ k: e.getAttribute("data-row-key"), s: e.getAttribute("data-row-start"), d: e.getAttribute("data-row-due"), dur: e.getAttribute("data-row-duration") })));
    console.log(tag, "TABLE", JSON.stringify(rows));
    return rows;
  };
  await readTable("AT_REST");
  const arow = frame.locator(`[data-testid="table-row"][data-row-key="${A}"]`).first();
  await arow.scrollIntoViewIfNeeded().catch(() => {});
  const durCell = arow.locator("div").filter({ hasText: /^\d+d$/ }).first();
  console.log("DUR_CELL_TEXT", await durCell.textContent().catch(() => null));
  await durCell.dispatchEvent("click");
  await page.waitForTimeout(1200);
  const input = arow.locator("input").first();
  await input.fill("4");
  await input.press("Enter");
  await page.waitForTimeout(4000);
  await readTable("AFTER_TYPED_4");
  await page.screenshot({ path: `${OUT}/h1d-00-typed.png` });
  await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click");
  await page.waitForTimeout(3500);
  console.log("REVIEW_ROWS", JSON.stringify(await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") }))), null, 1));
  await page.screenshot({ path: `${OUT}/h1d-01-review.png` });
  await frame.locator("button").filter({ hasText: /^Cancel$/ }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(2000);
  const btn = frame.locator('[data-testid="plan-save-btn"]').first();
  await btn.click({ timeout: 30000 }).catch((e: any) => console.log("SAVE_ERR", String(e).slice(0, 80)));
  for (let i = 0; i < 240; i++) { if ((await btn.getAttribute("data-save-state").catch(() => null)) === "saved") break; await page.waitForTimeout(250); }
  await page.waitForTimeout(8000);
  console.log("POSTSAVE", JSON.stringify(await snap(), null, 1), "(expect WFH-3755 dur=4)");
  await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click");
  await page.waitForTimeout(3000);
  await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click");
  await page.waitForTimeout(6000);
  console.log("POSTDISCARD_6s", JSON.stringify(await snap(), null, 1), "(expect WFH-3755 dur=5, savedEdits absent)");
  await page.waitForTimeout(9000);
  console.log("POSTDISCARD_15s", JSON.stringify(await snap(), null, 1));
  await readTable("FINAL");
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await page.screenshot({ path: `${OUT}/h1d-02-final.png` });
});
