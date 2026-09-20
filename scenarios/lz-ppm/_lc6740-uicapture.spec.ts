// LIVE CHECK dev 6.74.0 — item 2: the STORYLINE template chosen IN THE UI reaches
// the resolver (commit 4ada2fd5). Drives the real chooser, not REST.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lc6740";
const bed = JSON.parse(fs.readFileSync("/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6730/bed.json", "utf8"));
const NAME = process.env.LC_REPORT_NAME || "lc6740 ui storyline";
test.describe.configure({ retries: 0, timeout: 1_800_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";
const body = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";

test("capture a storyline report from the UI chooser", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1300 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  if (s.kind !== "custom") throw new Error("no frame");
  const frame = s.frame;
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 120_000 });
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: bed.planName }).first().click();
  await page.waitForTimeout(8000);
  if (!/Gantt/i.test(await body(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await frame.getByRole("button", { name: /^Planning$/i }).first().click();
  await page.waitForTimeout(5000);
  await frame.getByRole("button", { name: /Sponsor reports?/i }).first().click().catch(() => {});
  const sec = frame.locator('[data-testid="sponsor-reports"]');
  await sec.waitFor({ state: "visible", timeout: 60_000 });
  await sec.getByLabel("Report name").fill(NAME);
  // THE CHOOSER: the custom Select next to "Report template".
  const combo = sec.getByRole("combobox").first();
  console.log("TEMPLATE BEFORE:", await txt(combo));
  await combo.click();
  await page.waitForTimeout(800);
  const opt = frame.getByRole("option", { name: /Storyline report/i }).first();
  await opt.click();
  await page.waitForTimeout(800);
  console.log("TEMPLATE AFTER:", await txt(combo));
  await page.screenshot({ path: `${OUT}/ui-capture-form.png`, fullPage: true });
  await sec.getByRole("button", { name: /Capture sponsor report/i }).first().click();
  for (let i = 0; i < 120; i++) {
    const t = await txt(sec);
    if (/Immutable report captured/i.test(t)) break;
    await page.waitForTimeout(3000);
  }
  await page.waitForTimeout(3000);
  console.log("NOTICE:", (await txt(sec)).slice(0, 400).replace(/\n/g, " | "));
  const doc = frame.locator('[data-testid="storyline-report"]');
  const isStoryline = await doc.count();
  console.log("STORYLINE REPORT RENDERED:", isStoryline);
  if (isStoryline) fs.writeFileSync(`${OUT}/ui-capture-doc.txt`, await txt(doc));
  await page.screenshot({ path: `${OUT}/ui-capture-doc.png`, fullPage: true });
  expect(isStoryline).toBeGreaterThan(0);
});
