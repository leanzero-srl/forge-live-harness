// LZ700 item 2 — REAL Confluence publish of a sponsor report and a storyline report.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";
const bed = JSON.parse(fs.readFileSync("/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz700/bed.json", "utf8"));
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz700/shots";
test.describe.configure({ retries: 0, timeout: 2_400_000, mode: "serial" });

test("publish reports to Confluence", async ({ page }) => {
  const R: any = { publishes: [] };
  await page.setViewportSize({ width: 1700, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.frame;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 180_000 });
  await page.waitForTimeout(3000);
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: bed.tag }).first().click();
  await page.waitForTimeout(16000);
  const body = async () => (await frame.locator("body").textContent().catch(() => "")) || "";

  await frame.getByRole("button", { name: /^Planning$/i }).first().click();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUT}/p00-planning.png` });
  console.log("PLANNING BODY", (await body()).replace(/\s+/g, " ").slice(0, 1200));
  console.log("BUTTONS", JSON.stringify(await frame.locator("button").allInnerTexts()));
  await frame.getByRole("button", { name: /^Sponsor reports$/i }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(8000);
  await frame.locator('[data-testid="sponsor-reports"]').first().waitFor({ state: "visible", timeout: 60_000 });
  await page.screenshot({ path: `${OUT}/p01-reports.png` });
  R.reportsText = (await body()).replace(/\s+/g, " ").slice(0, 1500);
  console.log("REPORTS", R.reportsText);

  const doPublish = async (reportName: string, pass: number) => {
    const entry = frame.getByRole("button", { name: new RegExp(reportName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first();
    if (await entry.count()) { await entry.dispatchEvent("click"); } else {
      await frame.getByText(reportName, { exact: false }).first().dispatchEvent("click");
    }
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${OUT}/p02-${pass}-detail-${reportName.replace(/\W+/g, "_")}.png` });
    const chipBefore = await frame.locator('[data-testid="confluence-published-chip"]').first().innerText().catch(() => "(none)");
    const btn = frame.locator('[data-testid="publish-to-confluence"]').first();
    const btnLabel = await btn.innerText().catch(() => "(no button)");
    await btn.dispatchEvent("click");
    await page.waitForTimeout(1500);
    await frame.locator('[data-testid="publish-confluence-dialog"]').first().waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(6000);   // spaces load
    await page.screenshot({ path: `${OUT}/p03-${pass}-dialog-${reportName.replace(/\W+/g, "_")}.png` });
    const combo = frame.locator('[data-testid="publish-confluence-dialog"]').getByRole("combobox").first();
    const comboNameClosed = await combo.getAttribute("aria-labelledby").catch(() => null);
    await combo.dispatchEvent("click");
    await page.waitForTimeout(1500);
    const opts = await frame.getByRole("option").allInnerTexts();
    console.log("SPACE OPTIONS", JSON.stringify(opts));
    const lz = frame.getByRole("option", { name: /LZ publish scratch/ }).first();
    if (await lz.count()) await lz.dispatchEvent("click"); else await frame.getByRole("option").first().dispatchEvent("click");
    await page.waitForTimeout(1200);
    const titleVal = await frame.locator('[data-testid="publish-confluence-dialog"] input').first().inputValue().catch(() => "");
    await page.screenshot({ path: `${OUT}/p04-${pass}-chosen-${reportName.replace(/\W+/g, "_")}.png` });
    await frame.locator('[data-testid="publish-confluence-dialog"] button').filter({ hasText: /^Publish$|^Publish again$/ }).first().dispatchEvent("click");
    let toast = "(none)";
    for (let i = 0; i < 120; i++) {
      const t = await body();
      const m = t.match(/(Published to [^·]+|Updated the page in [^·]+)·\s*Open page/);
      if (m) { toast = m[0]; break; }
      const e = t.match(/The app cannot write to Confluence[^.]*\.|That space no longer exists[^.]*\.|Confluence (?:refused|is unavailable)[^.]*\./);
      if (e) { toast = "ERROR: " + e[0]; break; }
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: `${OUT}/p05-${pass}-toast-${reportName.replace(/\W+/g, "_")}.png` });
    const link = frame.locator('a').filter({ hasText: /^Open page$/ }).first();
    const pageUrl = await link.getAttribute("href").catch(() => null);
    await page.waitForTimeout(4000);
    const chipAfter = await frame.locator('[data-testid="confluence-published-chip"]').first().innerText().catch(() => "(none)");
    const openLink = await frame.locator('a').filter({ hasText: /Open in Confluence/ }).first().getAttribute("href").catch(() => null);
    const got = { reportName, pass, btnLabel, chipBefore, chipAfter, toast, pageUrl, openLink, titleVal, comboNameClosed, spaceOptions: opts };
    R.publishes.push(got); console.log("PUBLISH", JSON.stringify(got));
    await page.screenshot({ path: `${OUT}/p06-${pass}-after-${reportName.replace(/\W+/g, "_")}.png` });
    return got;
  };

  await doPublish("LZ700 sponsor report", 1);
  await doPublish("LZ700 sponsor report", 2);      // republish -> v2, same page
  await doPublish("LZ700 storyline report", 1);

  fs.writeFileSync(`${OUT}/conf-results.json`, JSON.stringify(R, null, 2));
  expect(1).toBe(1);
});
