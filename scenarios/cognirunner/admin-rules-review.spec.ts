// LIVE: the admin Rules table after the owner's 11-item review (cognirunner.docx).
//
// This runs against the DEPLOYED app on wolfaenpak, where the registry holds ~500
// real rules — the condition that made every one of these defects visible and that
// the mocked harness cannot reproduce. It asserts the fixes on real data:
//   #1  a delete dialog opens INSIDE the viewport, not thousands of px above it
//   #2  the table head freezes while you scroll
//   #3  the selection count sits at the top of the table and does not move the rows
//   #5  scrolling the list no longer drags the page around
//   #6  paging is fixed at 10 / 20 per page
//   #7  newest first
//   #11 the Owner column names real people
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { BASE_URL } from "../../config/env";
import { enterForgeSurface } from "../../forge/frame";
import { assertLoggedIn } from "../../forge/browser";

const T = getTarget("cognirunner-global");
test.describe.configure({ retries: 2 });

test("CogniRunner admin Rules — review fixes on the live 500-rule registry", async ({ page, recorder }) => {
  test.skip(!T.envId, "COGNI_ENV_ID unresolved — run `npm run discover` or set it in .env.");
  const url = T.deepLink(T.envId)!;
  recorder.setTarget({
    product: T.product, app: T.app, appId: T.appId, module: T.module,
    moduleType: T.moduleType, surface: T.surface, url: BASE_URL + url, repo: T.repo,
  });

  await assertLoggedIn(page);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const surface = await enterForgeSurface(page, { surface: T.surface, readySelector: T.readySelector });
  if (surface.kind !== "custom") throw new Error("CogniRunner admin is a Custom-UI surface");
  const frame = surface.frame;
  const body = frame.locator("body");

  await recorder.step("rules table renders, paged", async () => {
    await expect(frame.locator("table.rules-table tbody tr").first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1200); // entry animations settle
    const rows = await frame.locator("table.rules-table tbody tr:not(.rule-explain-row):not(.rule-accordion-row)").count();
    expect(rows, "the default page shows 10 rows, not the whole registry").toBe(10);
    await expect(frame.locator(".rules-pagination-info")).toContainText(/1–10 of \d+/);
  }, { expectation: { assertion: "the 500-rule registry paginates to 10 rows", narrative: "The rules table no longer renders as one 76,000px page." } });

  await recorder.step("page size is fixed to 10 / 20", async () => {
    const sizes = (await frame.locator(".rules-pagesize-btn").allInnerTexts()).map((t) => t.trim());
    expect(sizes).toEqual(["10", "20"]);
    await frame.locator(".rules-pagesize-btn", { hasText: "20" }).click();
    await page.waitForTimeout(500);
    const rows = await frame.locator("table.rules-table tbody tr:not(.rule-explain-row):not(.rule-accordion-row)").count();
    expect(rows).toBe(20);
    await frame.locator(".rules-pagesize-btn", { hasText: "10" }).click();
    await page.waitForTimeout(400);
  }, { expectation: { assertion: "rows per page is exactly 10 or 20", narrative: "Paging is limited to the two sizes the owner asked for." } });

  await recorder.step("rules are ordered newest → oldest", async () => {
    // The Updated column is locale-formatted, so parse it with Date and only assert
    // monotonicity — that is the property under test.
    const stamps = await frame.locator("table.rules-table tbody .timestamp").allInnerTexts();
    const times = stamps.map((t) => Date.parse(t.replace(/ | /g, " "))).filter((n) => !Number.isNaN(n));
    expect(times.length, "read the Updated column").toBeGreaterThanOrEqual(5);
    for (let i = 1; i < times.length; i++) {
      expect(times[i - 1], `row ${i} is not older than row ${i - 1}`).toBeGreaterThanOrEqual(times[i]);
    }
  }, { expectation: { assertion: "page 1 runs newest to oldest", narrative: "A rule you just created or edited is on page 1." } });

  await recorder.step("the table head freezes while scrolling", async () => {
    const pos = await frame.locator("table.rules-table thead th").first().evaluate((el) => getComputedStyle(el).position);
    expect(pos).toBe("sticky");
    await body.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(400);
    const headTop = await frame.locator("table.rules-table thead th").first().evaluate((el) => el.getBoundingClientRect().top);
    expect(headTop, "the header stays on screen after scrolling").toBeGreaterThanOrEqual(-1);
    expect(headTop).toBeLessThan(400);
    await body.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
  }, { expectation: { assertion: "the column header stays visible while the list scrolls", narrative: "Doc item 2: the table top is frozen." } });

  await recorder.step("selecting a rule shows the count at the top of the table without moving it", async () => {
    const firstRow = frame.locator("table.rules-table tbody tr").first();
    const absTop = () => firstRow.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    const before = await absTop();
    await frame.locator("table.rules-table tbody input[type=checkbox]").first().check();
    await page.waitForTimeout(500);
    await expect(frame.locator(".rules-bulkbar")).toContainText(/1 selected/);
    const docked = await frame.locator(".rules-bulkbar").evaluate((el) => ({
      nextIsTable: el.nextElementSibling?.tagName === "TABLE",
      sticky: getComputedStyle(el).position === "sticky",
    }));
    expect(docked.nextIsTable, "the count sits directly above the table").toBe(true);
    expect(docked.sticky).toBe(true);
    const after = await absTop();
    expect(Math.abs(after - before), "selecting must not shift the rows").toBeLessThan(2);
    await frame.locator(".rules-bulkbar button", { hasText: "Clear" }).click();
    await page.waitForTimeout(300);
  }, { expectation: { assertion: "the selection count is docked to the table and shifts nothing", narrative: "Doc items 3 and 5." } });

  await recorder.step("the delete dialog opens in the viewport", async () => {
    await body.evaluate(() => window.scrollTo(0, 1400));
    await page.waitForTimeout(500);
    const delBtns = frame.locator("table.rules-table .row-actions button", { hasText: /^Delete$/ });
    const vh = await body.evaluate(() => window.innerHeight);
    let opened = false;
    for (let i = 0; i < await delBtns.count(); i++) {
      const bx = await delBtns.nth(i).boundingBox();
      if (bx && bx.y > 160 && bx.y < vh - 60) { await delBtns.nth(i).click(); opened = true; break; }
    }
    expect(opened, "found a Delete button clear of the sticky header").toBe(true);
    await expect(frame.locator(".pf-modal.del-dialog")).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(600);
    const geom = await frame.locator(".pf-modal.del-dialog").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, vh: window.innerHeight, scrollY: window.scrollY };
    });
    // The bug: this used to be ~-3500 with the page scrolled down.
    expect(geom.top, `dialog top=${geom.top} at scrollY=${geom.scrollY} — must be on screen`).toBeGreaterThanOrEqual(0);
    expect(geom.top).toBeLessThan(geom.vh);
    const portalled = await frame.locator(".pf-modal-overlay").evaluate((el) => el.parentElement === document.body);
    expect(portalled, "the overlay is portalled to <body>").toBe(true);
    // Close WITHOUT deleting anything — this is a read-only check on a live registry.
    await frame.locator(".del-dialog button", { hasText: /^Cancel$/ }).click();
    await page.waitForTimeout(400);
    await expect(frame.locator(".pf-modal.del-dialog")).toHaveCount(0);
  }, { expectation: { assertion: "the delete dialog opens where the user is looking", narrative: "Doc item 1: it used to render ~3,500px above the viewport." } });

  await recorder.step("Add Rule opens a modal and does not displace the table", async () => {
    await body.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    const firstRow = frame.locator("table.rules-table tbody tr").first();
    const absTop = () => firstRow.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    const before = await absTop();
    await frame.locator("button", { hasText: /^\+ Add Rule$/ }).first().click();
    await expect(frame.locator(".wiz-dialog")).toBeVisible({ timeout: 15_000 });
    await expect(frame.locator(".wiz-dialog")).toHaveAttribute("aria-modal", "true");
    await expect(frame.locator(".wiz-dialog")).toContainText(/1\.\s*Project/);
    const after = await absTop();
    expect(Math.abs(after - before), "opening the wizard must not move the table").toBeLessThan(2);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    await expect(frame.locator(".wiz-dialog")).toHaveCount(0);
  }, { expectation: { assertion: "the wizard is a modal over an unmoved table", narrative: "Doc item 9: it is now a Create-issue-style window." } });

  await recorder.step("the Owner column names real people", async () => {
    const owners = (await frame.locator("table.rules-table tbody tr td:nth-last-child(2)").allInnerTexts()).join(" | ");
    test.info().annotations.push({ type: "owners", description: owners.slice(0, 500) });
    expect(owners, "no raw accountId is ever rendered").not.toMatch(/557058:/);
  }, { expectation: { assertion: "owners render as names, never as account ids", narrative: "Doc item 11." } });

  await recorder.step("the import dialog's file picker is ours, in English", async () => {
    await frame.locator("button", { hasText: /Export \/ Import/ }).first().click();
    await expect(frame.locator(".port-dialog")).toBeVisible({ timeout: 15_000 });
    await frame.locator("button.port-tab", { hasText: "Import" }).click();
    await page.waitForTimeout(400);
    await expect(frame.locator(".port-dialog button", { hasText: "Choose file…" })).toHaveCount(1);
    await expect(frame.locator(".port-file-name")).toContainText("No file chosen");
    const hidden = await frame.locator(".port-dialog input[type=file]").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.width <= 1 && r.height <= 1;
    });
    expect(hidden, "the native input is visually hidden").toBe(true);
    await frame.locator(".port-head button").first().click().catch(() => {});
  }, { expectation: { assertion: "no browser-native, browser-localized file chrome", narrative: "Doc item 10: the Romanian 'Răsfoiește…' is gone." } });
});
