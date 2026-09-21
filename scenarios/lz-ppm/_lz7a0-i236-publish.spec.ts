// LZ7A0 items 2, 3 (page half) and 6 — publish the ARCHIVE and the STORYLINE of the
// same plan into a fresh Confluence space, then republish the archive unchanged.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const SP = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7a0";
const PLAN = "LZ7A0 retest bed";
const SPACE = "LZ7A0 tester space";
test.describe.configure({ retries: 0, timeout: 1_800_000 });
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");

test("I2/I3/I6: publish archive + storyline, then republish unchanged", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  for (let i = 0; i < 8; i++) { await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {}); await page.waitForTimeout(3000); if (await frame.getByRole("button", { name: /^Planning/i }).count()) break; }
  console.log("STAGED_ON_OPEN", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await frame.getByRole("button", { name: /^Planning/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  await frame.getByText("Sponsor reports", { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(6000);

  const pick = async (name: string) => {
    await frame.locator(".lz-history-item").filter({ hasText: name }).first().click();
    await page.waitForTimeout(6000);
    console.log("SELECTED_HEADING", (await frame.locator(".lz-history-detail h3").first().textContent().catch(() => null)));
  };
  const publish = async (tag: string) => {
    await frame.locator('[data-testid="publish-to-confluence"]').first().click();
    await frame.locator('[data-testid="publish-confluence-dialog"]').first().waitFor({ state: "visible", timeout: 60_000 });
    await page.waitForTimeout(3000);
    const title = await frame.locator('[data-testid="publish-confluence-dialog"] input').first().inputValue().catch(() => null);
    console.log(`${tag}_DEFAULT_TITLE`, JSON.stringify(title));
    // custom Select — never a native <select>
    await frame.locator('[data-testid="publish-confluence-dialog"] button').filter({ hasText: /Choose a space|LZ7A0 tester space/ }).first().click();
    await page.waitForTimeout(2500);
    const opts = await frame.locator('[role="option"]').allTextContents().catch(() => []);
    console.log(`${tag}_SPACE_OPTIONS`, JSON.stringify(opts.slice(0, 20)));
    await frame.locator('[role="option"]').filter({ hasText: SPACE }).first().dispatchEvent("click");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SP}/i2-${tag}-dialog.png`, fullPage: true });
    await frame.locator('[data-testid="publish-confluence-dialog"] button').filter({ hasText: /^(Publish|Publish again)$/ }).first().click();
    for (let i = 0; i < 90; i++) {
      await page.waitForTimeout(1000);
      const t = await bodyText(frame);
      if (/Published to|Updated the page in|already matches/.test(t)) break;
    }
    await page.waitForTimeout(2000);
    const t = await bodyText(frame);
    const m = t.match(/(Published to [^·]*|Updated the page in [^·]*|That page in .*?(?:kept|nothing was written))/);
    console.log(`${tag}_OUTCOME`, JSON.stringify(m ? m[0].trim() : null));
    console.log(`${tag}_CHIP`, JSON.stringify(await frame.locator('[data-testid="confluence-published-chip"]').first().textContent().catch(() => null)));
    await page.screenshot({ path: `${SP}/i2-${tag}-published.png`, fullPage: true });
  };

  // ---------- ARCHIVE ----------
  await pick("LZ7A0 archive");
  await publish("archive1");
  await page.waitForTimeout(4000);
  // ---------- ITEM 6: republish UNCHANGED ----------
  await publish("archive2");

  // ---------- STORYLINE ----------
  await pick("LZ7A0 storyline");
  await page.screenshot({ path: `${SP}/i3-05-storyline-receipt.png`, fullPage: true });
  const sw = frame.locator('[data-testid="storyline-report-verdict"]').first();
  console.log("STORY_WORD", JSON.stringify(await sw.textContent().catch(() => null)));
  console.log("STORY_WORD_BG", await sw.evaluate((el: any) => getComputedStyle(el).backgroundColor).catch(() => null));
  console.log("STORY_LEDE", JSON.stringify(await frame.locator('[data-testid="storyline-report-verdict-line"]').first().textContent().catch(() => null)));
  console.log("STORY_PRESSURE", JSON.stringify(await frame.locator('[data-testid="storyline-report-pressure"]').first().textContent().catch(() => null)));
  console.log("STORY_COMMITMENT", JSON.stringify(await frame.locator('[data-testid="storyline-report-commitment"]').first().textContent().catch(() => null)));
  console.log("STORY_UNDATED", JSON.stringify(await frame.locator('[data-testid="storyline-report-undated"]').first().textContent().catch(() => null)));
  const dl = page.waitForEvent("download", { timeout: 120_000 }).catch(() => null);
  await frame.locator(".lz-history-detail button").filter({ hasText: /Download/i }).first().click().catch(() => {});
  const d = await dl;
  if (d) { await d.saveAs(`${SP}/storyline-download.html`); console.log("STORYLINE_DOWNLOAD", d.suggestedFilename()); }
  await page.waitForTimeout(2000);
  await publish("storyline1");
  console.log("END_STAGED", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
});
