// BAR LABEL journey — "from time to time some rectangles are not showing the work
// item number". The key used to be hidden outright below 50px wide, which is any
// task under 4 days at Week zoom, 11 at Month and 21 at Quarter — plus every
// milestone — so short bars rendered as anonymous rectangles. The key now moves
// OUTSIDE the bar when it will not fit inside.
//
// Asserts, for EVERY rendered bar at EVERY zoom: the key is present, and when it is
// rendered outside the bar it does not sit underneath it (which would clip the
// leading characters and defeat the point).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
test.describe.configure({ retries: 1, timeout: 420_000 });

test("every Gantt bar is identifiable at every zoom", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first()
    .waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");

  await frame.getByText(/LZPT Scenarios/i).first().click();
  await frame.locator('[data-testid="gantt-bar"]').first().waitFor({ state: "visible", timeout: 90_000 });

  const handle = await frame.locator(":root").elementHandle();
  const real = await handle!.ownerFrame();

  for (const zoom of ["Day", "Week", "Month", "Quarter"]) {
    await frame.locator('[data-testid="gantt-zoom"] button').filter({ hasText: new RegExp(`^${zoom}$`) }).first().click();
    await page.waitForTimeout(1200);

    const report = await real!.evaluate(() => {
      const out: any = { total: 0, unlabelled: [] as string[], overlapping: [] as any[] };
      for (const bar of Array.from(document.querySelectorAll('[data-testid="gantt-bar"]'))) {
        const key = (bar as HTMLElement).dataset.key || "?";
        const isParent = (bar as HTMLElement).dataset.parent === "true";
        if (isParent) continue;
        out.total++;
        const text = (bar.textContent || "").trim();
        const outside = bar.querySelector('[data-testid="gantt-bar-label-outside"]') as HTMLElement | null;
        if (!text.includes(key)) { out.unlabelled.push(key); continue; }
        if (outside) {
          // The label must start at or after the bar's right edge — otherwise its
          // first characters are drawn under the bar and read as truncated.
          const b = bar.getBoundingClientRect();
          const l = outside.getBoundingClientRect();
          if (l.left < b.right - 0.5) out.overlapping.push({ key, barRight: Math.round(b.right), labelLeft: Math.round(l.left) });
        }
      }
      return out;
    });

    console.log(`${zoom}: ${report.total} leaf bars, ${report.unlabelled.length} unlabelled, ${report.overlapping.length} overlapping`);
    if (report.overlapping.length) console.log("  overlapping:", JSON.stringify(report.overlapping.slice(0, 5)));

    expect(report.total, `${zoom}: expected bars to be rendered`).toBeGreaterThan(0);
    expect(report.unlabelled, `${zoom}: every bar must carry its key`).toEqual([]);
    expect(report.overlapping, `${zoom}: an outside label must not be drawn under its bar`).toEqual([]);
  }
});
