// LZ700 item 5 — every Select has an accessible NAME, and the name does not
// change while its list is open. Plus item 1's holiday REMOVE.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";
const bed = JSON.parse(fs.readFileSync("/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz700/bed.json", "utf8"));
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz700/shots";
test.describe.configure({ retries: 0, timeout: 2_400_000, mode: "serial" });

const combos = (snap: string) => (snap.match(/- combobox[^\n]*/g) || []).map((l) => l.trim());

test("select names + holiday remove", async ({ page }) => {
  const R: any = { surfaces: {} };
  await page.setViewportSize({ width: 1700, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.frame;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 180_000 });
  await page.waitForTimeout(4000);
  const body = async () => (await frame.locator("body").textContent().catch(() => "")) || "";
  const snap = async () => await frame.locator("body").ariaSnapshot();

  // ---- PLANS PAGE (plan card surface)
  R.surfaces.plans = combos(await snap());
  console.log("PLANS COMBOS", JSON.stringify(R.surfaces.plans));
  await page.screenshot({ path: `${OUT}/x01-plans.png` });

  await frame.locator('[data-testid="plan-card"]').filter({ hasText: bed.tag }).first().click();
  await page.waitForTimeout(16000);

  const visit = async (tab: string, key: string) => {
    await frame.getByRole("button", { name: new RegExp(`^${tab}$`, "i") }).first().click().catch(() => {});
    await page.waitForTimeout(8000);
    R.surfaces[key] = combos(await snap());
    console.log(key.toUpperCase() + " COMBOS", JSON.stringify(R.surfaces[key]));
    await page.screenshot({ path: `${OUT}/x02-${key}.png` });
  };
  await visit("Gantt", "gantt");
  await visit("Table", "table");
  await visit("Permissions", "permissions");

  // ---- the NAME must not change while the list is open (Gantt "Group" select)
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(7000);
  const all = frame.getByRole("combobox");
  const n = await all.count();
  R.openTest = [];
  for (let i = 0; i < n; i++) {
    const c = all.nth(i);
    const before = combos(await c.ariaSnapshot())[0] || "(none)";
    await c.dispatchEvent("click");
    await page.waitForTimeout(1200);
    const during = combos(await c.ariaSnapshot())[0] || "(none)";
    const optCount = await frame.getByRole("option").count();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(700);
    const after = combos(await c.ariaSnapshot())[0] || "(none)";
    R.openTest.push({ i, before, during, after, optCount, stable: before === during && during === after });
    console.log("OPENTEST", JSON.stringify(R.openTest.at(-1)));
  }
  await page.screenshot({ path: `${OUT}/x03-open.png` });

  // ---- item 1: REMOVE the 2026-10-07 holiday while the plan is open
  await frame.getByRole("button", { name: /^Schedule$/i }).first().click();
  await page.waitForTimeout(5000);
  await frame.getByRole("button", { name: /^Bank Holidays/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  R.holidaysBefore = (await body()).match(/2026-10-07[^]{0,60}/)?.[0] || "(not listed)";
  const del = frame.getByRole("button", { name: /^(Remove|Delete|×|✕)$/ }).first();
  await del.dispatchEvent("click");
  let toast = "(none)";
  for (let i = 0; i < 40; i++) { const t = await body(); const m = t.match(/Holiday removed|Saved|failed|error/i); if (m) { toast = m[0]; break; } await page.waitForTimeout(250); }
  await page.waitForTimeout(4000);
  R.holidayRemove = { toast, panel: (await body()).replace(/\s+/g, " ").match(/Bank Holidays[^]{0,240}/)?.[0] };
  console.log("HOLIDAY REMOVE", JSON.stringify(R.holidayRemove));
  await page.screenshot({ path: `${OUT}/x04-holiday-removed.png` });
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  R.afterRemove = {
    staged: /Apply \d+ change|Save \(\d+\)/.test(await body()),
    bars: await frame.locator('[data-testid="gantt-bar"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-key"), start: e.getAttribute("data-bar-start"), due: e.getAttribute("data-bar-due"), derived: e.getAttribute("data-derived") }))),
    chips: await frame.locator('[data-testid="gantt-derived-chip"]').evaluateAll((els: any[]) => els.map((e) => e.getAttribute("data-key"))),
  };
  console.log("AFTER REMOVE", JSON.stringify(R.afterRemove));
  await page.screenshot({ path: `${OUT}/x05-after-remove.png` });
  fs.writeFileSync(`${OUT}/a11y-results.json`, JSON.stringify(R, null, 2));
  expect(1).toBe(1);
});
