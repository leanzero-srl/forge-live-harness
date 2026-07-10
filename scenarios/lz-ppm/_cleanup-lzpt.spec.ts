// Data hygiene — discard any staged/draft edits on LZPT so the deterministic bed
// is clean for the scenario journeys. Discard is draft-only (NO Jira write / NO
// Apply). Verifies the discard sticks across a full reload.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 200_000 });

async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

async function openLzptGantt(page: any, frame: any) {
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt|Table/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2000);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
}

test("discard staged edits on LZPT (restore clean)", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  let s = await enterForgeSurface(page, { surface: "custom" });
  let frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  await page.waitForTimeout(2000);
  await openLzptGantt(page, frame);

  const before = await bodyText(frame);
  const staged = (before.match(/Apply (\d+) changes/i) || [])[1];
  console.log("STAGED_BEFORE:", staged || "0");

  // Discard loop — Apply-review modal → Discard All, then Save to clear any
  // KVS-persisted draft so it can't resurrect on reload.
  for (let attempt = 0; attempt < 3; attempt++) {
    const body = await bodyText(frame);
    if (!/Apply \d+ changes/i.test(body)) break;
    await frame.getByRole("button", { name: /Apply \d+ changes/i }).first().click().catch(() => {});
    await page.waitForTimeout(1200);
    await frame.getByRole("button", { name: /Discard All/i }).first().click().catch(() => {});
    await page.waitForTimeout(1500);
    // If a Save badge remains, persist the cleared state.
    if (/Save \(\d+\)/i.test(await bodyText(frame))) {
      await frame.getByRole("button", { name: /^Save \(\d+\)/i }).first().click().catch(() => {});
      await page.waitForTimeout(2000);
    }
  }
  const afterDiscard = await bodyText(frame);
  console.log("STAGED_AFTER_DISCARD:", (afterDiscard.match(/Apply (\d+) changes/i) || [])[1] || "0",
              " SAVE_BADGE:", /Save \(\d+\)/i.test(afterDiscard) ? "present" : "Saved/none");

  // Full reload — confirm the discard is durable (no resurrection).
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  s = await enterForgeSurface(page, { surface: "custom" });
  frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame after reload");
  await page.waitForTimeout(2000);
  await openLzptGantt(page, frame);
  const afterReload = await bodyText(frame);
  const stagedAfter = Number((afterReload.match(/Apply (\d+) changes/i) || [])[1] || "0");
  console.log("STAGED_AFTER_RELOAD:", stagedAfter);
  expect(stagedAfter, "LZPT has no staged edits after discard + reload").toBe(0);
});
