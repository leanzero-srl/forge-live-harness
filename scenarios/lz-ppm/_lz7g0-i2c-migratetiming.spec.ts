// LZ7G0 item 2c — WHEN does the legacy head migrate, and does a schema-2 head
// really own page bodies (the thing clearDrafts is supposed to take with it)?
// No interaction until the poll ends: the plan is opened and left alone.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7g0";
const PLAN = "LZPT Scenarios", PLAN_ID = "plan-msq9dg8l-gz6mz1", KEY = "LZPT-212";
const SENT = "This draft was saved by an older version of the app";
test.describe.configure({ retries: 0, timeout: 1_500_000 });
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const badges = async (f: any) => ((await bodyText(f)).match(/Save\s*\(\d+\)|Saved|Apply\s+\d+\s+change\w*/gi) || []).join(" | ");
const schemas = async () => { const d: any = await getTestState("lz-ppm", { what: "draftSchemas", planId: PLAN_ID }); return JSON.stringify(d.bySchema) + " legacy=" + d.legacyCount; };
const keys = async () => { const d: any = await getTestState("lz-ppm", { what: "clearDrafts", planId: PLAN_ID, dry: "1" }); return `heads=${d.heads} tomb=${d.tombstones} pages=${d.pages} orphan=${d.orphanPages} states=${d.states} other=${d.otherKeys}`; };

test("G2C: migration timing, page ownership, tiny edit, discard", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  console.log("T0_SCHEMAS", await schemas(), "|", await keys());
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  console.log("SHELL_REV", ((await bodyText(frame)).match(/rev\s*v?([\d.]+)/) || [])[1]);
  console.log("AT_PLAN_LIST_SCHEMAS", await schemas());
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  const t0 = Date.now();
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(3000);
    console.log(`POLL +${Math.round((Date.now() - t0) / 1000)}s`, await schemas(), "|", await keys());
  }
  console.log("NOTICE_COUNT", await frame.locator('[data-testid="plan-legacy-draft-notice"]').count(),
    "TEXT_OCCURRENCES", (await bodyText(frame)).split(SENT).length - 1);
  console.log("BADGES", await badges(frame));
  await page.screenshot({ path: `${OUT}/g2c-1-open.png` });

  // ONE TINY EDIT through the table cell's DatePicker (Wed 09-23 -> Thu 09-24)
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(4500);
  const row = frame.locator(`[data-row-key="${KEY}"]`).first();
  await row.scrollIntoViewIfNeeded().catch(() => {});
  await row.locator("text=Sep 23").first().dispatchEvent("click").catch((e: any) => console.log("CELL_ERR", String(e).slice(0, 80)));
  await page.waitForTimeout(2000);
  console.log("DATEPICKER_COUNT", await frame.locator(".lz-datepicker").count());
  const trigger = frame.locator('button[aria-haspopup="dialog"]');
  if (!(await frame.locator(".lz-datepicker").count()) && (await trigger.count())) {
    await trigger.last().dispatchEvent("click"); await page.waitForTimeout(1500);
    console.log("DATEPICKER_COUNT_AFTER_TRIGGER", await frame.locator(".lz-datepicker").count());
  }
  await page.screenshot({ path: `${OUT}/g2c-2-picker.png` });
  const day = frame.locator('button[aria-label="2026-09-24"]');
  console.log("DAY_BUTTON_COUNT", await day.count());
  await day.first().dispatchEvent("click").catch((e: any) => console.log("DAY_ERR", String(e).slice(0, 80)));
  await page.waitForTimeout(3000);
  console.log("ROW_212_AFTER_EDIT", await frame.locator(`[data-row-key="${KEY}"]`).first().evaluate((e: any) => ({ start: e.getAttribute("data-row-start"), due: e.getAttribute("data-row-due") })).catch(() => "ABSENT"));
  console.log("BADGES_AFTER_EDIT", await badges(frame));
  await page.waitForTimeout(8000);
  console.log("AFTER_EDIT_SCHEMAS", await schemas(), "|", await keys());
  const full: any = await getTestState("lz-ppm", { what: "draftSchemas", planId: PLAN_ID });
  console.log("AFTER_EDIT_FULL", JSON.stringify(full));
  await page.screenshot({ path: `${OUT}/g2c-3-afteredit.png` });

  // DISCARD ALL
  const applyBtn = frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ });
  if (await applyBtn.count()) {
    await applyBtn.first().dispatchEvent("click"); await page.waitForTimeout(3500);
    console.log("APPLY_ROWS", JSON.stringify(await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })))));
    console.log("APPLY_SECTION_HEADERS", JSON.stringify(await frame.locator('[data-testid="apply-section-header"]').allTextContents().catch(() => [])));
    await page.screenshot({ path: `${OUT}/g2c-4-review.png` });
    await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(2500);
    for (const label of ["Discard All", "Discard", "Confirm", "Yes"]) {
      const b = frame.locator("button").filter({ hasText: new RegExp(`^${label}$`) });
      if (await b.count()) { await b.last().dispatchEvent("click").catch(() => {}); break; }
    }
    await page.waitForTimeout(7000);
  }
  console.log("BADGES_AFTER_DISCARD", await badges(frame));
  console.log("FINAL_SCHEMAS", await schemas(), "|", await keys());
  await page.screenshot({ path: `${OUT}/g2c-5-final.png` });
});
