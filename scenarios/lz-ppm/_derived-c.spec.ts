// Item 1b: the Storyline page (build it if the bed allows) + the Explain pack.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lag2/shots";
const NAME = "LagStamp Probe B";
test.describe.configure({ retries: 0, timeout: 2_400_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";

test("storyline + explain read the settled schedule", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.frame;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 150_000 });
  await page.waitForTimeout(3000);
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first().click();
  await page.waitForTimeout(14000);
  const R: any = {};

  // ---- EXPLAIN first (Gantt is the default view)
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  const eb = frame.locator('[data-testid="plan-explain-btn"]');
  R.explainBtn = await eb.count();
  if (R.explainBtn) {
    await eb.first().dispatchEvent("click");
    await page.waitForTimeout(30000);
  }
  const modal = frame.locator('[data-testid="plan-explain-modal"]').first();
  R.explainModal = await modal.count();
  R.explain = (await txt(modal)).replace(/\n/g, " | ").slice(0, 2500);
  console.log("EXPLAIN-BTN", R.explainBtn, "MODAL", R.explainModal);
  console.log("EXPLAIN:", R.explain);
  await page.screenshot({ path: `${OUT}/c01-explain.png` });
  await frame.getByRole("button", { name: /^(Close|Done|Cancel)$/ }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(2000);

  // ---- STORYLINE
  await frame.locator('[data-testid="view-tab-storyline"]').first().click().catch(async () => {
    await frame.getByRole("button", { name: /^Storyline$/i }).first().click();
  });
  await page.waitForTimeout(14000);
  R.emptyCopy = (await txt(frame.locator('[data-testid="storyline-empty"]'))).replace(/\n/g, " | ");
  console.log("STORYLINE EMPTY COPY:", R.emptyCopy);
  await page.screenshot({ path: `${OUT}/c02-storyline-empty.png` });

  const build = frame.getByRole("button", { name: /Build the storyline/i });
  R.buildBtns = await build.count();
  console.log("BUILD BUTTONS", R.buildBtns, JSON.stringify(await build.allInnerTexts().catch(() => [])));
  if (R.buildBtns) {
    await build.first().click({ force: true });
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(6000);
      if (await frame.locator('[data-testid="storyline-block"]').count()) break;
    }
    await page.waitForTimeout(5000);
  }
  R.after = {
    empty: await frame.locator('[data-testid="storyline-empty"]').count(),
    blocks: await frame.locator('[data-testid="storyline-block"]').count(),
    about: (await txt(frame.locator('[data-testid="storyline-about"]'))).replace(/\n/g, " | ").slice(0, 800),
    lede: (await txt(frame.locator(".lz-sl-lede").first())).replace(/\n/g, " | "),
    ruler: (await txt(frame.locator('[data-testid="storyline-ruler"]').first())).replace(/\n/g, " | "),
    verdict: await txt(frame.locator('[data-testid="storyline-verdict"]')),
    degraded: (await txt(frame.locator('[data-testid="storyline-degraded"]'))).replace(/\n/g, " | "),
  };
  const body = await txt(frame.locator("body"));
  R.bodyHas = { d1030: /2026-10-30|Oct 30/.test(body), d1023: /2026-10-23|Oct 23/.test(body), d1026: /2026-10-26|Oct 26/.test(body) };
  console.log("STORYLINE AFTER", JSON.stringify(R.after, null, 1));
  console.log("BODY HAS", JSON.stringify(R.bodyHas));
  await page.screenshot({ path: `${OUT}/c03-storyline.png`, fullPage: false });
  fs.writeFileSync(`${OUT}/c-results.json`, JSON.stringify(R, null, 2));
  expect(1).toBe(1);
});
