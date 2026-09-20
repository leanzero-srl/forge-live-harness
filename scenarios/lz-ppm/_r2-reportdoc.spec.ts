// ROUND-2: render the captured storyline report in the UI (Planning → Sponsor reports).
// PRECONDITION: a report must already be captured on the seeded plan — run
// _lc6740-uicapture.spec.ts (which captures one through the real template chooser)
// after _r2-storyline and before this. Order: _r2-seed → _r2-storyline →
// _lc6740-uicapture → _r2-reportdoc → _r2-cleanup.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6730";
const bed = JSON.parse(fs.readFileSync(`${OUT}/bed.json`, "utf8"));
test.describe.configure({ retries: 0, timeout: 2_400_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";
const body = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";

test("R1 the storyline report document on screen", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1300 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  if (s.kind !== "custom") throw new Error("no frame");
  const frame = s.frame;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: bed.planName }).first().click();
  await page.waitForTimeout(7000);
  if (!/Gantt/i.test(await body(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  await frame.getByRole("button", { name: /^Planning$/i }).first().click();
  await page.waitForTimeout(6000);
  const sec = frame.locator('[data-testid="sponsor-reports"]');
  if (!(await sec.count())) {
    // Planning may present sub-tabs
    await frame.getByRole("button", { name: /Sponsor reports?/i }).first().click().catch(() => {});
    await page.waitForTimeout(5000);
  }
  await sec.waitFor({ state: "visible", timeout: 60_000 });
  console.log("REPORT LIST:", (await txt(sec)).slice(0, 1200));
  const row = sec.locator("button.lz-history-item").first();
  console.log("ROW:", await txt(row));
  await row.click();
  await frame.locator('[data-testid="storyline-report"]').waitFor({ state: "visible", timeout: 90_000 });
  await page.waitForTimeout(3000);
  const doc = frame.locator('[data-testid="storyline-report"]');
  const dt = await txt(doc);
  fs.writeFileSync(`${OUT}/R1-report-doc.txt`, dt);
  console.log("=== RENDERED REPORT DOC ===\n" + dt);
  console.log("ID LEAKS IN RENDERED DOC:", JSON.stringify((dt.match(/\b(?:ch|bt|sg):[0-9a-f]{4,}/g) || [])));
  await page.screenshot({ path: `${OUT}/R1-report-doc.png`, fullPage: true });
  expect(dt.length).toBeGreaterThan(100);
});
