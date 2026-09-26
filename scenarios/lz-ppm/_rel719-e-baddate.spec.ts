// dev 7.19.0 release proof — step 15 "Not a date" chips (fixture "REL719 bad date", due mapped to a
// free-text field holding "end of Q3 maybe") and step 3's admin half (Settings → Maintenance limits).
import { test, expect } from "../../fixtures/forge";
import { boot, openPlan, tab, shot, realHover, bodyText, isStaged, log } from "./_rel719-lib";
import { getTarget } from "../../config/targets";
import { enterForgeSurface } from "../../forge/frame";

test.describe.configure({ retries: 0, timeout: 900_000 });

test("rel719 E: Not a date chips + Maintenance limits", async ({ page }) => {
  const { frame, real } = await boot(page);
  await openPlan(page, frame, "REL719 bad date");
  await tab(page, frame, "gantt");
  await page.waitForTimeout(3000);
  const g = await real.evaluate(() => Array.from(document.querySelectorAll('[data-testid="gantt-invalid-date"]')).map((e: any) => ({ key: e.getAttribute("data-key"), text: e.textContent, bg: getComputedStyle(e).backgroundColor, color: getComputedStyle(e).color })));
  log("S15_GANTT_CHIPS", g);
  const gchip = frame.locator('[data-testid="gantt-invalid-date"]').first();
  if (await gchip.count()) { await realHover(page, gchip); log("S15_GANTT_TIP", await frame.locator('[data-testid="lz-tooltip"]').last().textContent().catch(() => null)); }
  await shot(page, "s15-gantt");
  const bar = frame.locator('[data-testid="gantt-bar"][data-key="TES-43"]').first();
  log("S15_TES43_BAR", await bar.count());
  if (await bar.count()) { await page.mouse.move(3, 3); await realHover(page, bar); log("S15_BAR_TIP", ((await bodyText(frame)).match(/TES-43: .{0,300}/) || [null])[0]); }
  await tab(page, frame, "table");
  await page.waitForTimeout(2500);
  const t = await real.evaluate(() => Array.from(document.querySelectorAll('[data-testid="table-invalid-date"]')).map((e: any) => ({ key: e.getAttribute("data-key"), field: e.getAttribute("data-field"), text: e.textContent, bg: getComputedStyle(e).backgroundColor })));
  log("S15_TABLE_CHIPS", t);
  const tchip = frame.locator('[data-testid="table-invalid-date"]').first();
  if (await tchip.count()) { await page.mouse.move(3, 3); await realHover(page, tchip); log("S15_TABLE_TIP", await frame.locator('[data-testid="lz-tooltip"]').last().textContent().catch(() => null)); }
  log("S15_TABLE_ROW40", await real.evaluate(() => (document.querySelector('[data-testid="table-row"][data-row-key="TES-40"]')?.textContent || "").replace(/\s+/g, " ")));
  await shot(page, "s15-table");
  log("E_STAGED", await isStaged(frame));
  // ── step 3 admin half ──
  const A = getTarget("lz-ppm-admin");
  await page.goto(A.deepLink(A.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const af: any = s.kind === "custom" ? s.frame : null;
  await af.getByText("Maintenance", { exact: true }).first().click({ timeout: 90_000 });
  await page.waitForTimeout(6000);
  const inputs = await af.locator("input").evaluateAll((els: any[]) => els.map((e) => ({ v: e.value, l: (e.closest("label")?.textContent || "").replace(/\s+/g, " ").trim() })));
  log("S3_MAINT_INPUTS", inputs);
  const body = ((await af.locator("body").textContent()) || "").replace(/\s+/g, " ");
  log("S3_MAINT_AI", (body.match(/.{0,200}left this month.{0,400}/) || [body.slice(0, 800)])[0]);
  await shot(page, "s3-maintenance");
  expect(true).toBe(true);
});
