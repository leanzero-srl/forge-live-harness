// dev 7.20.0 release proof — LZPT storyline + captures (tester). Builds the storyline structure
// (AI view; the tester deletes it after with the hook's aiViewDelete), reads the lede, then captures
// a Storyline report and a Full archive (the tester deletes both reports over REST after).
import { test, expect } from "../../fixtures/forge";
import { boot, openPlan, tab, shot, bodyText, isStaged, log, OUT } from "./_rel720-lib";
import fs from "node:fs";

test.describe.configure({ retries: 0, timeout: 1_800_000 });

async function capture(page: any, frame: any, name: string, template: "storyline" | "report") {
  const form = frame.locator(".lz-planning-capture").first();
  await form.getByLabel("Report name").fill(name);
  await form.locator("button").filter({ hasText: /Full archive|Storyline report/ }).first().click(); await page.waitForTimeout(600);
  await frame.locator('[role="option"]').filter({ hasText: template === "storyline" ? /Storyline report/ : /Full archive/ }).first().dispatchEvent("click");
  await page.waitForTimeout(600);
  await form.getByRole("button", { name: "Capture sponsor report" }).click();
  for (let i = 0; i < 150; i++) {
    await page.waitForTimeout(2000);
    if (await frame.locator(".lz-history-item").filter({ hasText: name }).count()) break;
    if (i % 10 === 0) log(`CAPTURE_${name}_WAIT_${i}`, ((await bodyText(frame)).match(/(Captur[^.]{0,120})/) || [null])[0]);
  }
  await frame.locator(".lz-history-item").filter({ hasText: name }).first().click();
  await page.waitForTimeout(6000);
  return ((await frame.locator(".lz-history-detail").first().textContent().catch(() => "")) || "").replace(/\s+/g, " ");
}

test("rel720 C: LZPT storyline lede, storyline capture, archive capture", async ({ page }) => {
  const { frame, real } = await boot(page);
  // header version once the backend answers
  for (let i = 0; i < 40; i++) { if (/VERSION\s*\d/i.test((await frame.locator("header").first().textContent().catch(() => "")) || "")) break; await page.waitForTimeout(1000); }
  log("C_HEADER_TEXT", ((await frame.locator("header").first().textContent().catch(() => "")) || "").replace(/\s+/g, " "));
  await frame.getByRole("button", { name: /What's new/ }).first().click();
  for (let i = 0; i < 30; i++) { const t = await frame.locator('[data-testid="release-running"]').first().textContent().catch(() => ""); if (t && !/Reading/.test(t)) break; await page.waitForTimeout(1000); }
  log("C_RUNNING", await frame.locator('[data-testid="release-running"]').first().textContent().catch(() => null));
  await shot(page, "c-01-whatsnew-running");
  await frame.getByRole("button", { name: "Close What's new" }).first().click().catch(async () => { await page.keyboard.press("Escape"); });
  await page.waitForTimeout(800);

  await openPlan(page, frame);
  await tab(page, frame, "storyline");
  await page.waitForTimeout(3000);
  const build = frame.getByRole("button", { name: "Build the storyline" }).first();
  if (await build.count()) {
    await build.click();
    for (let i = 0; i < 90; i++) { await page.waitForTimeout(2000); if (await frame.locator('[data-testid="storyline-about"]').count()) break; }
  }
  await page.waitForTimeout(3000);
  const sl = await real.evaluate(() => {
    const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as any;
    return { about: (q("about-verdict")?.textContent || "").replace(/\s+/g, " "), rung: q("about-verdict")?.getAttribute("data-rung"), tickets: q("about-tickets")?.textContent ?? null,
      ticketsColor: q("about-tickets") ? getComputedStyle(q("about-tickets")).color : null,
      lede: (document.querySelector(".lz-sl-lede")?.textContent || "").replace(/\s+/g, " "), reconcile: q("storyline-reconcile")?.textContent ?? null };
  });
  log("STORYLINE", sl);
  await frame.locator('[data-testid="storyline-about"]').first().screenshot({ path: `${OUT}/c-02-storyline-about.png` }).catch(() => {});
  await shot(page, "c-02b-storyline");

  await tab(page, frame, "planning");
  await frame.locator("button").filter({ hasText: /^Sponsor reports$/ }).first().click();
  await page.waitForTimeout(5000);
  const d1 = await capture(page, frame, "REL720 story", "storyline");
  fs.writeFileSync(`${OUT}/c-03-story-receipt.txt`, d1);
  log("STORY_RECEIPT", d1.slice(0, 3000));
  await shot(page, "c-03-story");
  const dl = page.waitForEvent("download", { timeout: 120_000 }).catch(() => null);
  await frame.locator(".lz-history-detail button").filter({ hasText: /Download/i }).first().click().catch(() => {});
  const d = await dl;
  if (d) { await d.saveAs(`${OUT}/c-03-story.html`); log("STORY_DOWNLOAD", d.suggestedFilename()); } else log("STORY_DOWNLOAD", null);
  const d2 = await capture(page, frame, "REL720 archive", "report");
  fs.writeFileSync(`${OUT}/c-04-archive-receipt.txt`, d2);
  log("ARCHIVE_RECEIPT", d2.slice(0, 3000));
  await shot(page, "c-04-archive");
  log("C_END_STAGED", await isStaged(frame));
  expect(true).toBe(true);
});
