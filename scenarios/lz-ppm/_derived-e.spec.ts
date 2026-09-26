// Items 2 (baseline variance), 3 (dashboard CSV), 6 (Select + DatePicker today cell).
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

test("baseline variance, CSV, and the on-* text tokens", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.frame;
  const rf = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  const setMode = async (m: string) => rf!.evaluate((x: string) => { document.documentElement.setAttribute("data-color-mode", x); document.documentElement.setAttribute("data-theme", x); }, m);
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 150_000 });
  await page.waitForTimeout(3000);
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first().click();
  await page.waitForTimeout(14000);
  const R: any = {};

  // ---- CSV hook
  await rf!.evaluate(() => {
    (window as any).__csv = [];
    const orig = URL.createObjectURL.bind(URL);
    (URL as any).createObjectURL = (b: any) => { try { b.text().then((t: string) => (window as any).__csv.push(t)); } catch {} return orig(b); };
  });

  await frame.getByRole("button", { name: /^Dashboard$/i }).first().click().catch(() => {});
  await page.waitForTimeout(12000);

  // ---- ITEM 3: Export CSV + Health report
  await frame.getByRole("button", { name: /^Export CSV$/i }).first().dispatchEvent("click");
  await page.waitForTimeout(3000);
  await frame.getByRole("button", { name: /^Health report$/i }).first().dispatchEvent("click");
  await page.waitForTimeout(3000);
  const csvs: string[] = await rf!.evaluate(() => (window as any).__csv || []);
  R.csvCount = csvs.length;
  csvs.forEach((c, i) => fs.writeFileSync(`${OUT}/e-csv-${i}.csv`, c));
  R.csvHeads = csvs.map((c) => c.split("\n").slice(0, 5));
  console.log("CSV COUNT", csvs.length);
  csvs.forEach((c, i) => console.log(`CSV[${i}]\n` + c.split("\n").slice(0, 5).join("\n")));

  // ---- ITEM 2: baseline + variance
  await frame.locator('[data-testid="set-baseline"]').first().scrollIntoViewIfNeeded().catch(() => {});
  await frame.locator('[data-testid="set-baseline"]').first().dispatchEvent("click");
  await page.waitForTimeout(20000);
  const vp = frame.locator('[data-testid="variance-panel"]').first();
  R.variance = {
    present: await vp.count(),
    net: await vp.getAttribute("data-net").catch(() => null),
    slipped: await vp.getAttribute("data-slipped").catch(() => null),
    ahead: await vp.getAttribute("data-ahead").catch(() => null),
    tracked: await vp.getAttribute("data-tracked").catch(() => null),
    text: (await txt(vp)).replace(/\n/g, " | "),
    head: (await txt(frame.locator(".lz-dash-baseline-head").first())).replace(/\n/g, " | "),
    rows: [] as any[],
  };
  for (const r of await frame.locator('[data-testid="variance-row"]').all()) {
    R.variance.rows.push({ key: await r.getAttribute("data-key"), slip: await r.getAttribute("data-slip"), text: (await txt(r)).replace(/\n/g, " | ") });
  }
  console.log("VARIANCE", JSON.stringify(R.variance, null, 1));
  await frame.locator('[data-testid="set-baseline"]').first().scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${OUT}/e01-variance.png` });
  await setMode("dark"); await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/e02-variance-dark.png` });
  await setMode("light"); await page.waitForTimeout(800);

  // clear the baseline again (restore)
  await frame.locator('[data-testid="clear-baseline"]').first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(8000);
  R.baselineCleared = await frame.locator('[data-testid="clear-baseline"]').count();
  console.log("CLEAR-BASELINE STILL THERE?", R.baselineCleared);

  // ---- ITEM 6: Select dropdown chosen option, DARK
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  await setMode("dark"); await page.waitForTimeout(1000);
  const sel = frame.locator('[data-testid="gantt-group-select"], [data-testid="gantt-zoom"]').first();
  R.selectPresent = await sel.count();
  await sel.locator("button").first().dispatchEvent("click").catch(async () => { await sel.dispatchEvent("click"); });
  await page.waitForTimeout(2000);
  R.selectPixels = await rf!.evaluate(() => {
    const opts = Array.from(document.querySelectorAll('[role="option"], .lz-select-option')) as HTMLElement[];
    return opts.slice(0, 12).map((o) => { const cs = getComputedStyle(o); return { t: (o.textContent || "").slice(0, 30), color: cs.color, bg: cs.backgroundColor, sel: o.getAttribute("aria-selected") }; });
  });
  console.log("SELECT OPTIONS", JSON.stringify(R.selectPixels));
  await page.screenshot({ path: `${OUT}/e03-select-dark.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1000);
  await setMode("light"); await page.waitForTimeout(800);
  await sel.locator("button").first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/e04-select-light.png` });
  await page.keyboard.press("Escape");

  // ---- ITEM 6: DatePicker TODAY cell (navigate back to Sep 2026)
  await frame.getByRole("button", { name: /^Table$/i }).first().click().catch(() => {});
  await page.waitForTimeout(7000);
  const row = frame.locator('[data-testid="table-row"][data-row-key="WFH-3445"]').first();
  await row.scrollIntoViewIfNeeded();
  await row.locator("> div").filter({ hasText: /^Oct 9$/ }).first().click({ timeout: 15000 });
  await page.waitForTimeout(2500);
  const cal = frame.locator(".lz-datepicker").first();
  for (let i = 0; i < 4; i++) {
    if (await cal.locator('button[aria-label="2026-09-20"]').count()) break;
    await cal.locator("button").filter({ hasText: "‹" }).first().dispatchEvent("click");
    await page.waitForTimeout(700);
  }
  const measure = async (tag: string) => {
    const m = await rf!.evaluate(() => {
      const el = document.querySelector('.lz-datepicker button[aria-label="2026-09-20"]') as HTMLElement | null;
      if (!el) return { found: false };
      const cs = getComputedStyle(el);
      const rgb = (v: string) => (v.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
      const lum = (c: number[]) => { const f = c.map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
      let bgEl: HTMLElement | null = el; let bg = cs.backgroundColor;
      while (bgEl && (bg === "rgba(0, 0, 0, 0)" || bg === "transparent")) { bgEl = bgEl.parentElement; bg = bgEl ? getComputedStyle(bgEl).backgroundColor : "rgb(255,255,255)"; }
      const L1 = lum(rgb(cs.color)), L2 = lum(rgb(bg));
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      return { found: true, color: cs.color, background: bg, fontWeight: cs.fontWeight, ratio: Math.round(ratio * 100) / 100 };
    });
    console.log(`TODAY CELL [${tag}]`, JSON.stringify(m));
    return m;
  };
  R.todayLight = await measure("light");
  await page.screenshot({ path: `${OUT}/e05-datepicker-today-light.png` });
  await setMode("dark"); await page.waitForTimeout(1200);
  R.todayDark = await measure("dark");
  await page.screenshot({ path: `${OUT}/e06-datepicker-today-dark.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1500);
  await setMode("light");

  // ---- final: nothing staged
  const save = frame.locator('[data-testid="plan-save-btn"]');
  R.finalToolbar = { save: await txt(save), state: await save.getAttribute("data-save-state").catch(() => null), applies: await frame.locator("button").filter({ hasText: /^Apply \d+ change/ }).count() };
  console.log("FINAL TOOLBAR", JSON.stringify(R.finalToolbar));
  fs.writeFileSync(`${OUT}/e-results.json`, JSON.stringify(R, null, 2));
  expect(1).toBe(1);
});
