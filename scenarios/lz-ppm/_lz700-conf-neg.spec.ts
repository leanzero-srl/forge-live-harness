// LZ700 — (A) publish into a space the user cannot write to, (B) the verbatim-error gate.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";
const bed = JSON.parse(fs.readFileSync("/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz700/bed.json", "utf8"));
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz700/shots";
test.describe.configure({ retries: 0, timeout: 2_400_000, mode: "serial" });

test("negative publish + verbatim gate", async ({ page }) => {
  const R: any = {};
  const consoleLines: string[] = [];
  page.on("console", (m) => consoleLines.push(`${m.type()}: ${m.text()}`.slice(0, 400)));
  await page.setViewportSize({ width: 1700, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.frame;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 180_000 });
  await page.waitForTimeout(3000);
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: bed.tag }).first().click();
  await page.waitForTimeout(16000);
  const body = async () => (await frame.locator("body").textContent().catch(() => "")) || "";

  await frame.getByRole("button", { name: /^Planning$/i }).first().click();
  await page.waitForTimeout(6000);
  await frame.getByRole("button", { name: /^Sponsor reports$/i }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(8000);
  await frame.locator('[data-testid="sponsor-reports"]').first().waitFor({ state: "visible", timeout: 60_000 });

  // ---- A: publish the never-published report into the read-only space
  const entry = frame.getByRole("button", { name: /LZ700 negative report/ }).first();
  if (await entry.count()) await entry.dispatchEvent("click");
  else await frame.getByText("LZ700 negative report", { exact: false }).first().dispatchEvent("click");
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${OUT}/n00-detail.png` });
  console.log("DETAIL BODY", (await body()).replace(/\s+/g, " ").slice(0, 2000));
  await frame.locator('[data-testid="publish-to-confluence"]').first().dispatchEvent("click");
  await frame.locator('[data-testid="publish-confluence-dialog"]').first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(6000);
  const combo = frame.locator('[data-testid="publish-confluence-dialog"]').getByRole("combobox").first();
  await combo.dispatchEvent("click");
  await page.waitForTimeout(1500);
  const ro = frame.getByRole("option", { name: /LZ publish readonly/ }).first();
  R.roOptionPresent = await ro.count();
  await ro.dispatchEvent("click");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/n01-readonly-chosen.png` });
  await frame.locator('[data-testid="publish-confluence-dialog"] button').filter({ hasText: /^Publish$|^Publish again$/ }).first().dispatchEvent("click");
  let refusal = "(none)";
  for (let i = 0; i < 160; i++) {
    const t = (await body()).replace(/\s+/g, " ");
    const m = t.match(/That Confluence space or page no longer exists[^.]*\.[^.]*\.|That space no longer exists[^.]*\.[^.]*\.|You do not have permission to do this in Confluence[^]{0,400}?(?=Cancel|Publish|$)|The app cannot write to Confluence[^.]*\.|Confluence refused[^.]*\.|Confluence did not answer[^.]*\./);
    if (m) { refusal = m[0]; break; }
    await page.waitForTimeout(500);
  }
  R.refusal = refusal;
  R.toastBodyAfterRefusal = (await body()).replace(/\s+/g, " ").slice(0, 3000);
  await page.screenshot({ path: `${OUT}/n02-refusal.png` });
  const chipAfterRefusal = await frame.locator('[data-testid="confluence-published-chip"]').first().innerText().catch(() => "(none)");
  R.chipAfterRefusal = chipAfterRefusal;
  console.log("REFUSAL", JSON.stringify({ refusal, chipAfterRefusal, roOptionPresent: R.roOptionPresent }));
  // close the dialog if still open
  await frame.locator('[data-testid="publish-confluence-dialog"] button').filter({ hasText: /^Cancel$/ }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(2000);

  // ---- B: the verbatim-error gate. Install a platform-shaped throw on the bridge.
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  await realFrame!.evaluate(() => {
    (window as any).__lzPlatformCalls = [];
    (window as any).__lzInvoke = async (name: string) => {
      (window as any).__lzPlatformCalls.push(name);
      throw new Error(`There was an error invoking the function - Resolver has no definition for '${name}'`);
    };
  });
  await frame.locator('[data-testid="publish-to-confluence"]').first().dispatchEvent("click");
  await frame.locator('[data-testid="publish-confluence-dialog"]').first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUT}/n03-platform-error.png` });
  const dlg = (await frame.locator('[data-testid="publish-confluence-dialog"]').first().textContent()) || "";
  R.platformDialogText = dlg.replace(/\s+/g, " ");
  R.platformCalls = await realFrame!.evaluate(() => (window as any).__lzPlatformCalls);
  console.log("PLATFORM DIALOG", R.platformDialogText);
  console.log("PLATFORM CALLS", JSON.stringify(R.platformCalls));
  R.console = consoleLines.filter((l) => /Confluence|Resolver has no definition|invoking the function/i.test(l));
  console.log("CONSOLE HITS", JSON.stringify(R.console, null, 1));
  fs.writeFileSync(`${OUT}/neg-results.json`, JSON.stringify(R, null, 2));
  expect(1).toBe(1);
});
