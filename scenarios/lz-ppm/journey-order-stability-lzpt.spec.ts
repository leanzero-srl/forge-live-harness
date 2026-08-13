// PERSISTENT journey — #10 evidence. "Work items not always in the same space"
// never got a concrete example; the plausible mechanism is Gantt row order.
// The ordering pipeline (rank-suggestion + refineOrderForLength under the
// default-ON auto-arrange) is pure row-index math — dates and pixels are not
// inputs — so with UNCHANGED data the order must be byte-identical between
// visits. This pins that: same plan, two loads, identical row order. If this
// ever goes red, #10 has its mechanism; while it stays green, between-visit
// moves require a DATA change (rank drift, link changes, membership).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 1, timeout: 300_000 });
async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

test("LZPT order stability: two visits render the identical row order", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);

  const readOrder = async (): Promise<string[]> => {
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
    const s = await enterForgeSurface(page, { surface: "custom" });
    const frame = s.kind === "custom" ? s.frame : null;
    if (!frame) throw new Error("no frame");
    await page.waitForTimeout(2000);
    await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
    if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
    await page.waitForTimeout(2000);
    await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
    await page.waitForTimeout(4000);
    const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();
    // 45 rows < the 150 virtualization threshold → every row is mounted.
    return realFrame!.evaluate(() =>
      Array.from(document.querySelectorAll("[data-row-key]")).map((e) => e.getAttribute("data-row-key") as string)
    );
  };

  const first = await readOrder();
  console.log("rows:", first.length, "first 5:", first.slice(0, 5).join(","));
  expect(first.length, "rows rendered").toBeGreaterThan(30);

  const second = await readOrder();
  expect(second, "the second visit renders the IDENTICAL row order").toEqual(first);
});
