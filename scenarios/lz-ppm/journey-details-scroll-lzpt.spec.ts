// PERSISTENT journey — #8 "you can't scroll the Details list and can't open the
// work item". The defect: CascadeImpact's wrapper was flex-squeezed with
// overflow:hidden, clipping the Details scroller to a few pixels, and the keys
// were not interactive. Assert: after a real cascade, Details expands to a list
// with usable height, a scrollable overflow style, and BUTTON keys. Discards after.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 1, timeout: 300_000 });
async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }
async function isStaged(frame: any) { const t = await bodyText(frame); return /Apply \d+ change/i.test(t) || /Save \(\d+\)/i.test(t); }

test("LZPT cascade Details: the list is scrollable and its keys are buttons", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const frameS = await enterForgeSurface(page, { surface: "custom" });
  const frame = frameS.kind === "custom" ? frameS.frame : null;
  if (!frame) throw new Error("no frame");
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  await page.waitForTimeout(2000);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2000);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(3500);
  const discardAll = async () => {
    for (let i = 0; i < 3; i++) { if (!(await isStaged(frame))) break; await frame.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click().catch(() => {}); await page.waitForTimeout(1200); await frame.getByRole("button", { name: /Discard All/i }).first().click().catch(() => {}); await page.waitForTimeout(2000); }
  };
  await discardAll();

  try {
    // Drag the free head (CROSS-A) so the whole chain cascades — many moved rows.
    const keyMap: Record<string, string> = await page.evaluate(async () => {
      const res = await fetch("/rest/api/3/search/jql", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" }, credentials: "include", body: JSON.stringify({ jql: "project = LZPT", maxResults: 100, fields: ["summary"] }) });
      const d = await res.json(); const m: Record<string, string> = {}; for (const i of d.issues || []) m[i.fields.summary] = i.key; return m;
    });
    const head = keyMap["CROSS-A gate"];
    expect(head, "resolved CROSS-A").toBeTruthy();

    let staged = false;
    for (let attempt = 0; attempt < 4 && !staged; attempt++) {
      const barLoc = frame.locator(`[data-testid="gantt-bar"][data-key="${head}"]`).first();
      await barLoc.scrollIntoViewIfNeeded().catch(() => {});
      const box = await barLoc.boundingBox().catch(() => null);
      if (!box) { await page.waitForTimeout(2000); continue; }
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy); await page.mouse.down();
      for (const f of [0.25, 0.5, 0.75, 1]) await page.mouse.move(cx + 120 * f, cy, { steps: 4 });
      await page.mouse.up();
      await page.waitForTimeout(3000);
      staged = await isStaged(frame);
    }
    expect(staged, "drag staged a cascade").toBeTruthy();

    // Open Details on the Cascade Impact strip.
    await frame.locator('[data-testid="cascade-impact"]').first().waitFor({ state: "visible", timeout: 10_000 });
    await frame.locator('[data-testid="cascade-impact"]').getByRole("button", { name: /Details/i }).first().click();
    await page.waitForTimeout(1000);

    const details = await realFrame!.evaluate(() => {
      const item = document.querySelector('[data-testid="cascade-moved-item"]');
      if (!item) return null;
      // The scroller is the nearest ancestor with a bounded overflow.
      let el: HTMLElement | null = item.parentElement as HTMLElement;
      let scroller: HTMLElement | null = null;
      for (let i = 0; i < 5 && el; i++) {
        const cs = getComputedStyle(el);
        if (/(auto|scroll)/.test(cs.overflowY)) { scroller = el; break; }
        el = el.parentElement as HTMLElement;
      }
      const items = document.querySelectorAll('[data-testid="cascade-moved-item"]');
      const firstBtn = item.querySelector("button");
      return {
        itemCount: items.length,
        itemTag: item.tagName,
        keyIsButton: !!firstBtn || item.tagName === "BUTTON",
        scrollerFound: !!scroller,
        clientHeight: scroller?.clientHeight ?? -1,
        scrollHeight: scroller?.scrollHeight ?? -1,
        itemHeight: (item as HTMLElement).offsetHeight,
      };
    });
    console.log("DETAILS", JSON.stringify(details));
    expect(details, "Details list rendered moved items").toBeTruthy();
    expect(details!.itemCount, "multiple moved rows listed").toBeGreaterThan(1);
    // The regression clipped the scroller to a few pixels — a healthy list shows
    // at least two rows of content.
    expect(details!.scrollerFound, "the list lives in an overflow-y scroller").toBeTruthy();
    expect(details!.clientHeight, "the scroller has usable height (not clipped)").toBeGreaterThan(details!.itemHeight * 2);
    // And if there are more rows than fit, the scroller must actually scroll.
    if (details!.scrollHeight > details!.clientHeight) {
      const moved = await realFrame!.evaluate(() => {
        const item = document.querySelector('[data-testid="cascade-moved-item"]');
        let el: HTMLElement | null = item?.parentElement as HTMLElement;
        for (let i = 0; i < 5 && el; i++) {
          if (/(auto|scroll)/.test(getComputedStyle(el).overflowY)) { el.scrollTop = 200; return el.scrollTop > 0; }
          el = el.parentElement as HTMLElement;
        }
        return false;
      });
      expect(moved, "the Details list actually scrolls").toBeTruthy();
    }
    // The work item is openable: the key renders as a real button.
    expect(details!.keyIsButton, "the issue key is a button (openable)").toBeTruthy();
  } finally {
    await discardAll();
    console.log("FINAL staged:", await isStaged(frame));
  }
});
