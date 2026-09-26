// Item 4: the simulation plan's card verdict on the Plans page (light + dark).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lagbed";
test.describe.configure({ retries: 0, timeout: 1_200_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";

test("simulation card verdict", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.frame;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForTimeout(3000);
  const sim = frame.locator('[data-testid="plan-card"]').filter({ hasText: "LagStamp WhatIf" }).first();
  await sim.scrollIntoViewIfNeeded();
  const facts = {
    text: (await txt(sim)).replace(/\n/g, " | "),
    finish: await txt(sim.locator('[data-testid="plan-finish"]')),
    room: await txt(sim.locator('[data-testid="plan-room"]')),
    verdict: await txt(sim.locator('[data-testid="plan-verdict-chip"]')),
    punchline: await txt(sim.locator('[data-testid="plan-punchline"]')),
    simBadge: await txt(sim.locator('[data-testid="plan-card-simulation"]')),
  };
  console.log("SIM CARD:", JSON.stringify(facts, null, 2));
  fs.writeFileSync(`${OUT}/ui-sim-card.json`, JSON.stringify(facts, null, 2));
  await sim.screenshot({ path: `${OUT}/light-11-sim-card.png` });
  await page.screenshot({ path: `${OUT}/light-12-plans-with-sim.png` });
  // dark
  const h = await frame.locator(":root").elementHandle();
  const f = await h!.ownerFrame();
  await f!.evaluate(() => { document.documentElement.setAttribute("data-color-mode", "dark"); document.documentElement.setAttribute("data-theme", "dark"); });
  await page.waitForTimeout(1500);
  await sim.screenshot({ path: `${OUT}/dark-11-sim-card.png` });
  await page.screenshot({ path: `${OUT}/dark-12-plans-with-sim.png` });
  expect(facts.verdict).not.toMatch(/not measured/i);
});
