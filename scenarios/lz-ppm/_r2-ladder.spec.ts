// ROUND-2 item 1: ONE LADDER on LZPT. Read-only on LZPT except a temporary
// portfolio (created, read, removed in the same spec).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6720";
const PLAN = "LZPT Scenarios";
const PLAN_ID = "plan-msq9dg8l-gz6mz1";
const PF_NAME = "[harness-test] r2 ladder";
test.describe.configure({ retries: 0, timeout: 1_800_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";
const body = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";

async function surface(page: any) {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  if (s.kind !== "custom") throw new Error("no custom frame");
  await page.waitForTimeout(4000);
  return s.frame;
}
async function openPlan(frame: any, page: any) {
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  if (!/Gantt/i.test(await body(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
}

test("L1 plan card chip + punchline", async ({ page }) => {
  const frame = await surface(page);
  const card = frame.locator('[data-testid="plan-card"]').filter({ hasText: PLAN }).first();
  await card.waitFor({ state: "visible", timeout: 90_000 });
  await card.scrollIntoViewIfNeeded();
  const chip = await txt(card.locator('[data-testid="plan-verdict-chip"]'));
  const full = (await txt(card)).replace(/\n/g, " | ");
  console.log("CARD CHIP:", chip);
  console.log("CARD TEXT:", full);
  fs.writeFileSync(`${OUT}/L1-card.txt`, `CHIP=${chip}\nTEXT=${full}\n`);
  await page.screenshot({ path: `${OUT}/L1-plans.png`, fullPage: true });
  expect(chip).toBe("Late");
});

test("L2 dashboard hero", async ({ page }) => {
  const frame = await surface(page);
  await openPlan(frame, page);
  await frame.getByRole("button", { name: /^Dashboard$/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  const hero = frame.locator('[data-testid="plan-health"]');
  await hero.waitFor({ state: "visible", timeout: 90_000 });
  const word = await txt(frame.locator('[data-testid="plan-health-verdict"]'));
  const punch = await txt(frame.locator('[data-testid="plan-health-punchline"]'));
  const dv = await hero.getAttribute("data-verdict");
  console.log("HERO data-verdict:", dv, "| WORD:", word);
  console.log("HERO PUNCHLINE:", punch);
  console.log("HERO SUB:", (await txt(hero)).replace(/\n/g, " | "));
  fs.writeFileSync(`${OUT}/L2-hero.txt`, `verdict=${dv}\nword=${word}\npunchline=${punch}\nhero=${(await txt(hero)).replace(/\n/g, " | ")}\n`);
  await hero.screenshot({ path: `${OUT}/L2-hero.png` }).catch(() => {});
  await page.screenshot({ path: `${OUT}/L2-dashboard.png`, fullPage: true });
  expect(word).toBe("Late");
});

test("L3 explain badge + facts strip", async ({ page }) => {
  const frame = await surface(page);
  await openPlan(frame, page);
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  const ex = frame.getByRole("button", { name: /Explain this plan/i }).first();
  await ex.click({ timeout: 30_000 });
  for (let i = 0; i < 60; i++) {
    if (await frame.locator('[data-testid="explain-verdict"]').count()) break;
    await page.waitForTimeout(2500);
  }
  await page.waitForTimeout(2000);
  const v = frame.locator('[data-testid="explain-verdict"]').first();
  const word = await txt(v);
  const dv = await v.getAttribute("data-verdict").catch(() => null);
  console.log("EXPLAIN badge:", word, "data-verdict:", dv);
  const strip = frame.locator('[data-testid="explain-facts-strip"]');
  const cells = await strip.locator("[data-fact]").evaluateAll((els: any[]) =>
    els.map((e) => ({ fact: e.getAttribute("data-fact"), value: e.textContent, label: e.parentElement?.firstElementChild?.textContent })));
  console.log("STRIP:", JSON.stringify(cells, null, 1));
  const modal = await txt(frame.locator('[data-testid="plan-explain-modal"]'));
  fs.writeFileSync(`${OUT}/L3-explain.txt`, `badge=${word} data-verdict=${dv}\nSTRIP=${JSON.stringify(cells)}\n\n${modal}\n`);
  await page.screenshot({ path: `${OUT}/L3-explain.png`, fullPage: true });
  expect(word.length).toBeGreaterThan(0);
});

// item 2: the seeded plan's card, in whatever milestone state the bed is in now.
test("L4 seeded plan card (gate state)", async ({ page }) => {
  const bed = JSON.parse(fs.readFileSync(`${OUT}/bed.json`, "utf8"));
  const label = process.env.R2_LABEL || "unscoped";
  const frame = await surface(page);
  const card = frame.locator('[data-testid="plan-card"]').filter({ hasText: bed.planName }).first();
  await card.waitFor({ state: "visible", timeout: 90_000 });
  await card.scrollIntoViewIfNeeded();
  const chip = await txt(card.locator('[data-testid="plan-verdict-chip"]'));
  const full = (await txt(card)).replace(/\n/g, " | ");
  console.log(`[${label}] CARD CHIP:`, chip);
  console.log(`[${label}] CARD TEXT:`, full);
  fs.writeFileSync(`${OUT}/L4-card-${label}.txt`, `CHIP=${chip}\nTEXT=${full}\n`);
  await card.screenshot({ path: `${OUT}/L4-card-${label}.png` }).catch(() => {});
  await page.screenshot({ path: `${OUT}/L4-plans-${label}.png`, fullPage: true });
  expect(chip.length).toBeGreaterThan(0);
});
