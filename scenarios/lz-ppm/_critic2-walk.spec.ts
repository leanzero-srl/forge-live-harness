// PM-CRITIC round 2 live walk. READ-ONLY on the UI: screenshots + text dumps.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/critic2";
const st = JSON.parse(fs.readFileSync(`${SHOT}/bed.json`, "utf8"));
test.describe.configure({ retries: 0, timeout: 1_800_000, mode: "serial" });
const bodyText = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";
const dump = (name: string, s: string) => fs.writeFileSync(`${SHOT}/${name}.txt`, s);

async function open(page: any) {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(3000);
  return frame;
}

test("W1 Plans page cards + portfolio", async ({ page }) => {
  const frame = await open(page);
  await page.screenshot({ path: `${SHOT}/shots/01-plans.png`, fullPage: false });
  dump("01-plans", await bodyText(frame));
  // the seeded plan's card, verbatim
  const cards = await frame.locator('[data-testid="plan-card"]').all().catch(() => []);
  const out: string[] = [];
  for (const c of cards) out.push((await c.innerText()).replace(/\n/g, " | "));
  dump("01-cards", out.join("\n"));
  console.log("CARDS:\n" + out.join("\n"));
  await page.screenshot({ path: `${SHOT}/shots/01b-plans-full.png`, fullPage: true });
});

test("W2 Storyline page on the three-chain bed", async ({ page }) => {
  const frame = await open(page);
  await frame.getByText(st.planName, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${SHOT}/shots/10-gantt.png` });
  dump("10-gantt", await bodyText(frame));
  await frame.locator('[data-testid="view-tab-storyline"]').first().click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${SHOT}/shots/11-storyline-top.png` });
  const view = frame.locator('[data-testid="storyline-view"]');
  const txt = await view.innerText().catch(() => "(no view)");
  dump("11-storyline", txt);
  console.log("STORYLINE PAGE:\n" + txt);
  console.log("ABOUT:", (await frame.locator('[data-testid="storyline-about"]').innerText().catch(() => "(none)")));
  const badges = await frame.locator('[data-testid="storyline-badge"]').all();
  for (const b of badges) console.log("BADGE", await b.getAttribute("data-kind"), "=", (await b.innerText()).replace(/\n/g, " "));
  await page.screenshot({ path: `${SHOT}/shots/11b-storyline-full.png`, fullPage: true });
  // open the first beat of the SECOND (mixed) storyline
  const blocks = await frame.locator('[data-testid="storyline-block"]').all();
  console.log("BLOCKS", blocks.length);
  for (let i = 0; i < blocks.length; i++) dump(`12-block${i}`, await blocks[i].innerText());
  const slots = await blocks[1].locator('[data-testid="storyline-beat-slot"]').all();
  await slots[0].click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOT}/shots/13-beatcard-mixed.png` });
  dump("13-beatcard-mixed", await frame.locator('[data-testid="beat-card"]').first().innerText().catch(() => "(none)"));
  console.log("MIXED BEAT CARD:\n" + (await frame.locator('[data-testid="beat-card"]').first().innerText().catch(() => "")));
  // and a beat of the FIRST (named) storyline
  const slotsA = await blocks[0].locator('[data-testid="storyline-beat-slot"]').all();
  await slotsA[1].click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOT}/shots/14-beatcard-named.png` });
  dump("14-beatcard-named", await frame.locator('[data-testid="beat-card"]').first().innerText().catch(() => "(none)"));
  expect(txt.length).toBeGreaterThan(50);
});

test("W3 Dashboard punchline + Capacity tab + Explain", async ({ page }) => {
  const frame = await open(page);
  await frame.getByText(st.planName, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  // Dashboard
  for (const name of ["Dashboard"]) {
    await frame.getByRole("button", { name: new RegExp(`^${name}$`, "i") }).first().click().catch(() => {});
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${SHOT}/shots/20-dashboard.png`, fullPage: true });
    dump("20-dashboard", await bodyText(frame));
  }
  // Capacity
  const cap = frame.getByRole("button", { name: /^Capacity$/i }).first();
  if (await cap.count()) { await cap.click(); await page.waitForTimeout(6000); }
  await page.screenshot({ path: `${SHOT}/shots/21-capacity.png`, fullPage: true });
  dump("21-capacity", await bodyText(frame));
  console.log("CAPACITY:\n" + (await bodyText(frame)).slice(0, 4000));
  // Explain
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  const ex = frame.getByRole("button", { name: /Explain this plan/i }).first();
  if (await ex.count()) {
    await ex.click();
    for (let i = 0; i < 40; i++) { if (!/Thinking|Reading the plan/i.test(await bodyText(frame))) break; await page.waitForTimeout(2000); }
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SHOT}/shots/22-explain.png`, fullPage: true });
    dump("22-explain", await bodyText(frame));
    console.log("EXPLAIN:\n" + (await bodyText(frame)).slice(0, 4000));
  } else console.log("NO EXPLAIN BUTTON");
});
