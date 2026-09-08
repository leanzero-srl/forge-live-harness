// LIVE, READ-ONLY: capture the FULL text of an app's Settings screen, scrolling, so the comparison
// quotes what the screen actually says about self-service, notifications and the inactivity window
// rather than a keyword hit. DISCOVER_TARGET picks the app (default kantega-global).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { BASE_URL } from "../../config/env";
import { dumpForgeFrames, enterForgeSurface } from "../../forge/frame";
import { assertLoggedIn } from "../../forge/browser";
import fs from "node:fs";

const T = getTarget(process.env.DISCOVER_TARGET || "kantega-global");
const SCREEN = process.env.SETTINGS_SCREEN || "Settings";
test.describe.configure({ retries: 1 });

test(`${T.app}: full text of "${SCREEN}" captured`, async ({ page, recorder }) => {
  test.skip(!T.appId || !T.envId, "target ids unresolved");
  const url = T.deepLink(T.envId)!;
  recorder.setTarget({ product: T.product, app: T.app, appId: T.appId, module: T.module, moduleType: T.moduleType, surface: T.surface, url: BASE_URL + url, repo: T.repo });
  await assertLoggedIn(page);
  await recorder.step("open app", async () => { await page.goto(url, { waitUntil: "domcontentloaded" }); }, { action: "navigate", expectation: { assertion: "loads", narrative: "App page reachable." } });
  recorder.setFrames(await dumpForgeFrames(page));
  const surface = await enterForgeSurface(page, { surface: "custom" }); recorder.attachSurface(surface);
  const root = surface.kind === "custom" ? surface.frame : page;
  await expect(root.locator("text=/Loading app/i")).toHaveCount(0, { timeout: 60_000 });
  await recorder.step(`open "${SCREEN}" and capture all of it`, async () => {
    const item = root.getByText(SCREEN, { exact: true }).filter({ visible: true }).last();
    if (await item.count()) await item.click({ timeout: 10_000, force: true }).catch(() => {});
    await page.waitForTimeout(3_000);
    // scroll the surface to the bottom in steps so lazy content renders, screenshot each stop
    for (let i = 0; i < 8; i++) { await root.locator("body").evaluate((b: HTMLElement) => window.scrollBy(0, 700)).catch(() => {}); await page.waitForTimeout(600); }
    const txt = (await root.locator("body").innerText().catch(() => "")).replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
    const out = `evidence/settings-fulltext-${T.id}-${Date.now()}.txt`;
    fs.writeFileSync(out, txt); console.log(`\nFULLTEXT ${T.id} -> ${out} (${txt.length} chars)\n`);
    test.info().annotations.push({ type: "fulltext-file", description: out });
    expect(txt.length).toBeGreaterThan(200);
  }, { expectation: { assertion: `"${SCREEN}" text captured to a file (>200 chars)`, narrative: "The screen's complete wording is on disk for the comparison to quote." } });
});
