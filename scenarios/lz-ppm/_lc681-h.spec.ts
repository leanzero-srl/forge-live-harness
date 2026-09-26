// LIVE CHECK dev 6.81.0 — ITEM 6 (CSV, blob captured at createObjectURL) +
// ITEM 4 "BEFORE": "Chain Growth Bed" has 9 issues / 3 chains of 3, its stored AI
// view records storylinesNone='chains-below-floor' -> the Storyline page must say
// "too small" and offer NO build.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/shots";
test.describe.configure({ retries: 1, timeout: 2_400_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";

test("csv + storyline before growth", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.frame;
  const f: any = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 150_000 });
  await page.waitForTimeout(3000);
  const R: any = {};

  // ---------- ITEM 6 ----------
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: "Derived Lag Bed" }).first().click();
  await page.waitForTimeout(16000);
  await frame.getByRole("button", { name: /^Dashboard$/i }).first().click().catch(() => {});
  await page.waitForTimeout(12000);
  await f.evaluate(() => {
    (window as any).__blobs = [];
    const mk = URL.createObjectURL.bind(URL);
    (URL as any).createObjectURL = (b: any) => { (window as any).__blobs.push(b); return mk(b); };
    (URL as any).revokeObjectURL = () => {};
    const proto: any = HTMLAnchorElement.prototype;
    const orig = proto.click;
    proto.click = function () { if (this.download) return; return orig.apply(this, arguments as any); };
  });
  await frame.locator("button").filter({ hasText: /^Export CSV$/i }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(4000);
  await frame.locator("button").filter({ hasText: /^Health report$/i }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(4000);
  R.files = await f.evaluate(async () => {
    const out: any[] = [];
    for (const b of (window as any).__blobs || []) { try { out.push(await b.text()); } catch (e) { out.push(`(err ${e})`); } }
    return out;
  });
  for (const fl of R.files) console.log("FILE >>>\n" + String(fl).slice(0, 2000) + "\n<<<");

  // ---------- ITEM 4 BEFORE ----------
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const s2 = await enterForgeSurface(page, { surface: "custom" });
  const frame2: any = s2.frame;
  await page.waitForTimeout(6000);
  await frame2.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 150_000 });
  await page.waitForTimeout(3000);
  await frame2.locator('[data-testid="plan-card"]').filter({ hasText: "Chain Growth Bed" }).first().click();
  await page.waitForTimeout(16000);
  await frame2.locator('[data-testid="view-tab-storyline"]').first().click().catch(async () => {
    await frame2.getByRole("button", { name: /^Storyline$/i }).first().click();
  });
  await page.waitForTimeout(18000);
  const sl = async (fr: any) => ({
    empty: (await txt(fr.locator('[data-testid="storyline-empty"]'))).replace(/\n/g, " | "),
    emptyCount: await fr.locator('[data-testid="storyline-empty"]').count(),
    buildBtns: await fr.locator("button").filter({ hasText: /Build the storyline|Build it again|Build AI structure|Rebuild/i }).allInnerTexts().catch(() => []),
    body: (await txt(fr.locator("body"))).replace(/\s+/g, " ").slice(0, 1400),
  });
  R.storylineBefore = await sl(frame2);
  console.log("STORYLINE BEFORE", JSON.stringify(R.storylineBefore, null, 1));
  await page.screenshot({ path: `${OUT}/h01-storyline-before.png` });

  const body = (await txt(frame2.locator("body"))).replace(/\s+/g, " ");
  R.finalStaged = /Apply\s+\d+\s+change|Save\s*\(\d+\)/.test(body);
  console.log("STAGED_AFTER_CLEANUP =", R.finalStaged);
  fs.writeFileSync(`${OUT}/h-results.json`, JSON.stringify(R, null, 2));
  expect(R.files.length).toBeGreaterThan(0);
});
