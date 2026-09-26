// LIVE CHECK dev 6.81.0 — ITEM 1: the Table and the Gantt render the DERIVED
// schedule on the lagged 3-issue bed, and every moved row says so.
// Bed: plan "Derived Lag Bed" (WFH-3466 A -> WFH-3467 B -> WFH-3468 C, lag 5wd on B->C)
// STORED   C = 2026-10-19 / 2026-10-23
// DERIVED  C = 2026-10-26 / 2026-10-30   (B due Fri 10-16 -> next wd Mon 10-19 + 5wd = Mon 10-26, 5wd duration -> Fri 10-30)
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/shots";
const NAME = "Derived Lag Bed";
test.describe.configure({ retries: 1, timeout: 2_400_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";

test("item 1 — derived rows on the lagged bed", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.frame;
  const realFrame = async () => (await (await frame.locator(":root").elementHandle())!.ownerFrame())!;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 150_000 });
  await page.waitForTimeout(3000);

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
  await card.click();
  await page.waitForTimeout(16000);

  // ---------- TABLE ----------
  await frame.getByRole("button", { name: /^Table$/i }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  const readTable = async () => {
    const out: any[] = [];
    for (const r of await frame.locator('[data-testid="table-row"]').all()) {
      out.push({
        key: await r.getAttribute("data-row-key"),
        start: await r.getAttribute("data-row-start"),
        due: await r.getAttribute("data-row-due"),
        dur: await r.getAttribute("data-row-duration"),
        derived: await r.getAttribute("data-row-derived"),
        chip: await r.locator('[data-testid="table-derived-chip"]').count(),
        derivedDateFields: await r.locator('[data-testid="table-derived-date"]').evaluateAll((els: any[]) => els.map((e) => ({ f: e.getAttribute("data-field"), text: e.textContent, color: getComputedStyle(e).color, weight: getComputedStyle(e).fontWeight }))).catch(() => []),
      });
    }
    return out;
  };
  R.table = await readTable();
  console.log("TABLE", JSON.stringify(R.table, null, 1));
  await page.screenshot({ path: `${OUT}/a01-table-light.png` });

  // toolbar: nothing staged
  const save = frame.locator('[data-testid="plan-save-btn"]');
  const bodyT = await txt(frame.locator("body"));
  R.toolbar = {
    saveText: (await txt(save)).replace(/\n/g, " "),
    saveState: await save.getAttribute("data-save-state").catch(() => null),
    hasChanges: await save.getAttribute("data-has-changes").catch(() => null),
    applyTextSeen: /Apply\s+\d+\s+change/.test(bodyT),
    saveCountSeen: /Save\s*\(\d+\)/.test(bodyT),
  };
  console.log("TOOLBAR", JSON.stringify(R.toolbar));

  // ---------- SORT BY DUE DATE (twice, record both orders) ----------
  R.sort = [];
  for (let i = 0; i < 2; i++) {
    await frame.locator('[data-testid="table-sort-dueDate"]').first().click().catch(() => {});
    await page.waitForTimeout(3000);
    const rows = await frame.locator('[data-testid="table-row"]').all();
    const o: any[] = [];
    for (const r of rows) o.push({ k: await r.getAttribute("data-row-key"), due: await r.getAttribute("data-row-due") });
    R.sort.push(o);
    console.log(`SORT#${i + 1}`, JSON.stringify(o));
  }
  await page.screenshot({ path: `${OUT}/a02-table-sorted.png` });

  // ---------- GANTT ----------
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(9000);
  R.gantt = [];
  for (const b of await frame.locator('[data-testid="gantt-bar"]').all()) {
    R.gantt.push({
      key: (await b.getAttribute("data-row-key")) || (await b.getAttribute("data-key")),
      start: await b.getAttribute("data-bar-start"),
      due: await b.getAttribute("data-bar-due"),
      derived: await b.getAttribute("data-derived"),
      cap: await b.locator('[data-testid="gantt-derived-cap"]').count(),
      border: await b.evaluate((e: any) => getComputedStyle(e).border).catch(() => null),
      shadow: await b.evaluate((e: any) => getComputedStyle(e).boxShadow).catch(() => null),
    });
  }
  R.ganttChips = await frame.locator('[data-testid="gantt-derived-chip"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-key"), reason: e.getAttribute("data-reason"), text: e.textContent, bg: getComputedStyle(e).backgroundColor, color: getComputedStyle(e).color })));
  console.log("GANTT", JSON.stringify(R.gantt, null, 1));
  console.log("GANTT CHIPS", JSON.stringify(R.ganttChips));
  R.legendHasDerived = /Derived/.test(await txt(frame.locator("body")));
  await page.screenshot({ path: `${OUT}/a03-gantt-light.png` });

  // ---------- BAR TIP on the derived bar (mouse.move; FrameLocator hover fires no mouseenter) ----------
  const bar = frame.locator('[data-testid="gantt-bar"][data-derived="1"]').first();
  const box = await bar.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(1500);
    await page.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2 + 1);
    await page.waitForTimeout(2000);
  }
  const f = await realFrame();
  R.barTip = await f.evaluate(() => {
    const hit = [...document.body.querySelectorAll("div")].filter((d) => /Derived —|Derived —/.test(d.textContent || "") && d.children.length === 0);
    const fixed = [...document.body.querySelectorAll("div")].filter((d) => getComputedStyle(d).position === "fixed" && /the schedule places it/.test(d.textContent || ""));
    return { leafHits: hit.map((d) => d.textContent), fixedHits: fixed.map((d) => (d.textContent || "").slice(0, 400)) };
  });
  console.log("BAR TIP", JSON.stringify(R.barTip, null, 1));
  await page.screenshot({ path: `${OUT}/a04-gantt-bartip.png` });

  // ---------- CHIP TOOLTIP (the app's own Tooltip) ----------
  const chip = frame.locator('[data-testid="gantt-derived-chip"]').first();
  const cb = await chip.boundingBox();
  if (cb) { await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2); await page.waitForTimeout(1200); await page.mouse.move(cb.x + cb.width / 2 + 1, cb.y + cb.height / 2); await page.waitForTimeout(1800); }
  R.chipTip = await f.evaluate(() => [...document.body.querySelectorAll("*")].map((e) => e.textContent || "").filter((t) => /the schedule places it/.test(t)).sort((a, b) => a.length - b.length).slice(0, 1));
  console.log("CHIP TIP", JSON.stringify(R.chipTip));
  await page.screenshot({ path: `${OUT}/a05-chip-tip.png` });

  // ---------- DARK ----------
  await f.evaluate(() => { document.documentElement.setAttribute("data-color-mode", "dark"); document.documentElement.setAttribute("data-theme", "dark"); });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/a06-gantt-dark.png` });
  R.darkChips = await frame.locator('[data-testid="gantt-derived-chip"]').evaluateAll((els: any[]) => els.map((e) => ({ bg: getComputedStyle(e).backgroundColor, color: getComputedStyle(e).color })));
  R.darkBar = await frame.locator('[data-testid="gantt-bar"][data-derived="1"]').first().evaluate((e: any) => ({ border: getComputedStyle(e).border, bg: getComputedStyle(e).background.slice(0, 120) })).catch(() => null);
  const capEl = frame.locator('[data-testid="gantt-derived-cap"]').first();
  R.darkCap = await capEl.evaluate((e: any) => getComputedStyle(e).backgroundColor).catch(() => null);
  console.log("DARK", JSON.stringify({ chips: R.darkChips, bar: R.darkBar, cap: R.darkCap }));
  // dark table too
  await frame.getByRole("button", { name: /^Table$/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUT}/a07-table-dark.png` });
  R.darkSave = { text: (await txt(frame.locator('[data-testid="plan-save-btn"]'))).replace(/\n/g, " "), state: await frame.locator('[data-testid="plan-save-btn"]').getAttribute("data-save-state").catch(() => null) };
  console.log("DARK SAVE", JSON.stringify(R.darkSave));
  // status mix, for the "against a done-green bar" judgement
  R.statuses = await frame.locator('[data-testid="table-row"]').evaluateAll((els: any[]) => els.map((e) => e.getAttribute("data-row-status")));
  console.log("STATUSES", JSON.stringify(R.statuses));

  fs.writeFileSync(`${OUT}/a-results.json`, JSON.stringify(R, null, 2));
  expect(R.table.length).toBe(3);
});
