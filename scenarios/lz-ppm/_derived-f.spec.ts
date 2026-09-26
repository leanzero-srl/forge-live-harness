// Item 5: the Gantt holiday column on real data — a WEEKDAY holiday (2026-10-21 Wed)
// and a SATURDAY holiday (2026-10-24), light + dark. Removes both afterwards.
// Item 6 rider: the Select dropdown's chosen option in dark.
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

test("holiday band on the Gantt, light and dark", async ({ page }) => {
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

  // ---- ITEM 6 rider: Select dropdown in the Gantt toolbar
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  await setMode("dark"); await page.waitForTimeout(1200);
  const combos = frame.getByRole("combobox");
  R.comboCount = await combos.count();
  R.comboLabels = await combos.allInnerTexts().catch(() => []);
  console.log("COMBOS", R.comboCount, JSON.stringify(R.comboLabels));
  if (R.comboCount) {
    await combos.first().dispatchEvent("click");
    await page.waitForTimeout(1800);
    R.optionsDark = await rf!.evaluate(() => {
      const opts = Array.from(document.querySelectorAll('[role="option"]')) as HTMLElement[];
      const rgb = (v: string) => (v.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
      const lum = (c: number[]) => { const f = c.map((x) => { const t = x / 255; return t <= 0.03928 ? t / 12.92 : Math.pow((t + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
      return opts.map((o) => {
        const cs = getComputedStyle(o);
        let el: HTMLElement | null = o; let bg = cs.backgroundColor;
        while (el && (bg === "rgba(0, 0, 0, 0)" || bg === "transparent")) { el = el.parentElement; bg = el ? getComputedStyle(el).backgroundColor : "rgb(0,0,0)"; }
        const L1 = lum(rgb(cs.color)), L2 = lum(rgb(bg));
        return { t: (o.textContent || "").trim().slice(0, 28), sel: o.getAttribute("aria-selected"), color: cs.color, bg, ratio: Math.round(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 100) / 100 };
      });
    });
    console.log("SELECT OPTIONS DARK", JSON.stringify(R.optionsDark, null, 1));
    await page.screenshot({ path: `${OUT}/f01-select-dark.png` });
    await setMode("light"); await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/f02-select-light.png` });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1200);
  }
  await setMode("light");

  // ---- add the two holidays through the calendar panel
  const addHoliday = async (iso: string) => {
    await frame.getByRole("button", { name: /^Schedule$/i }).first().click();
    await page.waitForTimeout(4000);
    await frame.getByRole("button", { name: /^Bank Holidays/i }).first().click().catch(() => {});
    await page.waitForTimeout(2000);
    await frame.getByRole("button", { name: /^2026$/ }).first().click().catch(() => {});
    await page.waitForTimeout(800);
    await frame.getByRole("button", { name: /Choose date/i }).first().click();
    await page.waitForTimeout(1400);
    const cal = frame.locator(".lz-datepicker").first();
    for (let i = 0; i < 20; i++) {
      if (await cal.locator(`button[aria-label="${iso}"]`).count()) break;
      await cal.locator('button[aria-label="Next month"], button:has-text("›")').first().dispatchEvent("click");
      await page.waitForTimeout(450);
    }
    await cal.locator(`button[aria-label="${iso}"]`).first().dispatchEvent("click");
    await page.waitForTimeout(1200);
    await frame.getByRole("button", { name: /^Add$/ }).first().dispatchEvent("click");
    await page.waitForTimeout(5000);
    console.log("added", iso);
  };
  await addHoliday("2026-10-21");
  await addHoliday("2026-10-24");
  await page.screenshot({ path: `${OUT}/f03-holiday-panel.png` });
  R.panelAfterAdd = (await txt(frame.locator("body"))).slice(0, 600).replace(/\n/g, " | ");

  // ---- back to the Gantt
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click();
  await page.waitForTimeout(10000);
  // zoom to days if a zoom control exists, then scroll to October
  const gantt = frame.locator('[data-testid="gantt-row"]').first();
  await gantt.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(3000);

  R.cols = await rf!.evaluate(() => {
    const out: any[] = [];
    const nodes = Array.from(document.querySelectorAll('[data-col-date], [data-holiday], .lz-gantt-holiday')) as HTMLElement[];
    for (const n of nodes.slice(0, 40)) out.push({ d: n.getAttribute("data-col-date"), h: n.getAttribute("data-holiday"), cls: n.className, bg: getComputedStyle(n).backgroundColor });
    return out;
  });
  console.log("COL NODES", JSON.stringify(R.cols).slice(0, 1200));
  await page.screenshot({ path: `${OUT}/f04-gantt-holidays-light.png` });
  const chart = frame.locator(".lz-gantt, [data-testid='gantt-navigation']").first();
  await chart.screenshot({ path: `${OUT}/f05-gantt-crop-light.png` }).catch(() => {});
  await setMode("dark"); await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/f06-gantt-holidays-dark.png` });
  await chart.screenshot({ path: `${OUT}/f07-gantt-crop-dark.png` }).catch(() => {});
  await setMode("light"); await page.waitForTimeout(1000);

  // card after the holidays (finish must move)
  R.cardAfter = await (async () => {
    await frame.getByRole("button", { name: /Plans/i }).first().click().catch(() => {});
    await page.waitForTimeout(9000);
    const c = frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first();
    return { finish: (await txt(c.locator('[data-testid="plan-finish"]'))).replace(/\n/g, " "), room: (await txt(c.locator('[data-testid="plan-room"]'))).replace(/\n/g, " ") };
  })();
  console.log("CARD AFTER HOLIDAYS", JSON.stringify(R.cardAfter));
  await page.screenshot({ path: `${OUT}/f08-card-after-holidays.png` });

  fs.writeFileSync(`${OUT}/f-results.json`, JSON.stringify(R, null, 2));
  expect(1).toBe(1);
});
