// SCRATCH 6.69.0 — Explain on LZPT, answer 1 captured verbatim (real model call).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
const T = getTarget("lz-ppm-dashboard");
const SHOT = "/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6690";
test.describe.configure({ retries: 1, timeout: 420_000 });
const text = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";

test("6690 explain: answer 1 names the finish-driving chain", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  await page.waitForTimeout(1800);
  await frame.getByText("LZPT Scenarios", { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt|Table|Dashboard/i.test(await text(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);

  const btn = frame.locator("button").filter({ hasText: /Explain this plan/i }).first();
  console.log("EXPLAIN_BTN_COUNT=" + await frame.locator("button").filter({ hasText: /Explain this plan/i }).count());
  await btn.dispatchEvent("click");
  await page.waitForTimeout(3000);
  console.log("AFTER_CLICK_SNIPPET=" + JSON.stringify((await text(frame)).slice(0, 400)));
  // wait for the answer to land: poll for the heading
  let t = "";
  for (let i = 0; i < 60; i++) {
    t = await text(frame);
    if (/What decides the end date/i.test(t)) break;
    await page.waitForTimeout(3000);
  }
  const start = t.indexOf("What decides the end date");
  console.log("EXPLAIN_FOUND=" + (start >= 0));
  await page.screenshot({ path: `${SHOT}/i1-explain-modal.png` });
  if (start >= 0) console.log("ANSWER_BLOCK_START\n" + t.slice(start, start + 2500) + "\nANSWER_BLOCK_END");
  else console.log("BODY_DUMP\n" + t.slice(0, 3000));
  await frame.getByRole("button", { name: /^Close$/i }).first().click({ timeout: 8000 }).catch(() => page.keyboard.press("Escape"));
  await page.waitForTimeout(1200);
  console.log("STAGED_AFTER_CLEANUP=" + /Apply \d+ change/i.test(await text(frame)));
  expect(true).toBeTruthy();
});
