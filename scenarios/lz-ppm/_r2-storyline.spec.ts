// ROUND-2 item 3: the Storyline page on the seeded three-chain plan, BUILT from
// the Storyline tab (one real model call).
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

async function surface(page: any) {
  await page.setViewportSize({ width: 1600, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  if (s.kind !== "custom") throw new Error("no custom frame");
  await page.waitForTimeout(4000);
  return s.frame;
}
async function openPlan(frame: any, page: any) {
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: bed.planName }).first().click();
  await page.waitForTimeout(7000);
  if (!/Gantt/i.test(await body(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
}

test("S1 build the storyline from the tab and read every line", async ({ page }) => {
  const frame = await surface(page);
  await openPlan(frame, page);
  await frame.locator('[data-testid="view-tab-storyline"]').first().click();
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${OUT}/S1-storyline-empty.png`, fullPage: true });
  const cta = frame.locator('[data-testid="storyline-build-cta"]').or(frame.locator('[data-testid="storyline-rebuild"]'));
  if (await cta.count()) {
    console.log("BUILD BAR:", await txt(frame.locator('[data-testid="storyline-build"]')));
    await cta.first().click();
    await page.waitForTimeout(1500);
    const conf = frame.locator('[data-testid="confirm-dialog"], [role="dialog"]').first();
    if (await conf.count()) {
      console.log("CONFIRM:", (await txt(conf)).replace(/\n/g, " | "));
      await conf.getByRole("button", { name: /Rebuild|Build|Continue|Yes/i }).first().click().catch(() => {});
    }
    for (let i = 0; i < 160; i++) {
      const bar = await txt(frame.locator('[data-testid="storyline-build"]'));
      if (!/Building|Reading|Working|Thinking/i.test(bar) && await frame.locator('[data-testid="storyline-view"]').count()) break;
      await page.waitForTimeout(3000);
    }
  }
  await page.waitForTimeout(6000);
  const view = frame.locator('[data-testid="storyline-view"]');
  await view.waitFor({ state: "visible", timeout: 300_000 });
  const pageText = await txt(view);
  fs.writeFileSync(`${OUT}/S1-storyline.txt`, pageText);
  console.log("=== STORYLINE PAGE ===\n" + pageText);
  await page.screenshot({ path: `${OUT}/S1-storyline-top.png`, fullPage: false });
  await page.screenshot({ path: `${OUT}/S1-storyline-full.png`, fullPage: true });

  // RAW ID LEAK across the WHOLE frame body
  const all = await body(frame);
  fs.writeFileSync(`${OUT}/S1-body.txt`, all);
  const leaks = all.match(/\b(?:ch|bt|sg|s\d+):[0-9a-f]{4,}/g) || [];
  console.log("ID LEAKS ON PAGE:", JSON.stringify(leaks));

  // blocks, verdict lines, badges
  const blocks = await frame.locator('[data-testid="storyline-block"]').all();
  console.log("BLOCKS:", blocks.length);
  const lines: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const v = blocks[i].locator('[data-testid="storyline-verdict"]');
    const rung = await v.getAttribute("data-rung").catch(() => null);
    const vt = await txt(v);
    const badges = await blocks[i].locator('[data-testid="storyline-badge"]').evaluateAll((els: any[]) =>
      els.map((e) => `${e.getAttribute("data-kind")}=${e.textContent}`));
    console.log(`BLOCK ${i} rung=${rung}\n  verdict: ${vt}\n  badges: ${badges.join(" | ")}`);
    lines.push(`BLOCK ${i} rung=${rung}\nverdict=${vt}\nbadges=${badges.join(" | ")}\n${await txt(blocks[i])}`);
    const facts = await blocks[i].locator('[data-testid="beat-facts"]').allInnerTexts();
    facts.forEach((f, j) => console.log(`  beat-facts[${j}]: ${f.replace(/\n/g, " ")}`));
    lines.push("FACTS:\n" + facts.join("\n"));
  }
  fs.writeFileSync(`${OUT}/S1-blocks.txt`, lines.join("\n\n---\n\n"));

  // every beat card
  const slots = await frame.locator('[data-testid="storyline-beat-slot"]').all();
  console.log("BEAT SLOTS:", slots.length);
  const cards: string[] = [];
  for (let i = 0; i < slots.length; i++) {
    await slots[i].click().catch(() => {});
    await page.waitForTimeout(1400);
    const c = frame.locator('[data-testid="beat-card"]').first();
    const t = await txt(c);
    const rung = await c.locator('[data-testid="beat-verdict"]').getAttribute("data-rung").catch(() => null);
    const hasRoom = await c.locator('[data-testid="beat-stat-room"]').count();
    const hasWhatIf = await c.locator('[data-testid="beat-whatif"]').count();
    const hasNotes = await c.locator('[data-testid="beat-notes"]').count();
    console.log(`--- BEAT ${i} rung=${rung} room=${hasRoom} whatif=${hasWhatIf} notes=${hasNotes}\n${t}`);
    cards.push(`BEAT ${i} rung=${rung} roomStat=${hasRoom} whatIf=${hasWhatIf} notes=${hasNotes}\n${t}`);
    await page.screenshot({ path: `${OUT}/S1-beat-${i}.png` });
  }
  fs.writeFileSync(`${OUT}/S1-beatcards.txt`, cards.join("\n\n---\n\n"));
  expect(blocks.length).toBeGreaterThanOrEqual(2);
});

test("S2 explain strip labels on the seeded plan", async ({ page }) => {
  const frame = await surface(page);
  await openPlan(frame, page);
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  await frame.getByRole("button", { name: /Explain this plan/i }).first().click({ timeout: 30_000 });
  for (let i = 0; i < 60; i++) {
    if (await frame.locator('[data-testid="explain-facts-strip"]').count()) break;
    await page.waitForTimeout(2500);
  }
  await page.waitForTimeout(2000);
  const strip = frame.locator('[data-testid="explain-facts-strip"]');
  const cells = await strip.locator("[data-fact]").evaluateAll((els: any[]) =>
    els.map((e) => ({ fact: e.getAttribute("data-fact"), value: e.textContent, label: e.parentElement?.firstElementChild?.textContent })));
  console.log("STRIP:", JSON.stringify(cells));
  console.log("STRIP TEXT:", (await txt(strip)).replace(/\n/g, " | "));
  const badge = frame.locator('[data-testid="explain-verdict"]').first();
  console.log("EXPLAIN badge:", await txt(badge), await badge.getAttribute("data-verdict").catch(() => null));
  fs.writeFileSync(`${OUT}/S2-explain.txt`, `${JSON.stringify(cells, null, 1)}\n\n${await txt(frame.locator('[data-testid="plan-explain-modal"]'))}\n`);
  await page.screenshot({ path: `${OUT}/S2-explain.png`, fullPage: true });
  expect(cells.length).toBeGreaterThan(0);
});
