// LIVE CHECK dev 6.74.0 — item 3: the plan CARD's verdict word vs the STORYLINE
// tab's plan word, on the same plan, at the same minute.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lc6740";
fs.mkdirSync(OUT, { recursive: true });
const bed = JSON.parse(fs.readFileSync("/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6730/bed.json", "utf8"));
const TAG = process.env.LC_TAG || "A";
test.describe.configure({ retries: 0, timeout: 1_800_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";
const body = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";

test("card word == storyline plan word", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  if (s.kind !== "custom") throw new Error("no custom frame");
  const frame = s.frame;
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForTimeout(4000);

  // EVERY card on the page, with its verdict chip — so nothing is taken on trust.
  const cards = await frame.locator('[data-testid="plan-card"]').all();
  const table: any[] = [];
  for (const c of cards) {
    const name = await txt(c.locator('[data-testid="plan-card-name"]'));
    const chip = c.locator('[data-testid="plan-verdict-chip"]');
    table.push({ name, chip: (await chip.count()) ? await txt(chip) : "(no chip)" });
  }
  console.log("CARDS:", JSON.stringify(table, null, 1));
  fs.writeFileSync(`${OUT}/${TAG}-cards.json`, JSON.stringify(table, null, 1));
  await page.screenshot({ path: `${OUT}/${TAG}-plans-page.png`, fullPage: true });

  const mine = table.find((r) => r.name.includes(bed.planName.replace("[harness-test] ", "")));
  console.log("SEEDED PLAN CARD WORD:", JSON.stringify(mine));

  const card = frame.locator('[data-testid="plan-card"]').filter({ hasText: bed.planName }).first();
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${OUT}/${TAG}-card.png`, fullPage: true });
  await card.click();
  await page.waitForTimeout(8000);
  if (!/Gantt/i.test(await body(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  await frame.locator('[data-testid="view-tab-storyline"]').first().click();
  const view = frame.locator('[data-testid="storyline-view"]');
  await view.waitFor({ state: "visible", timeout: 300_000 });
  await page.waitForTimeout(4000);
  const about = frame.locator('[data-testid="about-verdict"]').first();
  await about.waitFor({ state: "visible", timeout: 60_000 });
  const aboutText = await txt(about);
  const rung = await about.getAttribute("data-rung");
  const stampRung = await about.getAttribute("data-stamp-rung");
  const word = await txt(about.locator("b").first());
  console.log(`STORYLINE PLAN WORD: word=${JSON.stringify(word)} rung=${rung} stampRung=${stampRung}`);
  console.log("ABOUT LEAD:", aboutText.replace(/\n/g, " | "));
  fs.writeFileSync(`${OUT}/${TAG}-storyline.json`, JSON.stringify({ card: mine, word, rung, stampRung, aboutText, allCards: table }, null, 1));
  fs.writeFileSync(`${OUT}/${TAG}-storyline-page.txt`, await txt(view));
  await page.screenshot({ path: `${OUT}/${TAG}-storyline-top.png`, fullPage: false });
  await page.screenshot({ path: `${OUT}/${TAG}-storyline-full.png`, fullPage: true });
  expect(word.trim().toLowerCase()).toBe(String(mine?.chip || "").trim().toLowerCase());
});
