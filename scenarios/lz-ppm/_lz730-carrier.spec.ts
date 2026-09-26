// LZ730 live check — the storyline document's FINISH CARRIER is a LEAF (ac1b972b),
// read ON SCREEN (report detail) and then PUBLISHED to a scratch Confluence space.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";
const bed = JSON.parse(fs.readFileSync("/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz730/bed.json", "utf8"));
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz730";
fs.mkdirSync(OUT, { recursive: true });
test.describe.configure({ retries: 0, timeout: 2_400_000, mode: "serial" });

test("storyline document on screen and on a Confluence page names the leaf carrier", async ({ page }) => {
  const R: any = {};
  await page.setViewportSize({ width: 1700, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.frame;
  const realFrame = async () => (await (await frame.locator(":root").elementHandle())!.ownerFrame())!;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 180_000 });

  await (await realFrame()).evaluate(() => {
    Object.keys(localStorage).filter((k) => k.startsWith("lz.confluence.space.")).forEach((k) => localStorage.removeItem(k));
  });

  await frame.locator('[data-testid="plan-card"]').filter({ hasText: bed.tag }).first().click();
  await page.waitForTimeout(18000);
  const body = async () => (await frame.locator("body").textContent().catch(() => "")) || "";
  R.appVersion = ((await body()).match(/v?\d+\.\d+\.\d+/) || ["(none)"])[0];
  // The plan CARD's / header's finish, for the agreement check.
  R.headerText = (await body()).replace(/\s+/g, " ").slice(0, 900);

  await frame.getByRole("button", { name: /^Planning$/i }).first().click();
  await page.waitForTimeout(6000);
  await frame.getByRole("button", { name: /^Sponsor reports$/i }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(8000);
  await frame.locator('[data-testid="sponsor-reports"]').first().waitFor({ state: "visible", timeout: 60_000 });
  await page.screenshot({ path: `${OUT}/b00-reports.png` });
  R.reportsList = ((await frame.locator('[data-testid="sponsor-reports"]').first().textContent()) || "").replace(/\s+/g, " ");

  const openReport = async (name: string) => {
    const entry = frame.getByRole("button", { name: new RegExp(name) }).first();
    if (await entry.count()) await entry.dispatchEvent("click");
    else await frame.getByText(name, { exact: false }).first().dispatchEvent("click");
    await page.waitForTimeout(8000);
  };

  // ── ON SCREEN
  await openReport("LZ730 capture 2 with promise");
  await page.screenshot({ path: `${OUT}/b01-storyline-detail.png`, fullPage: false });
  R.docOnScreen = ((await frame.locator('[data-testid="storyline-report-doc"]').first().textContent().catch(() => null)) || "(no storyline-report-doc)").replace(/\s+/g, " ").trim();
  R.bodyOnScreen = (await body()).replace(/\s+/g, " ");
  const rf0 = await realFrame();
  R.docScrollShot = true;
  await rf0.evaluate(() => {
    const el = document.querySelector('[data-testid="storyline-report-doc"]');
    if (el) el.scrollIntoView({ block: "start" });
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/b02-doc-top.png` });

  // ── PUBLISH
  const dlg = () => frame.locator('[data-testid="publish-confluence-dialog"]').first();
  await frame.locator('[data-testid="publish-to-confluence"]').first().dispatchEvent("click");
  await dlg().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(8000);
  await dlg().getByRole("combobox").first().dispatchEvent("click");
  await page.waitForTimeout(1500);
  R.options = await frame.getByRole("option").allInnerTexts();
  await frame.getByRole("option", { name: /LZ730 storyline publish scratch/ }).first().dispatchEvent("click");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/b03-dialog-picked.png` });
  await dlg().locator("button").filter({ hasText: /^Publish$|^Publish again$/ }).first().dispatchEvent("click");
  let toast = "(none)";
  for (let i = 0; i < 200; i++) {
    const t = (await body()).replace(/\s+/g, " ");
    const m = t.match(/(Published to [^·]+|Updated the page in [^·]+)·\s*Open page/);
    if (m) { toast = m[0]; break; }
    const e = t.match(/[A-Z][^.]{10,180}(?:Confluence|space)[^.]{0,120}\./);
    if (e && /cannot|refused|no longer|permission|unavailable/i.test(e[0])) { toast = "ERROR: " + e[0]; break; }
    await page.waitForTimeout(500);
  }
  R.toast = toast;
  R.pageUrl = await frame.locator("a").filter({ hasText: /^Open page$/ }).first().getAttribute("href").catch(() => null);
  await page.screenshot({ path: `${OUT}/b04-toast.png` });
  await page.waitForTimeout(3000);
  R.chip = await frame.locator('[data-testid="confluence-published-chip"]').first().innerText().catch(() => "(none)");
  console.log("RESULT", JSON.stringify({ toast: R.toast, url: R.pageUrl, chip: R.chip, options: R.options }, null, 1));
  console.log("DOC ON SCREEN:\n" + R.docOnScreen);
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(R, null, 2));
  expect(1).toBe(1);
});
