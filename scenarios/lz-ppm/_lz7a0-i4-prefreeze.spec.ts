// LZ7A0 item 4 — PRE-FREEZE FALLBACK. A report captured on 2026-09-07 (plan "test",
// report "test 3") holds no `archiveHeadline`/`planSummary`. Publishing it today must
// still open on the fallback headline with the cover at the TOP, and its DOWNLOAD
// must carry no verdict block (`class="vw"`).
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const SP = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7a0";
const PLAN = "test";
const REPORT = "test 3";
const SPACE = "LZ7A0 tester space";
test.describe.configure({ retries: 0, timeout: 1_800_000 });
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");

test("I4: publish a pre-freeze capture", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  for (let i = 0; i < 8; i++) {
    await frame.locator('[data-testid="plan-card"]').filter({ hasText: /^test/ }).first().click().catch(() => {});
    await page.waitForTimeout(3500);
    if (await frame.getByRole("button", { name: /^Planning/i }).count()) break;
  }
  console.log("PLAN_HEADING", (await bodyText(frame)).slice(0, 160));
  await frame.getByRole("button", { name: /^Planning/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  await frame.getByText("Sponsor reports", { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${SP}/i4-00-reports.png`, fullPage: true });
  await frame.locator(".lz-history-item").filter({ hasText: REPORT }).first().click();
  await page.waitForTimeout(8000);
  console.log("SELECTED_HEADING", await frame.locator(".lz-history-detail h3").first().textContent().catch(() => null));
  console.log("HAS_VERDICT_BLOCK_ON_RECEIPT", await frame.locator('[data-testid="report-archive-verdict"]').count());
  await page.screenshot({ path: `${SP}/i4-01-receipt.png`, fullPage: true });

  await frame.locator('[data-testid="publish-to-confluence"]').first().click();
  await frame.locator('[data-testid="publish-confluence-dialog"]').first().waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(3000);
  console.log("TITLE", JSON.stringify(await frame.locator('[data-testid="publish-confluence-dialog"] input').first().inputValue().catch(() => null)));
  await frame.locator('[data-testid="publish-confluence-dialog"] button').filter({ hasText: /Choose a space|LZ7A0 tester space/ }).first().click();
  await page.waitForTimeout(2500);
  await frame.locator('[role="option"]').filter({ hasText: SPACE }).first().dispatchEvent("click");
  await page.waitForTimeout(1500);
  await frame.locator('[data-testid="publish-confluence-dialog"] button').filter({ hasText: /^(Publish|Publish again)$/ }).first().click();
  for (let i = 0; i < 180; i++) { await page.waitForTimeout(1000); if (/Published to|Updated the page in|already matches|cannot|refused/i.test(await bodyText(frame))) break; }
  await page.waitForTimeout(2000);
  const t = await bodyText(frame);
  const m = t.match(/(Published to [^·]*|Updated the page in [^·]*|That page in .*?(?:kept|nothing was written))/);
  console.log("OUTCOME", JSON.stringify(m ? m[0].trim() : null));
  await page.screenshot({ path: `${SP}/i4-02-published.png`, fullPage: true });

  const dl = page.waitForEvent("download", { timeout: 300_000 }).catch(() => null);
  await frame.getByRole("button", { name: /Download complete HTML report/i }).first().click().catch((e: any) => console.log("DLERR", String(e).slice(0, 140)));
  const d = await dl;
  if (d) { try { await d.saveAs(`${SP}/prefreeze-download.html`); console.log("DOWNLOADED", d.suggestedFilename()); } catch (e) { console.log("SAVE_ERR", String(e).slice(0, 140)); } }
  await page.waitForTimeout(3000);

});
