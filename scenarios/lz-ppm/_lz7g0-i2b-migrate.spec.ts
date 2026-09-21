// LZ7G0 item 2b — after the head migrated to schema 2: the notice must be GONE on
// the next load, the drafted row must survive, one tiny edit must autosave under
// schema 2, and Discard All must return the bed to clean.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7g0";
const PLAN = "LZPT Scenarios", PLAN_ID = "plan-msq9dg8l-gz6mz1", KEY = "LZPT-212";
const SENT = "This draft was saved by an older version of the app";
test.describe.configure({ retries: 0, timeout: 1_200_000 });
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const badges = async (f: any) => ((await bodyText(f)).match(/Save\s*\(\d+\)|Saved|Apply\s+\d+\s+change\w*/gi) || []).join(" | ");

test("G2B: notice gone on reload, edit autosaves as schema 2, Discard All cleans", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  console.log("SCHEMAS_AT_START", JSON.stringify(await getTestState("lz-ppm", { what: "draftSchemas", planId: PLAN_ID })));
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  console.log("SHELL_REV", ((await bodyText(frame)).match(/rev\s*v?([\d.]+)/) || [])[1]);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(10000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(9000);
  const t = await bodyText(frame);
  console.log("NOTICE_TESTID_COUNT_ON_RELOAD", await frame.locator('[data-testid="plan-legacy-draft-notice"]').count());
  console.log("NOTICE_TEXT_OCCURRENCES_ON_RELOAD", t.split(SENT).length - 1);
  console.log("BADGES_ON_RELOAD", await badges(frame));
  await page.screenshot({ path: `${OUT}/g2b-1-reload.png` });

  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(4500);
  const row = frame.locator(`[data-row-key="${KEY}"]`).first();
  await row.scrollIntoViewIfNeeded().catch(() => {});
  console.log("ROW_212_BEFORE_EDIT", await row.evaluate((e: any) => ({ start: e.getAttribute("data-row-start"), due: e.getAttribute("data-row-due") })).catch(() => "ABSENT"));

  // ONE TINY EDIT: move the drafted due one working day (Wed 09-23 -> Thu 09-24)
  const due = row.locator("text=Sep 23").first();
  console.log("DUE_CELL_COUNT", await due.count());
  await due.dispatchEvent("click").catch((e: any) => console.log("CELL_CLICK_ERR", String(e).slice(0, 90)));
  await page.waitForTimeout(2500);
  const ed = frame.locator('[data-testid="date-editor"]');
  console.log("EDITOR_COUNT", await ed.count());
  if (await ed.count()) {
    console.log("EDITOR_TEXT", (await ed.first().textContent().catch(() => "")).replace(/\s+/g, " ").slice(0, 300));
    const inputs = await ed.locator("input").evaluateAll((els: any[]) => els.map((e) => ({ type: e.type, inputmode: e.getAttribute("inputmode"), v: e.value })));
    console.log("EDITOR_INPUTS", JSON.stringify(inputs));
    const dateInputs = ed.locator('input[type="date"]');
    const n = await dateInputs.count();
    if (n) { await dateInputs.nth(n - 1).fill("2026-09-24"); await page.waitForTimeout(800); }
    await page.screenshot({ path: `${OUT}/g2b-2-editor.png` });
    await ed.locator('[data-testid="dateeditor-apply"]').first().dispatchEvent("click").catch((e: any) => console.log("APPLY_ERR", String(e).slice(0, 90)));
    await page.waitForTimeout(3000);
  }
  console.log("ROW_212_AFTER_EDIT", await frame.locator(`[data-row-key="${KEY}"]`).first().evaluate((e: any) => ({ start: e.getAttribute("data-row-start"), due: e.getAttribute("data-row-due") })).catch(() => "ABSENT"));
  console.log("BADGES_AFTER_EDIT", await badges(frame));
  await page.waitForTimeout(7000);   // > 3 s autosave debounce
  console.log("SCHEMAS_AFTER_EDIT", JSON.stringify(await getTestState("lz-ppm", { what: "draftSchemas", planId: PLAN_ID })));
  await page.screenshot({ path: `${OUT}/g2b-3-afteredit.png` });

  // DISCARD ALL (lives only in the Apply review modal footer)
  const applyBtn = frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ });
  console.log("APPLY_BUTTON_COUNT", await applyBtn.count());
  if (await applyBtn.count()) {
    await applyBtn.first().dispatchEvent("click");
    await page.waitForTimeout(3500);
    const rows = await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) =>
      els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })));
    console.log("APPLY_ROWS_BEFORE_DISCARD", JSON.stringify(rows));
    console.log("APPLY_SECTION_HEADERS", JSON.stringify(await frame.locator('[data-testid="apply-section-header"]').allTextContents().catch(() => [])));
    await page.screenshot({ path: `${OUT}/g2b-4-review.png` });
    await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click").catch((e: any) => console.log("DISCARD_ERR", String(e).slice(0, 90)));
    await page.waitForTimeout(3000);
    const conf = await bodyText(frame);
    console.log("CONFIRM_VISIBLE", /Discard/i.test(conf));
    for (const label of ["Discard All", "Discard", "Confirm", "Yes"]) {
      const b = frame.locator("button").filter({ hasText: new RegExp(`^${label}$`) });
      if (await b.count()) { await b.last().dispatchEvent("click").catch(() => {}); break; }
    }
    await page.waitForTimeout(6000);
  }
  console.log("BADGES_AFTER_DISCARD", await badges(frame));
  console.log("NOTICE_AFTER_DISCARD", await frame.locator('[data-testid="plan-legacy-draft-notice"]').count());
  await page.screenshot({ path: `${OUT}/g2b-5-discarded.png` });
  console.log("SCHEMAS_AFTER_DISCARD", JSON.stringify(await getTestState("lz-ppm", { what: "draftSchemas", planId: PLAN_ID })));
  console.log("CLEARDRAFTS_DRY_AFTER_DISCARD", JSON.stringify(await getTestState("lz-ppm", { what: "clearDrafts", planId: PLAN_ID, dry: "1" })));
});
