// SCRATCH 6.69.0 — the DECISIVE naming test. The mixed 8-chain's name was carried
// entirely by the "[harness-test] TAG" prefix every seeded summary shares
// (nameSupport ratio 1.00 with the tag, 0.00 without). Strip the prefix from the
// mixed chain ONLY, rebuild, and see whether the mixed chain now falls back
// honestly (named:false / unnameableSegmentName) or invents a name anyway.
// Also reads the beat-bar CUT tooltip off the Storyline page.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { setFields } from "../../data/jira-build.mjs";
import { getTestState } from "../../testhook/client";
import * as fs from "fs";
const T = getTarget("lz-ppm-dashboard");
const SHOT = "/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6690";
const STATE = `${SHOT}/naming-state.json`;
test.describe.configure({ retries: 0, timeout: 900_000, mode: "serial" });
const bodyText = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";

test("HONEST: strip the shared tag from the mixed chain and rebuild", async () => {
  const st = JSON.parse(fs.readFileSync(STATE, "utf8"));
  for (const k of st.B) await setFields(k, { summary: st.summaries[k] });
  console.log("RELABELLED:", st.B.map((k: string) => `${k}="${st.summaries[k]}"`).join(" | "));
  await new Promise((r) => setTimeout(r, 10000));
  const rf: any = await getTestState("lz-ppm", { what: "refreshPlan", planId: st.planId });
  console.log("REFRESH:", JSON.stringify(rf));
  const built: any = await getTestState("lz-ppm", { what: "aiGroup", planId: st.planId, strategy: "chains" });
  console.log("REBUILD:", JSON.stringify({
    strategy: built.strategy?.chosen, partial: built.partial, partialReason: built.partialReason,
    unnamedSegments: built.unnamedSegments, segments: built.segments, repaired: built.repaired,
  }, null, 1));
  const view: any = await getTestState("lz-ppm", { what: "aiView", planId: st.planId });
  fs.writeFileSync(`${SHOT}/aiview-honest.json`, JSON.stringify(view, null, 1));
  for (const s of view.view?.segments || []) console.log("SEG", JSON.stringify({ id: s.id, kind: s.kind, name: s.name, named: s.named, n: s.stats?.n, why: s.why }));
  expect(built.segments.length).toBeGreaterThan(0);
});

test("HONEST-UI: storyline page + the beat cut tooltip", async ({ page }) => {
  const st = JSON.parse(fs.readFileSync(STATE, "utf8"));
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  await page.waitForTimeout(2000);
  await frame.getByText(st.planName, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  await frame.locator('[data-testid="view-tab-storyline"]').first().click();
  await page.waitForTimeout(6000);
  const view = frame.locator('[data-testid="storyline-view"]');
  console.log("PAGE_TEXT_START\n" + ((await view.innerText().catch(() => "")) || "").slice(0, 3500) + "\nPAGE_TEXT_END");
  await page.screenshot({ path: `${SHOT}/i3-2-storyline-honest.png`, fullPage: true });
  // every element carrying a title on the beat track
  const tips = await realFrame!.evaluate(() =>
    [...document.querySelectorAll('[data-testid="storyline-view"] [title]')].map((el) => ({
      testid: el.getAttribute("data-testid"), cls: (el as HTMLElement).className?.toString().slice(0, 60),
      title: el.getAttribute("title"), text: (el as HTMLElement).innerText?.slice(0, 60),
    })));
  console.log("TITLES:", JSON.stringify(tips, null, 1));
  // hover the second beat bar to raise the tooltip element
  const slots = frame.locator('[data-testid="storyline-beat-slot"]');
  const n = await slots.count();
  console.log("BEAT SLOTS:", n);
  for (let i = 0; i < n; i++) {
    const box = await slots.nth(i).boundingBox();
    if (!box) continue;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(1200);
    const tip = await realFrame!.evaluate(() => {
      const el = document.querySelector('[data-testid="lz-tooltip"], [role="tooltip"], .lz-tip, .lz-tooltip') as HTMLElement | null;
      return el ? el.innerText : null;
    });
    console.log(`BEAT${i + 1}_TOOLTIP: ${JSON.stringify(tip)}`);
    if (i === 1) await page.screenshot({ path: `${SHOT}/i3-3-cut-tooltip.png` });
  }
  // and the beat card's "Why it starts here"
  await slots.nth(1).locator("button").first().click({ timeout: 10_000 }).catch(async () => { await slots.nth(1).click(); });
  await page.waitForTimeout(2000);
  console.log("BEAT2_CARD:\n" + ((await frame.locator('[data-testid="beat-card"]').first().innerText().catch(() => "(none)")) || ""));
  await page.screenshot({ path: `${SHOT}/i3-4-beatcard.png` });
  console.log("STAGED:", /Apply \d+ change|Save \(\d+\)/.test(await bodyText(frame)));
  expect(true).toBeTruthy();
});
