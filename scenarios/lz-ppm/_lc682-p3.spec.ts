// RETEST dev 6.82.0 — ITEM 2 (the Table's key column keeps the key; the derived mark is
// a 15 px teal badge that reserves its own width) and ITEM 5 (a stale view on a GROWN
// plan says the PLAN grew).
//
// Bed "LC682 Chain Bed": 18 one-working-day tickets in ONE Blocks chain, stored on
// consecutive working days 10-05 .. 10-28, lag 3 wd on WFH-3496 -> WFH-3497.
//   -> the settle moves WFH-3497 to 10-19 and every row after it, so exactly ELEVEN
//      rows (WFH-3497 .. WFH-3507) render dates that are not Jira's, and SEVEN do not.
//   -> plan finish 11-02 (stamped, and independently computed).
// The stored AI view was built when the plan had NINE issues (storylinesNone recorded,
// metaStamp 9:...), so it is stale against 18 and the plan's longest run is now 18 > 12.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
// @ts-ignore
import { loadEnv } from "../../data/env.mjs";
import * as fs from "fs";

loadEnv();
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/shots";
const NAME = "LC682 Chain Bed";
const PLAN = "plan-test-mu9h1rn4-dsmv09";
const EXPECTED_DERIVED = ["WFH-3497", "WFH-3498", "WFH-3499", "WFH-3500", "WFH-3501", "WFH-3502", "WFH-3503", "WFH-3504", "WFH-3505", "WFH-3506", "WFH-3507"];
test.describe.configure({ retries: 1, timeout: 2_700_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";

async function hook(what: string, params: Record<string, string> = {}) {
  const u = new URL(process.env.LZ_PPM_TESTHOOK_URL!);
  u.searchParams.set("what", what);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u.toString(), { headers: { Authorization: `Bearer ${process.env.HARNESS_SECRET}` } });
  return { status: r.status, body: await r.json().catch(() => null) };
}

test("items 2 + 5 — the key survives the derived mark; a grown plan says so", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.frame;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 150_000 });
  await page.waitForTimeout(3000);
  const R: any = {};
  const card = frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first();
  R.card = { finish: (await txt(card.locator('[data-testid="plan-finish"]'))).replace(/\n/g, " "), verdict: await txt(card.locator('[data-testid="plan-verdict-chip"]')) };
  console.log("CARD", JSON.stringify(R.card));
  await card.click();
  await page.waitForTimeout(19000);
  const f: any = await (await frame.locator(":root").elementHandle())!.ownerFrame();

  // ================= ITEM 2 =================
  await frame.getByRole("button", { name: /^Table$/i }).first().click().catch(() => {});
  await page.waitForTimeout(9000);
  const measure = async () => f.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-testid="table-row"]')];
    return rows.map((r: any) => {
      const cell = r.children[1];
      const keySpan = [...cell.querySelectorAll("span")].find((sp: any) => /^WFH-\d+$/.test((sp.textContent || "").trim()));
      const kb = keySpan ? keySpan.getBoundingClientRect() : null;
      const chip: any = cell.querySelector('[data-testid="table-derived-chip"]');
      const cb = chip ? chip.getBoundingClientRect() : null;
      const cs = keySpan ? getComputedStyle(keySpan) : null;
      return {
        key: r.getAttribute("data-row-key"), derived: r.getAttribute("data-row-derived"),
        start: r.getAttribute("data-row-start"), due: r.getAttribute("data-row-due"),
        cellW: Math.round(cell.getBoundingClientRect().width),
        cellText: (cell.textContent || "").trim(),
        keyPresent: !!keySpan, keyW: kb ? Math.round(kb.width * 10) / 10 : null,
        keyText: keySpan ? (keySpan.textContent || "").trim() : null,
        keyVisible: keySpan ? (keySpan as any).innerText.trim() : null,
        keyClipped: kb && keySpan ? keySpan.scrollWidth > Math.ceil(kb.width) + 1 : null,
        keyColor: cs ? cs.color : null, keyFont: cs ? cs.fontSize : null,
        chipPresent: !!chip, chipW: cb ? Math.round(cb.width) : null, chipH: cb ? Math.round(cb.height) : null,
        chipAria: chip ? chip.getAttribute("aria-label") : null,
        chipReason: chip ? chip.getAttribute("data-reason") : null,
        chipBg: chip ? getComputedStyle(chip).backgroundColor : null,
        chipColor: chip ? getComputedStyle(chip).color : null,
      };
    });
  });
  R.light = await measure();
  console.log("LIGHT ROWS", JSON.stringify(R.light, null, 1));
  await page.screenshot({ path: `${OUT}/p3-a-table-light.png` });
  R.keyColWidths = [...new Set(R.light.map((r: any) => r.cellW))];
  R.derivedKeys = R.light.filter((r: any) => r.chipPresent).map((r: any) => r.key);
  R.rowsMarkedDerived = R.light.filter((r: any) => r.derived === "1").map((r: any) => r.key);
  R.keysMissing = R.light.filter((r: any) => !r.keyPresent || !r.keyW || r.keyText !== r.key).map((r: any) => r.key);
  R.keysClipped = R.light.filter((r: any) => r.keyClipped).map((r: any) => r.key);
  console.log("COL WIDTHS", JSON.stringify(R.keyColWidths));
  console.log("CHIP ROWS", R.derivedKeys.length, JSON.stringify(R.derivedKeys));
  console.log("data-row-derived ROWS", R.rowsMarkedDerived.length, JSON.stringify(R.rowsMarkedDerived));
  console.log("KEYS MISSING/NARROW", JSON.stringify(R.keysMissing));
  console.log("KEYS CLIPPED", JSON.stringify(R.keysClipped));

  // the tip: FOCUS the chip's Tooltip wrapper (portal -> [data-testid="lz-tooltip"])
  R.tip = await f.evaluate(() => {
    const chip: any = document.querySelector('[data-testid="table-derived-chip"]');
    if (!chip) return { found: false };
    chip.parentElement.focus();
    return { found: true, key: chip.getAttribute("data-key"), tabIndex: chip.parentElement.tabIndex };
  });
  await page.waitForTimeout(1600);
  R.tipText = await f.evaluate(() => [...document.querySelectorAll('[data-testid="lz-tooltip"]')].map((e: any) => (e.textContent || "").trim()));
  console.log("TIP", JSON.stringify(R.tip), JSON.stringify(R.tipText));
  await page.screenshot({ path: `${OUT}/p3-b-table-tip.png` });

  // dark
  await f.evaluate(() => { document.documentElement.setAttribute("data-color-mode", "dark"); document.documentElement.setAttribute("data-theme", "dark"); });
  await page.waitForTimeout(3000);
  R.dark = await measure();
  await page.screenshot({ path: `${OUT}/p3-c-table-dark.png` });
  R.darkSample = R.dark.filter((r: any) => r.chipPresent)[0] || null;
  R.darkKeysMissing = R.dark.filter((r: any) => !r.keyPresent || !r.keyW || r.keyText !== r.key).map((r: any) => r.key);
  console.log("DARK SAMPLE", JSON.stringify(R.darkSample));
  console.log("DARK KEYS MISSING", JSON.stringify(R.darkKeysMissing));
  await f.evaluate(() => { document.documentElement.setAttribute("data-color-mode", "light"); document.documentElement.setAttribute("data-theme", "light"); });
  await page.waitForTimeout(2500);

  // ================= ITEM 5 =================
  await frame.getByRole("button", { name: /^Storyline$/i }).first().click().catch(() => {});
  await page.waitForTimeout(22000);
  const empty = frame.locator('[data-testid="storyline-empty"]').first();
  R.storyline = {
    emptyPresent: await empty.count(),
    emptyText: (await txt(empty)).replace(/\n/g, " | "),
    rebuildPresent: await frame.locator('[data-testid="storyline-rebuild"]').count(),
    rebuildLabel: await txt(frame.locator('[data-testid="storyline-rebuild"]')),
    bodyHasGrew: /built when the plan was smaller/i.test(await txt(frame.locator("body"))),
    bodyHasOlderBuild: /built before storylines/i.test(await txt(frame.locator("body"))),
    staleChip: await f.evaluate(() => [...document.querySelectorAll("*")].filter((e: any) => e.children.length === 0 && /stale|out of date|re-?build/i.test(e.textContent || "")).map((e: any) => (e.textContent || "").trim()).slice(0, 10)),
  };
  console.log("STORYLINE", JSON.stringify(R.storyline, null, 1));
  await page.screenshot({ path: `${OUT}/p3-d-storyline.png`, fullPage: false });
  R.aiView = (await hook("aiView", { planId: PLAN })).body?.view ?? null;
  R.aiViewSummary = R.aiView && { metaStamp: R.aiView.metaStamp, storylinesNone: R.aiView.storylinesNone, hasStorylines: "storylines" in R.aiView, leafCount: R.aiView.leafCount };
  console.log("AI VIEW", JSON.stringify(R.aiViewSummary));

  const bodyT = await txt(frame.locator("body"));
  R.stagedAtExit = /Apply\s+\d+\s+change|Save\s*\(\d+\)/.test(bodyT);
  R.clearAtExit = await hook("clearDrafts", { planId: PLAN });
  console.log("STAGED_AFTER_CLEANUP =", R.stagedAtExit, "CLEAR", JSON.stringify(R.clearAtExit));
  fs.writeFileSync(`${OUT}/p3-results.json`, JSON.stringify(R, null, 2));
  expect(R.light.length).toBe(18);
});
