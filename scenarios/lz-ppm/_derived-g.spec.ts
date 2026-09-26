// Item 5 close-up: DAY zoom, tight crop of the holiday columns, light + dark,
// plus the paint order probe. Item 6: Select chosen option WITHOUT hover.
// Then REMOVES both holidays and discards any staged schedule change.
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

test("holiday close-up, select contrast, then restore", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1100 });
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

  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(9000);
  // DAY zoom
  await frame.getByRole("button", { name: /^Day$/ }).first().click().catch(() => {});
  await page.waitForTimeout(6000);

  // paint order + geometry probe
  R.probe = await rf!.evaluate(() => {
    const cells = Array.from(document.querySelectorAll('div')).filter((d) => {
      const st = (d as HTMLElement).style;
      return st.background && st.background.includes('--lz-warning-light');
    }) as HTMLElement[];
    const bars = Array.from(document.querySelectorAll('[data-testid="gantt-bar"]')) as HTMLElement[];
    const order = (el: HTMLElement) => { let n = 0; let p: any = el; while ((p = p.previousElementSibling)) n++; return n; };
    return {
      holidayDivs: cells.length,
      sample: cells.slice(0, 4).map((c) => ({ left: c.style.left, width: c.style.width, bg: getComputedStyle(c).backgroundColor, borderLeft: getComputedStyle(c).borderLeftColor, zIndex: getComputedStyle(c).zIndex, sibIdx: order(c), parentChildren: c.parentElement?.children.length })),
      barInfo: bars.slice(0, 3).map((b) => ({ key: b.getAttribute('data-row-key'), sibIdx: order(b), zIndex: getComputedStyle(b).zIndex, rect: b.getBoundingClientRect().x })),
      weekendDivs: Array.from(document.querySelectorAll('div')).filter((d) => ((d as HTMLElement).style.background || '').includes('weekend')).length,
    };
  });
  console.log("PROBE", JSON.stringify(R.probe, null, 1));

  const rows = frame.locator('[data-testid="gantt-row"]');
  const box = await rows.first().boundingBox();
  const last = await rows.last().boundingBox();
  const clipL = box && last ? { x: Math.max(0, box.x - 20), y: box.y - 70, width: Math.min(1100, 1700 - box.x), height: (last.y + last.height) - (box.y - 70) + 20 } : undefined;
  await page.screenshot({ path: `${OUT}/g01-day-light.png`, clip: clipL });
  await page.screenshot({ path: `${OUT}/g01b-full-light.png` });
  await setMode("dark"); await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/g02-day-dark.png`, clip: clipL });
  await page.screenshot({ path: `${OUT}/g02b-full-dark.png` });

  // --- Select chosen option, NO hover: open with the keyboard, pointer parked far away
  await page.mouse.move(5, 5);
  const combo = frame.getByRole("combobox").first();
  await combo.focus().catch(() => {});
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  R.selectDarkNoHover = await rf!.evaluate(() => {
    const opts = Array.from(document.querySelectorAll('[role="option"]')) as HTMLElement[];
    const rgb = (v: string) => (v.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
    const alpha = (v: string) => { const m = v.match(/rgba?\(([^)]+)\)/); const p = m ? m[1].split(',').map((x) => parseFloat(x)) : []; return p.length === 4 ? p[3] : 1; };
    const lum = (c: number[]) => { const f = c.map((x) => { const t = x / 255; return t <= 0.03928 ? t / 12.92 : Math.pow((t + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
    return opts.map((o) => {
      const cs = getComputedStyle(o);
      // composite the option's own (possibly translucent) bg over its opaque ancestor
      let el: HTMLElement | null = o.parentElement; let under = "rgb(255,255,255)";
      while (el) { const b = getComputedStyle(el).backgroundColor; if (b !== "rgba(0, 0, 0, 0)" && b !== "transparent") { under = b; break; } el = el.parentElement; }
      const own = rgb(cs.backgroundColor), a = alpha(cs.backgroundColor), u = rgb(under);
      const eff = own.length === 3 ? own.map((v, i) => v * a + u[i] * (1 - a)) : u;
      const L1 = lum(rgb(cs.color)), L2 = lum(eff);
      return { t: (o.textContent || "").trim().slice(0, 28), sel: o.getAttribute("aria-selected"), color: cs.color, rawBg: cs.backgroundColor, under, effBg: eff.map(Math.round), ratio: Math.round(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 100) / 100 };
    });
  });
  console.log("SELECT DARK NO HOVER", JSON.stringify(R.selectDarkNoHover, null, 1));
  await page.screenshot({ path: `${OUT}/g03-select-dark-nohover.png` });
  await setMode("light"); await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/g04-select-light-nohover.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1200);

  // --- REMOVE the two holidays
  await frame.getByRole("button", { name: /^Schedule$/i }).first().click();
  await page.waitForTimeout(5000);
  await frame.getByRole("button", { name: /^Bank Holidays/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^2026$/ }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  R.panelBefore = (await txt(frame.locator("body"))).replace(/\n/g, " | ").slice(0, 900);
  await page.screenshot({ path: `${OUT}/g05-holiday-panel.png` });
  for (let pass = 0; pass < 6; pass++) {
    const del = frame.getByRole("button", { name: /^(Remove|Delete|×|✕)$/ });
    const n = await del.count();
    if (!n) break;
    await del.first().dispatchEvent("click");
    await page.waitForTimeout(4000);
  }
  R.panelAfter = (await txt(frame.locator("body"))).replace(/\n/g, " | ").slice(0, 900);
  console.log("PANEL AFTER REMOVE:", R.panelAfter);
  await page.screenshot({ path: `${OUT}/g06-holiday-panel-after.png` });
  fs.writeFileSync(`${OUT}/g-results.json`, JSON.stringify(R, null, 2));
  expect(1).toBe(1);
});
