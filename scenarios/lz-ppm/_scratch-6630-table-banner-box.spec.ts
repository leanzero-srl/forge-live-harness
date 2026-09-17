// TESTER (6.63.0 item 1, follow-up): the Table's cycle banner renders as a SLIVER.
// Measure the box and walk the ancestors to find which container squeezes it.
import { test } from "@playwright/test";
import { getTarget } from "../../config/targets";
import { assertLoggedIn, launchHarnessContext } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const OUT = process.env.SHOT_DIR || "/tmp";
test.describe.configure({ retries: 0, timeout: 900_000 });
const text = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";
const realFrame = async (f: any) => (await (await f.locator(":root").elementHandle())!.ownerFrame())!;

test("6.63.0 table cycle-banner geometry", async () => {
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
    const probe = async (label: string) => {
      const r = await rf.evaluate(() => {
        const el = document.querySelector('[data-testid="cycle-banner"]') as any;
        if (!el) return { missing: true } as any;
        const chain: any[] = [];
        let n: any = el;
        for (let i = 0; i < 6 && n; i++) {
          const c = getComputedStyle(n);
          const b = n.getBoundingClientRect();
          chain.push({ tag: n.tagName, cls: (n.className || "").toString().slice(0, 60), testid: n.getAttribute?.("data-testid"),
            h: Math.round(b.height), w: Math.round(b.width), top: Math.round(b.top),
            display: c.display, overflow: c.overflow, flex: c.flex, minHeight: c.minHeight, maxHeight: c.maxHeight,
            opacity: c.opacity, transform: c.transform, position: c.position });
          n = n.parentElement;
        }
        return { scrollH: el.scrollHeight, offsetH: el.offsetHeight, chain };
      });
      console.log(label, "=", JSON.stringify(r, null, 1));
    };
    await probe("TABLE BANNER GEOM (t+9s)");
    await page.waitForTimeout(8000);
    await probe("TABLE BANNER GEOM (t+17s)");
    await page.screenshot({ path: `${OUT}/10-table-banner-geom.png` });
    // and the Gantt for comparison
    await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
    await page.waitForTimeout(8000);
    await probe("GANTT BANNER GEOM");
    console.log("BODY HAS LOOP TEXT =", /dependency loop/i.test(await text(frame)));
  } finally { await ctx.close(); }
});
