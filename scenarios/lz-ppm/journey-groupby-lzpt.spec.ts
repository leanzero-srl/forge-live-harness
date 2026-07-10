// PERSISTENT feature journey — Table group-by Status on LZPT (read-only). The bed
// was seeded with 6 Done + 4 In-Progress leaves; verify grouping by status yields
// those group counts and that all groups sum to the total.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 200_000 });

async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

test("LZPT Table group-by Status: seeded status counts", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  await page.waitForTimeout(2000);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt|Table/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);

  // Open the Group combobox and pick Status.
  await frame.getByRole("combobox").first().click().catch(() => {});
  await page.waitForTimeout(500);
  await frame.getByRole("option", { name: /^Status$/i }).first().click().catch(() => {});
  await page.waitForTimeout(1500);

  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  const groups = await realFrame!.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="table-group-header"]')).map((el) => ({
      label: el.getAttribute("data-group-label"),
      count: Number(el.getAttribute("data-group-count")),
    })),
  );
  console.log("GROUPS:", JSON.stringify(groups));
  const by = (l: RegExp) => groups.find((g) => l.test(g.label || ""));
  const done = by(/^Done$/i), inProg = by(/In Progress/i);
  const total = groups.reduce((a, g) => a + g.count, 0);
  console.log("DONE:", done?.count, " IN_PROGRESS:", inProg?.count, " TOTAL:", total, " N_GROUPS:", groups.length);

  expect(groups.length, "grouping by Status yields >=2 status groups").toBeGreaterThanOrEqual(2);
  expect(done?.count, "6 leaves are Done (as seeded)").toBe(6);
  expect(inProg?.count, "4 leaves are In Progress (as seeded)").toBe(4);
  expect(total, "group counts sum to all 45 seeded issues").toBe(45);
});
