// LZ700 item 3 — the refused-drag toast must WRAP inside the iframe at 1700px.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";
const bed = JSON.parse(fs.readFileSync("/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz700/bed.json", "utf8"));
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz700/shots";
test.describe.configure({ retries: 0, timeout: 1_800_000, mode: "serial" });

test("refused-drag toast wraps inside the iframe", async ({ page }) => {
  const R: any = {};
  await page.setViewportSize({ width: 1700, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.frame;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 180_000 });
  await page.waitForTimeout(3000);
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: bed.tag }).first().click();
  await page.waitForTimeout(16000);
  const body = async () => (await frame.locator("body").textContent().catch(() => "")) || "";
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  R.iframeWidth = await realFrame!.evaluate(() => document.documentElement.clientWidth);

  const bar = frame.locator(`[data-testid="gantt-bar"][data-key="${bed.c}"]`).first();
  await bar.scrollIntoViewIfNeeded();
  const box = await bar.boundingBox();
  R.box = box;
  const cx = box!.x + box!.width / 2, cy = box!.y + box!.height / 2;
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (const f of [0.25, 0.5, 0.75, 1]) await page.mouse.move(cx - 120 * f, cy, { steps: 6 });
  await page.mouse.up();
  let toastText = "(none)";
  for (let i = 0; i < 40; i++) {
    const t = (await body()).replace(/\s+/g, " ");
    const m = t.match(/[A-Z]+-\d+ must start [^.]+\.\s*Cannot move (?:before|after)\./);
    if (m) { toastText = m[0]; break; }
    await page.waitForTimeout(250);
  }
  R.toastText = toastText;
  await page.waitForTimeout(1500);   // the slide-in animation is 0.3s; measure the RESTING toast
  R.geom = await realFrame!.evaluate(() => {
    const card = document.querySelector('[data-testid="toast"]') as HTMLElement | null;
    const cont = card?.parentElement as HTMLElement | null;
    const r = (e: HTMLElement | null) => { if (!e) return null; const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { x: b.x, y: b.y, w: b.width, h: b.height, right: b.right, position: cs.position, width: cs.width, maxWidth: cs.maxWidth, left: cs.left, rightCss: cs.right }; };
    return { card: r(card), container: r(cont), cardText: (card?.textContent || '').trim(),
      viewport: { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight, sw: document.documentElement.scrollWidth },
      innerW: window.innerWidth, lines: card ? Math.round(card.getBoundingClientRect().height / 18.2) : 0 };
  });
  R.iframeBox = await page.locator('iframe[data-testid="hosted-resources-iframe"]').first().boundingBox();
  await page.screenshot({ path: `${OUT}/t01-toast-1700.png` });
  console.log("TOAST", JSON.stringify(R, null, 1));
  fs.writeFileSync(`${OUT}/toast-results.json`, JSON.stringify(R, null, 2));
  expect(1).toBe(1);
});
