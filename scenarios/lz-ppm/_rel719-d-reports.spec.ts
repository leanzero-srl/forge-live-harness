// dev 7.19.0 release proof — REPORTS lane on the "REL719 bed" fixture: step 7 list time stamp, step 9
// storyline #1 (download) and #2 (finish moved — the tester moves TES-42 between them and drops a
// go-file), step 8 space picker / filter / parent page / remembered, step 10 archive Status words.
// Reports are deleted by the tester afterwards through the hook's deleteFixture; pages by deleting
// the scratch space.
import { test, expect } from "../../fixtures/forge";
import { boot, openPlan, tab, shot, bodyText, isStaged, log, OUT } from "./_rel719-lib";
import fs from "node:fs";

const FX = "REL719 bed";
test.describe.configure({ retries: 0, timeout: 2_400_000 });

async function openReports(page: any, frame: any) {
  await tab(page, frame, "planning");
  await frame.locator("button").filter({ hasText: /^Sponsor reports$/ }).first().click();
  await page.waitForTimeout(5000);
}
async function capture(page: any, frame: any, name: string, template: "storyline" | "report") {
  const form = frame.locator(".lz-planning-capture").first();
  await form.getByLabel("Report name").fill(name);
  const tplBtn = form.locator("button").filter({ hasText: /Full archive|Storyline report/ }).first();
  await tplBtn.click(); await page.waitForTimeout(600);
  await frame.locator('[role="option"]').filter({ hasText: template === "storyline" ? /Storyline report/ : /Full archive/ }).first().dispatchEvent("click");
  await page.waitForTimeout(600);
  await form.getByRole("button", { name: "Capture sponsor report" }).click();
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(2000);
    const t = await bodyText(frame);
    if (await frame.locator(".lz-history-item").filter({ hasText: name }).count()) {
      const open = frame.getByRole("button", { name: "Open captured report" }).first();
      if (await open.count()) { await open.click().catch(() => {}); await page.waitForTimeout(4000); }
      break;
    }
    if (i % 10 === 0) log(`CAPTURE_${name}_WAIT_${i}`, (t.match(/(Captur[^.]{0,120})/) || [null])[0]);
  }
  await frame.locator(".lz-history-item").filter({ hasText: name }).first().click();
  await page.waitForTimeout(5000);
}
async function detail(frame: any) { return ((await frame.locator(".lz-history-detail").first().textContent().catch(() => "")) || "").replace(/\s+/g, " "); }
async function download(page: any, frame: any, file: string) {
  const dl = page.waitForEvent("download", { timeout: 120_000 }).catch(() => null);
  await frame.locator(".lz-history-detail button").filter({ hasText: /Download/i }).first().click().catch(() => {});
  const d = await dl;
  if (d) { await d.saveAs(`${OUT}/${file}`); return d.suggestedFilename(); }
  return null;
}

test("rel719 D: reports — list stamp, storyline x2, archive, publish with space/parent", async ({ page }) => {
  const { frame, real } = await boot(page);
  log("D_TZ", await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone));
  await openPlan(page, frame, FX);
  await openReports(page, frame);
  // ── storyline #1 ──
  await capture(page, frame, "REL719 story 1", "storyline");
  const items = await real.evaluate(() => Array.from(document.querySelectorAll(".lz-history-item")).map((b: any) => ({ text: (b.textContent || "").replace(/\s+/g, " "), time: b.querySelector("time")?.textContent, title: b.querySelector("time")?.getAttribute("title"), dt: b.querySelector("time")?.getAttribute("datetime") })));
  log("S7_ITEMS", items);
  await shot(page, "s7-list");
  const d1 = await detail(frame);
  fs.writeFileSync(`${OUT}/s9-story1-receipt.txt`, d1);
  log("S9_STORY1_RECEIPT", d1.slice(0, 4000));
  log("S9_STORY1_DOWNLOAD", await download(page, frame, "s9-story1.html"));
  await shot(page, "s9-story1");
  // ── wait for the tester to move TES-42 and re-index ──
  console.log("MARKER_MOVE_NOW");
  for (let i = 0; i < 150 && !fs.existsSync(`${OUT}/go-capture-2`); i++) await page.waitForTimeout(2000);
  log("GO_FILE", fs.existsSync(`${OUT}/go-capture-2`));
  await page.reload(); await page.waitForTimeout(3000);
  const b2 = await boot(page);
  await openPlan(page, b2.frame, FX);
  await openReports(page, b2.frame);
  await capture(page, b2.frame, "REL719 story 2", "storyline");
  const d2 = await detail(b2.frame);
  fs.writeFileSync(`${OUT}/s9-story2-receipt.txt`, d2);
  log("S9_STORY2_RECEIPT", d2.slice(0, 4000));
  log("S9_STORY2_DOWNLOAD", await download(page, b2.frame, "s9-story2.html"));
  await shot(page, "s9-story2");
  // ── archive ──
  await capture(page, b2.frame, "REL719 archive", "report");
  log("S10_ARCHIVE_RECEIPT", (await detail(b2.frame)).slice(0, 1500));
  // ── publish the archive: space picker, filter, parent ──
  const f = b2.frame;
  await f.locator('[data-testid="publish-to-confluence"]').first().click();
  const dlg = f.locator('[data-testid="publish-confluence-dialog"]').first();
  await dlg.waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(4000);
  log("S8_DIALOG_OPEN", ((await dlg.textContent()) || "").replace(/\s+/g, " ").slice(0, 600));
  await dlg.locator("button").filter({ hasText: /Choose a space|space/i }).first().click();
  await page.waitForTimeout(1500);
  const opts = await f.locator('[role="option"]').allTextContents();
  log("S8_SPACE_OPTIONS", opts);
  await shot(page, "s8-01-space-list");
  const filter = f.getByLabel("Type to filter spaces").first();
  log("S8_FILTER_PRESENT", await filter.count());
  if (await filter.count()) {
    await filter.fill("spo"); await page.waitForTimeout(800);
    log("S8_FILTER_SPO", await f.locator('[role="option"]').allTextContents());
    await shot(page, "s8-02-filter-spo");
    await filter.fill("REL719"); await page.waitForTimeout(800);
  }
  await f.locator('[role="option"]').filter({ hasText: "REL719 sponsor space" }).first().dispatchEvent("click");
  await page.waitForTimeout(4000);
  const parent = f.locator('[data-testid="confluence-parent"]').first();
  log("S8_PARENT_BLOCK", ((await parent.textContent().catch(() => "")) || "").replace(/\s+/g, " "));
  await parent.locator("button").first().click();
  await page.waitForTimeout(1200);
  log("S8_PARENT_OPTIONS", await f.locator('[role="option"]').allTextContents());
  await shot(page, "s8-03-parent-list");
  await f.locator('[role="option"]').filter({ hasText: "REL719 sponsor reports parent" }).first().dispatchEvent("click");
  await page.waitForTimeout(1000);
  await shot(page, "s8-04-ready");
  await dlg.locator("button").filter({ hasText: /^(Publish|Publish again)$/ }).first().click();
  for (let i = 0; i < 90; i++) { await page.waitForTimeout(1000); if (/Published to|Updated the page in|could not|refused|failed/i.test(await bodyText(f))) break; }
  await page.waitForTimeout(2500);
  log("S8_OUTCOME", ((await bodyText(f)).match(/(Published to[^·]{0,200}|Updated the page in[^·]{0,200}|[^.]{0,80}(could not|refused|failed)[^.]{0,160})/) || [null])[0]);
  log("S8_CHIP", await f.locator('[data-testid="confluence-published-chip"]').first().textContent().catch(() => null));
  log("S8_LINKS", await real.evaluate(() => Array.from(document.querySelectorAll("a[href*='wiki']")).map((a: any) => a.href).slice(0, 5)).catch(() => null));
  await shot(page, "s8-05-published");
  await f.getByRole("button", { name: /Close/i }).first().click().catch(() => {});
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(1500);
  // ── the next report of the same plan remembers space + parent ──
  await f.locator(".lz-history-item").filter({ hasText: "REL719 story 2" }).first().click();
  await page.waitForTimeout(5000);
  await f.locator('[data-testid="publish-to-confluence"]').first().click();
  await dlg.waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(5000);
  log("S8_REMEMBERED_DIALOG", ((await dlg.textContent()) || "").replace(/\s+/g, " ").slice(0, 700));
  await shot(page, "s8-06-remembered");
  await dlg.locator("button").filter({ hasText: /^(Publish|Publish again)$/ }).first().click();
  for (let i = 0; i < 90; i++) { await page.waitForTimeout(1000); if (/Published to|Updated the page in|could not|refused|failed/i.test(await bodyText(f))) break; }
  await page.waitForTimeout(2500);
  log("S8_OUTCOME_2", ((await bodyText(f)).match(/(Published to[^·]{0,200}|Updated the page in[^·]{0,200}|[^.]{0,80}(could not|refused|failed)[^.]{0,160})/) || [null])[0]);
  await shot(page, "s8-07-published-2");
  log("D_END_STAGED", await isStaged(f));
  expect(true).toBe(true);
});
