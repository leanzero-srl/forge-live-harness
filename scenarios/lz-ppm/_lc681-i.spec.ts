// LIVE CHECK dev 6.81.0 — ITEM 4 "AFTER" (grown plan must offer a rebuild) and
// ITEM 7 (derived-chip density on the 18-issue plan).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/shots";
const NAME = "Chain Growth Bed";
test.describe.configure({ retries: 1, timeout: 2_400_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";

test("item 4 after growth + item 7 density", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.frame;
  const f: any = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 150_000 });
  await page.waitForTimeout(3000);
  const R: any = {};
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first().click();
  await page.waitForTimeout(18000);

  // ---------- ITEM 4 AFTER ----------
  await frame.locator('[data-testid="view-tab-storyline"]').first().click().catch(async () => {
    await frame.getByRole("button", { name: /^Storyline$/i }).first().click();
  });
  await page.waitForTimeout(20000);
  R.storylineAfter = {
    emptyCount: await frame.locator('[data-testid="storyline-empty"]').count(),
    empty: (await txt(frame.locator('[data-testid="storyline-empty"]'))).replace(/\n/g, " | "),
    buildBtns: await frame.locator("button").filter({ hasText: /Build the storyline|Build it again|Build AI structure|Rebuild/i }).allInnerTexts().catch(() => []),
    staleChip: /stale|older build|out of date/i.test(await txt(frame.locator("body"))),
    body: (await txt(frame.locator("body"))).replace(/\s+/g, " ").slice(0, 1500),
  };
  console.log("STORYLINE AFTER", JSON.stringify(R.storylineAfter, null, 1));
  await page.screenshot({ path: `${OUT}/i01-storyline-after.png` });

  // ---------- ITEM 7 ----------
  await frame.getByRole("button", { name: /^Table$/i }).first().click().catch(() => {});
  await page.waitForTimeout(9000);
  R.table = [];
  for (const r of await frame.locator('[data-testid="table-row"]').all()) {
    R.table.push({
      key: await r.getAttribute("data-row-key"), start: await r.getAttribute("data-row-start"),
      due: await r.getAttribute("data-row-due"), derived: await r.getAttribute("data-row-derived"),
      chip: await r.locator('[data-testid="table-derived-chip"]').count(),
    });
  }
  R.derivedCount = R.table.filter((x: any) => x.derived === "1").length;
  R.chipCount = await frame.locator('[data-testid="table-derived-chip"]').count();
  R.keyCellWidths = await f.evaluate(() => [...document.querySelectorAll('[data-testid="table-row"]')].map((r: any) => {
    const cell = r.children[1];
    const sp = [...cell.querySelectorAll("span")].find((x: any) => /^WFH-\d+$/.test((x.textContent || "").trim()));
    return { k: r.getAttribute("data-row-key"), der: r.getAttribute("data-row-derived"), keyW: sp ? Math.round(sp.getBoundingClientRect().width) : null };
  }));
  console.log("TABLE 18", JSON.stringify(R.table, null, 1));
  console.log("DERIVED COUNT", R.derivedCount, "CHIPS", R.chipCount);
  console.log("KEY CELL WIDTHS", JSON.stringify(R.keyCellWidths));
  await page.screenshot({ path: `${OUT}/i02-table-18.png`, fullPage: false });

  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(9000);
  R.ganttChips = await frame.locator('[data-testid="gantt-derived-chip"]').count();
  R.ganttCaps = await frame.locator('[data-testid="gantt-derived-cap"]').count();
  console.log("GANTT CHIPS", R.ganttChips, "CAPS", R.ganttCaps);
  await page.screenshot({ path: `${OUT}/i03-gantt-18.png` });

  const body = (await txt(frame.locator("body"))).replace(/\s+/g, " ");
  R.finalStaged = /Apply\s+\d+\s+change|Save\s*\(\d+\)/.test(body);
  console.log("STAGED_AFTER_CLEANUP =", R.finalStaged);
  fs.writeFileSync(`${OUT}/i-results.json`, JSON.stringify(R, null, 2));
  expect(R.table.length).toBe(18);
});
