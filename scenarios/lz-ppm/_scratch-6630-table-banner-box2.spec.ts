import { test } from "@playwright/test";
import { getTarget } from "../../config/targets";
import { assertLoggedIn, launchHarnessContext } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
const T = getTarget("lz-ppm-dashboard");
const OUT = process.env.SHOT_DIR || "/tmp";
test.describe.configure({ retries: 0, timeout: 900_000 });
const realFrame = async (f: any) => (await (await f.locator(":root").elementHandle())!.ownerFrame())!;

test("6.63.0 table cycle-banner geometry vs viewport", async () => {
  const ctx = await launchHarnessContext();
  const page = await ctx.newPage();
  try {
    await page.setViewportSize({ width: 1700, height: 1100 });
    await assertLoggedIn(page);
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
    const s = await enterForgeSurface(page, { surface: "custom" });
    const frame: any = (s as any).frame;
    await page.waitForTimeout(2500);
    await frame.getByText("LZPT Scenarios", { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(4000);
    await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
    await page.waitForTimeout(9000);
    const rf = await realFrame(frame);
    for (const h of [1100, 1500, 800]) {
      await page.setViewportSize({ width: 1700, height: h });
      await page.waitForTimeout(3000);
      const r = await rf.evaluate(() => {
        const el = document.querySelector('[data-testid="cycle-banner"]') as any;
        const p = el?.parentElement;
        const pc = p && getComputedStyle(p);
        const tbl = document.querySelector('[data-testid="table-view"], [data-testid="cascade-impact"]') as any;
        return { bannerH: el ? Math.round(el.getBoundingClientRect().height) : null, scrollH: el?.scrollHeight,
          parentDir: pc?.flexDirection, parentDisplay: pc?.display, parentH: p ? Math.round(p.getBoundingClientRect().height) : null,
          siblings: p ? Array.from(p.children).map((c: any) => ({ t: c.getAttribute("data-testid") || c.tagName, h: Math.round(c.getBoundingClientRect().height), fs: getComputedStyle(c).flexShrink, fb: getComputedStyle(c).flexBasis })) : null,
          iframeH: window.innerHeight };
      });
      console.log(`VIEWPORT ${h} =`, JSON.stringify(r));
      await page.screenshot({ path: `${OUT}/11-table-vp-${h}.png` });
    }
  } finally { await ctx.close(); }
});
