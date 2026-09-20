// ROUND-2 item 5: the in-plan Capacity tab, and the InfoTip disc.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6720";
const bed = JSON.parse(fs.readFileSync(`${OUT}/bed.json`, "utf8"));
test.describe.configure({ retries: 0, timeout: 2_400_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";
const body = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";

test("C1 capacity tab", async ({ page }) => {
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
  await frame.locator('[data-testid="view-tab-capacity"]').first().click();
  await frame.locator('[data-testid="plan-capacity"]').waitFor({ state: "visible", timeout: 180_000 });
  await page.waitForTimeout(6000);
  const cap = frame.locator('[data-testid="plan-capacity"]');
  const t = await txt(cap);
  fs.writeFileSync(`${OUT}/C1-capacity.txt`, t);
  console.log("=== CAPACITY TAB ===\n" + t);
  await page.screenshot({ path: `${OUT}/C1-capacity.png`, fullPage: true });
  const measures = await cap.locator('[class*="lz-cap-measure"]').evaluateAll((els: any[]) =>
    els.filter((e) => e.getAttribute("data-testid")?.startsWith("capacity-measure-"))
      .map((e) => ({ id: e.getAttribute("data-testid"), text: e.textContent })));
  console.log("MEASURES:", JSON.stringify(measures, null, 1));
  for (const id of ["capacity-percentile-note", "capacity-throughput-note", "capacity-demand", "capacity-expectation-line", "capacity-expectation-basis", "capacity-cycle-unknown", "capacity-whatif-result", "capacity-whatif-note", "capacity-gate"]) {
    const l = frame.locator(`[data-testid="${id}"]`);
    if (await l.count()) console.log(`${id}: ${(await txt(l)).replace(/\n/g, " | ")}`);
  }
  // InfoTip badge computed background
  const tips = await cap.locator('[class*="lz-infotip"], [data-testid*="infotip"]').count();
  const badges = await frame.locator('body').evaluate(() => {
    const out: any[] = [];
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const e = el as HTMLElement;
      if (e.textContent?.trim() === '?' && e.children.length === 0) {
        const cs = getComputedStyle(e);
        out.push({ cls: e.className, bg: cs.backgroundColor, color: cs.color, radius: cs.borderRadius, w: cs.width, h: cs.height, opacity: cs.opacity });
      }
    }
    return out.slice(0, 12);
  });
  console.log("INFOTIP BADGES:", JSON.stringify(badges, null, 1), "tipEls", tips);
  fs.writeFileSync(`${OUT}/C1-infotip.json`, JSON.stringify(badges, null, 1));
  expect(t.length).toBeGreaterThan(50);
});

test("C2 the captured storyline report, rendered", async ({ page }) => {
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
  const rep = frame.getByRole("button", { name: /^Reports?$/i }).first();
  if (await rep.count()) { await rep.click(); await page.waitForTimeout(6000); }
  const all = await body(frame);
  console.log("REPORTS PAGE:\n" + all.slice(0, 2500));
  // open the newest storyline report
  const row = frame.locator('[data-testid="report-row"], [data-testid="sponsor-report-row"]').first();
  if (await row.count()) { await row.click(); await page.waitForTimeout(7000); }
  const doc = frame.locator('[data-testid="storyline-report-doc"]');
  if (await doc.count()) {
    const dt = await txt(doc);
    fs.writeFileSync(`${OUT}/C2-report-doc.txt`, dt);
    console.log("=== REPORT DOC ===\n" + dt);
    console.log("ID LEAKS IN RENDERED DOC:", JSON.stringify((dt.match(/\b(?:ch|bt):[0-9a-f]{4,}/g) || [])));
  } else {
    const b2 = await body(frame);
    fs.writeFileSync(`${OUT}/C2-report-page.txt`, b2);
    console.log("NO storyline-report-doc; page text:\n" + b2.slice(0, 3000));
    console.log("ID LEAKS ON PAGE:", JSON.stringify((b2.match(/\b(?:ch|bt):[0-9a-f]{4,}/g) || [])));
  }
  await page.screenshot({ path: `${OUT}/C2-report.png`, fullPage: true });
  expect(1).toBe(1);
});
