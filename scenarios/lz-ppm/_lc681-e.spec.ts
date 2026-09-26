// LIVE CHECK dev 6.81.0 — ITEM 5 (vocabulary + wd spans) and ITEM 6 (CSV).
// Bed: "Derived Lag Bed" (10-05 -> 10-30 settled = 20 wd / 25 cal d; target Go live 10-28).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/shots";
const NAME = "Derived Lag Bed";
test.describe.configure({ retries: 1, timeout: 2_400_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";

test("items 5 + 6 — vocabulary, wd spans, CSV", async ({ page }) => {
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

  // ---------- 5c: create-plan wizard step 4 must read "Targets" ----------
  await frame.getByRole("button", { name: /New plan|Create plan/i }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(4000);
  R.wizard = { opened: /Step|Sources|Name your plan/i.test(await txt(frame.locator("body"))), steps: [] as string[] };
  R.wizard.steps = await f.evaluate(() => [...document.querySelectorAll("*")]
    .filter((e: any) => e.children.length === 0 && /^(Sources|Name|Targets|Milestones|Calendar|Review|Fields|Schedule)$/i.test((e.textContent || "").trim()))
    .map((e: any) => (e.textContent || "").trim()));
  R.wizard.hasMilestonesWord = /Milestones/.test(await txt(frame.locator("body")));
  R.wizard.hasTargetsWord = /Targets/.test(await txt(frame.locator("body")));
  console.log("WIZARD", JSON.stringify(R.wizard));
  await page.screenshot({ path: `${OUT}/e01-wizard.png` });
  await frame.getByRole("button", { name: /^(Cancel|Close)$/i }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(3000);

  // ---------- open the plan ----------
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first().click();
  await page.waitForTimeout(16000);

  // ---------- 5a: Explain ----------
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await frame.locator('[data-testid="plan-explain-btn"]').first().dispatchEvent("click").catch(async () => {
    await frame.getByRole("button", { name: /Explain this plan/i }).first().dispatchEvent("click");
  });
  await page.waitForTimeout(25000);
  const modal = frame.locator('[data-testid="plan-explain-modal"]').first();
  R.explain = {
    present: await modal.count(),
    strip: (await txt(frame.locator('[data-testid="explain-facts-strip"]'))).replace(/\n/g, " | "),
    verdict: await txt(frame.locator('[data-testid="explain-verdict"]')),
    full: (await txt(modal)).replace(/\n/g, " | ").slice(0, 2600),
  };
  R.stripCells = await frame.locator('[data-testid="explain-facts-strip"]').evaluateAll((e: any[]) => e.length ? [...e[0].children].map((c: any) => (c.innerText || "").replace(/\n/g, " ~ ")) : []);
  console.log("EXPLAIN STRIP", JSON.stringify(R.explain.strip));
  console.log("STRIP CELLS", JSON.stringify(R.stripCells, null, 1));
  console.log("EXPLAIN FULL", R.explain.full);
  await page.screenshot({ path: `${OUT}/e02-explain.png` });
  // span unit + wd tokens
  R.spanTokens = (R.explain.strip.match(/\d+\s*(wd|cal\.?\s*d|days?)/gi) || []);
  console.log("SPAN TOKENS", JSON.stringify(R.spanTokens));
  await frame.getByRole("button", { name: /^(Close|Cancel|Done)$/ }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(3000);

  // ---------- 5b: Dashboard Milestones card + 6: CSV ----------
  await frame.getByRole("button", { name: /^Dashboard$/i }).first().click().catch(() => {});
  await page.waitForTimeout(12000);
  R.msCard = {
    present: await frame.locator('[data-testid="milestones-card"]').count(),
    text: (await txt(frame.locator('[data-testid="milestones-card"]'))).replace(/\n/g, " | "),
    empty: (await txt(frame.locator('[data-testid="milestones-empty"]'))).replace(/\n/g, " | "),
    rows: await frame.locator('[data-testid="milestone-row"]').count(),
  };
  console.log("MILESTONES CARD", JSON.stringify(R.msCard, null, 1));
  await frame.locator('[data-testid="milestones-card"]').first().scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/e03-dash-milestones.png` });

  // capture the CSV blob
  await f.evaluate(() => {
    const orig = URL.createObjectURL.bind(URL);
    (window as any).__csv = [];
    (URL as any).createObjectURL = (b: any) => { b.text().then((t: string) => (window as any).__csv.push(t)); return orig(b); };
  });
  const csvBtn = frame.locator("button").filter({ hasText: /Export CSV|Download all issues|Health report/i });
  R.csvButtons = await csvBtn.allInnerTexts().catch(() => []);
  console.log("CSV BUTTONS", JSON.stringify(R.csvButtons));
  for (let i = 0; i < await csvBtn.count(); i++) {
    await csvBtn.nth(i).dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(2500);
    // a menu may open
    const menuItems = frame.locator("button, [role=menuitem]").filter({ hasText: /issues as CSV|health report|Download/i });
    for (let j = 0; j < Math.min(await menuItems.count(), 3); j++) {
      await menuItems.nth(j).dispatchEvent("click").catch(() => {});
      await page.waitForTimeout(2000);
    }
  }
  await page.waitForTimeout(3000);
  R.csv = await f.evaluate(() => (window as any).__csv || []);
  console.log("CSV COUNT", R.csv.length);
  for (const c of R.csv) console.log("CSV >>>\n" + String(c).slice(0, 1400));
  await page.screenshot({ path: `${OUT}/e04-csv.png` });

  const body = (await txt(frame.locator("body"))).replace(/\s+/g, " ");
  R.finalStaged = /Apply\s+\d+\s+change|Save\s*\(\d+\)/.test(body);
  console.log("STAGED_AFTER_CLEANUP =", R.finalStaged);
  fs.writeFileSync(`${OUT}/e-results.json`, JSON.stringify(R, null, 2));
  expect(R.finalStaged).toBe(false);
});
