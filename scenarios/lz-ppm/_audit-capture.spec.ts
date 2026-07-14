// AUDIT capture — full-viewport screenshots of the LZPT plan's main surfaces in a given
// THEME (light default | dark). Forces the theme via prefers-color-scheme BEFORE the app
// mounts (ThemeProvider reads it once on mount). READ-ONLY; for human/brutal visual review.
//   THEME=light npx playwright test scenarios/lz-ppm/_audit-capture.spec.ts
//   THEME=dark  npx playwright test scenarios/lz-ppm/_audit-capture.spec.ts
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
const THEME = process.env.THEME === "dark" ? "dark" : "light";
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/848bc036-f0f1-4281-b0cf-12ff9cf45fd9/scratchpad/audit";
test.describe.configure({ retries: 0, timeout: 300_000 });
async function bodyText(f: any) { return (await f.locator("body").textContent().catch(() => "")) || ""; }

test(`AUDIT capture (${THEME})`, async ({ page }) => {
  await page.emulateMedia({ colorScheme: THEME as "light" | "dark" });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  fs.mkdirSync(OUT, { recursive: true });

  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/${THEME}-00-portfolio.png` });

  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt|Table|Dashboard/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);

  for (const v of ["Gantt", "Table", "Dashboard", "Schedule", "Permissions"]) {
    await frame.getByRole("button", { name: new RegExp(`^${v}`, "i") }).first().click().catch(() => {});
    await page.waitForTimeout(v === "Gantt" ? 5000 : 3500); // Gantt calendar cold-start
    await page.screenshot({ path: `${OUT}/${THEME}-${v.toLowerCase()}.png` });
  }

  // Bar-click editor (DateEditor popover — badges/faded-tint audit) on the Gantt.
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  const bar = frame.locator('[data-testid="gantt-bar"]').first();
  await bar.click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${THEME}-gantt-editor.png` });

  console.log(`AUDIT_DONE ${THEME}`);
});
