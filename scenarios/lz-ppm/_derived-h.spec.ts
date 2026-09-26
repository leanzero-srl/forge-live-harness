// Item 1d: the Storyline page on a plan large enough to HAVE storylines.
// Stored max due = 2026-10-23; the settled (lagged) finish = 2026-10-30.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lag3";
const NAME = "LagStamp Storyline";
test.describe.configure({ retries: 0, timeout: 2_400_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";

test("storyline lede + planEnd read the settled schedule", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.frame;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 150_000 });
  await page.waitForTimeout(3000);
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first().click();
  await page.waitForTimeout(16000);
  const R: any = {};

  // Table first: the STORED rows must still be Jira's
  await frame.getByRole("button", { name: /^Table$/i }).first().click().catch(() => {});
  await page.waitForTimeout(7000);
  R.table = [];
  for (const r of await frame.locator('[data-testid="table-row"]').all()) R.table.push({ k: await r.getAttribute("data-row-key"), s: await r.getAttribute("data-row-start"), d: await r.getAttribute("data-row-due") });
  console.log("TABLE", JSON.stringify(R.table));
  const save = frame.locator('[data-testid="plan-save-btn"]');
  R.toolbar = { save: await txt(save), applies: await frame.locator("button").filter({ hasText: /^Apply \d+ change/ }).count() };
  console.log("TOOLBAR", JSON.stringify(R.toolbar));

  // Dashboard hero for the settled finish
  await frame.getByRole("button", { name: /^Dashboard$/i }).first().click().catch(() => {});
  await page.waitForTimeout(10000);
  R.sc = (await txt(frame.locator('[data-testid="sc-planned"]'))).replace(/\n/g, " | ");
  R.hero = (await txt(frame.locator('[data-testid="plan-health"]').first())).replace(/\n/g, " | ");
  console.log("SC", R.sc); console.log("HERO", R.hero);
  await page.screenshot({ path: `${OUT}/h01-dashboard.png` });

  // Storyline
  await frame.locator('[data-testid="view-tab-storyline"]').first().click().catch(async () => { await frame.getByRole("button", { name: /^Storyline$/i }).first().click(); });
  await page.waitForTimeout(14000);
  const build = frame.getByRole("button", { name: /Build the storyline/i });
  if (await build.count()) {
    await build.first().click({ force: true });
    for (let i = 0; i < 30; i++) { await page.waitForTimeout(6000); if (await frame.locator('[data-testid="storyline-block"]').count()) break; }
    await page.waitForTimeout(6000);
  }
  R.storyline = {
    blocks: await frame.locator('[data-testid="storyline-block"]').count(),
    empty: await frame.locator('[data-testid="storyline-empty"]').count(),
    lede: (await txt(frame.locator(".lz-sl-lede").first())).replace(/\n/g, " | "),
    about: (await txt(frame.locator('[data-testid="storyline-about"]'))).replace(/\n/g, " | ").slice(0, 900),
    rulers: (await frame.locator('[data-testid="storyline-ruler"]').allInnerTexts().catch(() => [])).map((x) => x.replace(/\n/g, " | ")),
    verdict: await txt(frame.locator('[data-testid="storyline-verdict"]')),
    storedOnly: (await txt(frame.locator('[data-testid="storyline-stored-only"]'))).replace(/\n/g, " | "),
  };
  const body = await txt(frame.locator("body"));
  R.bodyHas = { s1030: /2026-10-30/.test(body), s1023: /2026-10-23/.test(body), s1026: /2026-10-26/.test(body) };
  console.log("STORYLINE", JSON.stringify(R.storyline, null, 1));
  console.log("BODY HAS", JSON.stringify(R.bodyHas));
  await page.screenshot({ path: `${OUT}/h02-storyline.png`, fullPage: false });
  await page.screenshot({ path: `${OUT}/h03-storyline-full.png`, fullPage: true });
  fs.writeFileSync(`${OUT}/h-results.json`, JSON.stringify(R, null, 2));
  expect(1).toBe(1);
});
