// ROUND-3 lane B on bed 2: item 1 (uniform vs named hold-up, page + report),
// item 6a ("1 shorter run ... holds N"), item 3 (notes read the HOLD-UP's comments).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6730";
const bed = JSON.parse(fs.readFileSync(`${OUT}/bed2.json`, "utf8"));
test.describe.configure({ retries: 0, timeout: 2_400_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";
const body = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";

async function surface(page: any, w = 1600, h = 1300) {
  await page.setViewportSize({ width: w, height: h });
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
async function storyline(frame: any, page: any) {
  await frame.locator('[data-testid="view-tab-storyline"]').first().click();
  await page.waitForTimeout(4000);
  const cta = frame.locator('[data-testid="storyline-build-cta"]').or(frame.locator('[data-testid="storyline-rebuild"]'));
  if (await cta.count()) {
    await cta.first().click();
    await page.waitForTimeout(1500);
    const conf = frame.locator('[data-testid="confirm-dialog"], [role="dialog"]').first();
    if (await conf.count()) await conf.getByRole("button", { name: /Rebuild|Build|Continue|Yes/i }).first().click().catch(() => {});
    for (let i = 0; i < 200; i++) {
      const bar = await txt(frame.locator('[data-testid="storyline-build"]'));
      if (!/Building|Reading|Working|Thinking/i.test(bar) && await frame.locator('[data-testid="storyline-view"]').count()) break;
      await page.waitForTimeout(3000);
    }
  }
  await frame.locator('[data-testid="storyline-view"]').waitFor({ state: "visible", timeout: 300_000 });
  await page.waitForTimeout(5000);
}

test("B1 build, then read every storyline line, every beat card and the shorter-runs line", async ({ page }) => {
  const frame = await surface(page);
  await openPlan(frame, page);
  await storyline(frame, page);
  const view = frame.locator('[data-testid="storyline-view"]');
  const pageText = await txt(view);
  fs.writeFileSync(`${OUT}/B1-storyline.txt`, pageText);
  console.log("=== STORYLINE PAGE ===\n" + pageText);
  await page.screenshot({ path: `${OUT}/B1-storyline-full.png`, fullPage: true });
  const blocks = await frame.locator('[data-testid="storyline-block"]').all();
  console.log("BLOCKS:", blocks.length);
  const acc: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const v = blocks[i].locator('[data-testid="storyline-verdict"]');
    console.log(`BLOCK ${i} rung=${await v.getAttribute("data-rung").catch(() => null)}\n  verdict: ${await txt(v)}`);
    const facts = await blocks[i].locator('[data-testid="beat-facts"]').allInnerTexts();
    facts.forEach((f, j) => console.log(`   beat-facts[${j}]: ${f.replace(/\n/g, " ")}`));
    acc.push(`BLOCK ${i}\nverdict=${await txt(v)}\nfacts=${facts.join(" // ")}`);
  }
  const bars = await frame.locator('[data-testid="storyline-beat"]').all();
  console.log("BEAT BARS:", bars.length);
  for (let i = 0; i < bars.length; i++) {
    await bars[i].click(); await page.waitForTimeout(1300);
    const c = frame.locator('[data-testid="beat-card"]').first();
    await c.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
    const v = c.locator('[data-testid="beat-verdict"]');
    const line = await txt(v);
    console.log(`--- BEAT ${i} rung=${await v.getAttribute("data-rung").catch(() => null)}\n  verdict: ${line.replace(/\n/g, " ")}\n  card: ${(await txt(c)).replace(/\n/g, " | ").slice(0, 900)}`);
    acc.push(`BEAT ${i}\nverdict=${line}\n${await txt(c)}`);
    await page.screenshot({ path: `${OUT}/B1-beat-${i}.png` });
    await bars[i].click(); await page.waitForTimeout(400);
  }
  fs.writeFileSync(`${OUT}/B1-lines.txt`, acc.join("\n\n---\n\n"));
  const runs = pageText.match(/\d+ shorter runs? of linked work \w+ [^.]*\./);
  console.log("SHORTER RUNS LINE:", runs ? runs[0] : "(absent)");
  fs.writeFileSync(`${OUT}/B1-runs.txt`, runs ? runs[0] : "(absent)");
  expect(blocks.length).toBeGreaterThanOrEqual(1);
});
