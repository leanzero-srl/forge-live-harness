// LZ790 item 7b — the DOWNLOADED archive carries the scoped coverage sentence.
// Never click the blob anchor for real: a headless download tears the context down
// (skill: 2026-09-20). Stub URL.createObjectURL and preventDefault the anchor.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz790shots";
const PLAN = "LZ790 retest bed";
test.describe.configure({ retries: 0, timeout: 900_000 });

test("I7b: the downloaded archive prints the scoped coverage sentence", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  for (let i = 0; i < 8; i++) { await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {}); await page.waitForTimeout(3000); if (await frame.getByRole("button", { name: /^Planning/i }).count()) break; }
  await frame.getByRole("button", { name: /^Planning/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await frame.getByText("Sponsor reports", { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await frame.getByText("LZ790 coverage receipt", { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await frame.locator("body").evaluate(() => {
    (window as any).__blob = null;
    const real = URL.createObjectURL.bind(URL);
    (URL as any).createObjectURL = (b: any) => { b.text().then((t: string) => { (window as any).__blob = t; }); return "blob:stubbed"; };
    document.addEventListener("click", (e: any) => { const a = e.target && e.target.closest && e.target.closest("a[download]"); if (a) e.preventDefault(); }, true);
    (window as any).__realCreate = real;
  });
  await frame.locator("button").filter({ hasText: /^Download complete HTML report$/ }).first().click();
  for (let i = 0; i < 40; i++) { await page.waitForTimeout(500); if (await frame.locator("body").evaluate(() => (window as any).__blob)) break; }
  const html: string = await frame.locator("body").evaluate(() => (window as any).__blob) || "";
  console.log("ARCHIVE_BYTES", html.length);
  console.log("ARCHIVE_HAS_SCOPED_SENTENCE", html.includes("1 of 3 scoped tasks has no usable dates and is not in this finish."));
  console.log("ARCHIVE_HAS_PLAN_SENTENCE", html.includes("1 of 9 tasks has no usable dates and is not in this finish."));
  console.log("ARCHIVE_HAS_OLD_FORECAST_SENTENCE", html.includes("The full dependency network is incomplete or the forecast could not finish."));
  console.log("ARCHIVE_HAS_SCOPE_NOT_FORECAST", html.includes("Not simulated: a target is forecast over every task in its scope"));
  const m = html.match(/.{0,260}scoped tasks has no usable dates.{0,60}/);
  console.log("ARCHIVE_CONTEXT", m ? m[0].replace(/\s+/g, " ") : "(not found)");
  await page.screenshot({ path: `${OUT}/i7b-01-download.png` });
});
