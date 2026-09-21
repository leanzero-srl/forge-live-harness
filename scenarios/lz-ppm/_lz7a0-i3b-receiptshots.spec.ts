// LZ7A0 item 3 — ELEMENT screenshots of the two on-screen receipts' verdict blocks.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const SP = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7a0";
const PLAN = "LZ7A0 retest bed";
test.describe.configure({ retries: 0, timeout: 1_200_000 });

test("I3b: receipt verdict blocks", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  for (let i = 0; i < 8; i++) { await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {}); await page.waitForTimeout(3000); if (await frame.getByRole("button", { name: /^Planning/i }).count()) break; }
  await frame.getByRole("button", { name: /^Planning/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  await frame.getByText("Sponsor reports", { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(6000);

  await frame.locator(".lz-history-item").filter({ hasText: "LZ7A0 archive" }).first().click();
  await page.waitForTimeout(6000);
  const av = frame.locator('[data-testid="report-archive-verdict"]').first();
  await av.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(1200);
  await av.screenshot({ path: `${SP}/shot-archive-receipt-verdict.png` }).catch((e: any) => console.log("SHOT_ERR", String(e).slice(0, 120)));
  console.log("ARCHIVE_BLOCK_TEXT", JSON.stringify((await av.textContent().catch(() => null))));

  await frame.locator(".lz-history-item").filter({ hasText: "LZ7A0 storyline" }).first().click();
  await page.waitForTimeout(6000);
  const sv = frame.locator('[data-testid="storyline-report"] .lz-slrep-block').first();
  await sv.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(1200);
  await sv.screenshot({ path: `${SP}/shot-storyline-receipt-verdict.png` }).catch((e: any) => console.log("SHOT_ERR2", String(e).slice(0, 120)));
  console.log("STORY_BLOCK_TEXT", JSON.stringify(((await sv.textContent().catch(() => null)) || "").slice(0, 400)));
});
