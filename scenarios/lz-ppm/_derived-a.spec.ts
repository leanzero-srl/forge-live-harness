// Item 1a: RELOAD on the lagged plan. Enumerate every surface that must read the
// DERIVED settled schedule (10-26/10-30) vs the STORED rows (10-19/10-23).
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

test("derived surfaces on a cold reload", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.frame;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 150_000 });
  await page.waitForTimeout(4000);

  const R: any = {};
  const card = frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first();
  await card.scrollIntoViewIfNeeded();
  R.card = {
    finish: (await txt(card.locator('[data-testid="plan-finish"]'))).replace(/\n/g, " "),
    room: (await txt(card.locator('[data-testid="plan-room"]'))).replace(/\n/g, " "),
    verdict: await txt(card.locator('[data-testid="plan-verdict-chip"]')),
    punchline: await txt(card.locator('[data-testid="plan-punchline"]')),
  };
  console.log("CARD", JSON.stringify(R.card));
  await card.screenshot({ path: `${OUT}/a01-card.png` });
  await page.screenshot({ path: `${OUT}/a02-plans.png` });

  await card.click();
  await page.waitForTimeout(14000);

  // ---- TABLE (stored rows expected)
  await frame.getByRole("button", { name: /^Table$/i }).first().click().catch(() => {});
  await page.waitForTimeout(7000);
  const rows = await frame.locator('[data-testid="table-row"]').all();
  R.table = [];
  for (const r of rows) R.table.push({ key: await r.getAttribute("data-row-key"), start: await r.getAttribute("data-row-start"), due: await r.getAttribute("data-row-due") });
  console.log("TABLE", JSON.stringify(R.table));
  await page.screenshot({ path: `${OUT}/a03-table.png` });

  const bodyT = await txt(frame.locator("body"));
  const save = frame.locator('[data-testid="plan-save-btn"]');
  R.toolbar = {
    saveText: await txt(save),
    saveState: await save.getAttribute("data-save-state").catch(() => null),
    hasChanges: await save.getAttribute("data-has-changes").catch(() => null),
    applyPresent: await frame.locator("button").filter({ hasText: /^Apply \d+ change/ }).count(),
    applyTextSeen: /Apply \d+ change/.test(bodyT),
  };
  console.log("TOOLBAR", JSON.stringify(R.toolbar));

  // ---- GANTT (stored rows expected)
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  const bars = await frame.locator('[data-testid="gantt-bar"]').all();
  R.gantt = [];
  for (const b of bars) R.gantt.push({ key: await b.getAttribute("data-row-key") || await b.getAttribute("data-key"), start: await b.getAttribute("data-bar-start"), due: await b.getAttribute("data-bar-due") });
  console.log("GANTT", JSON.stringify(R.gantt));
  await page.screenshot({ path: `${OUT}/a04-gantt.png` });

  // ---- DASHBOARD (settled expected)
  await frame.getByRole("button", { name: /^Dashboard$/i }).first().click().catch(() => {});
  await page.waitForTimeout(10000);
  const hero = frame.locator('[data-testid="plan-health"]').first();
  R.hero = {
    verdict: await txt(frame.locator('[data-testid="plan-health-verdict"]')),
    punchline: await txt(frame.locator('[data-testid="plan-health-punchline"]')),
    dataVerdict: await hero.getAttribute("data-verdict").catch(() => null),
    dataRoom: await hero.getAttribute("data-room").catch(() => null),
    heroText: (await txt(hero)).replace(/\n/g, " | "),
  };
  R.tiles = await frame.locator('[data-testid="kpi-tile"]').allInnerTexts().catch(() => []);
  console.log("HERO", JSON.stringify(R.hero));
  console.log("TILES", JSON.stringify(R.tiles));
  await page.screenshot({ path: `${OUT}/a05-dashboard.png`, fullPage: false });

  // schedule confidence
  const sc = frame.locator('[data-testid="schedule-confidence"]').first();
  await sc.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(6000);
  R.sc = {
    present: await sc.count(),
    planned: (await txt(frame.locator('[data-testid="sc-planned"]'))).replace(/\n/g, " | "),
    text: (await txt(sc)).replace(/\n/g, " | ").slice(0, 900),
  };
  console.log("SC", JSON.stringify(R.sc));
  await page.screenshot({ path: `${OUT}/a06-schedule-confidence.png` });

  // milestones block on the dashboard
  R.milestoneRows = await frame.locator('[data-testid="milestone-row"]').allInnerTexts().catch(() => []);
  console.log("MILESTONES", JSON.stringify(R.milestoneRows));

  // ---- STORYLINE (settled expected)
  await frame.locator('[data-testid="view-tab-storyline"]').first().click().catch(async () => {
    await frame.getByRole("button", { name: /^Storyline$/i }).first().click();
  });
  await page.waitForTimeout(14000);
  R.storyline = {
    about: (await txt(frame.locator('[data-testid="storyline-about"]'))).replace(/\n/g, " | ").slice(0, 700),
    verdict: await txt(frame.locator('[data-testid="storyline-verdict"]')),
    ruler: (await txt(frame.locator('[data-testid="storyline-ruler"]').first())).replace(/\n/g, " | "),
    lede: (await txt(frame.locator(".lz-sl-lede").first())).replace(/\n/g, " | "),
    empty: await frame.locator('[data-testid="storyline-empty"]').count(),
    storedOnly: await frame.locator('[data-testid="storyline-stored-only"]').count(),
    bodyHas1030: /2026-10-30|30 Oct/.test(await txt(frame.locator("body"))),
  };
  console.log("STORYLINE", JSON.stringify(R.storyline));
  await page.screenshot({ path: `${OUT}/a07-storyline.png`, fullPage: false });

  // ---- EXPLAIN facts
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await frame.locator('[data-testid="plan-explain-btn"]').first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(9000);
  R.explain = (await txt(frame.locator('[data-testid="cascade-explain-modal"]').first())).replace(/\n/g, " | ").slice(0, 1500);
  console.log("EXPLAIN", R.explain);
  await page.screenshot({ path: `${OUT}/a08-explain.png` });
  await frame.getByRole("button", { name: /^(Close|Cancel)$/ }).first().dispatchEvent("click").catch(() => {});

  fs.writeFileSync(`${OUT}/a-results.json`, JSON.stringify(R, null, 2));
  expect(R.table.length).toBe(3);
});
