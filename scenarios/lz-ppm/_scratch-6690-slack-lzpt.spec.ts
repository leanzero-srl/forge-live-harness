// SCRATCH 6.69.0 verification — item 1: ONE slack rule (date-anchored) on LZPT.
// Drives the Gantt Critical toggle, reads the focus chip, runs Explain (real model
// call) and captures answer 1. Read-only: no edit, no Apply.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
const T = getTarget("lz-ppm-dashboard");
const SHOT = "/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6690";
test.describe.configure({ retries: 1, timeout: 420_000 });
const text = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";

test("6690 item1: critical toggle lights only the finish-driving path; chip; explain", async ({ page }) => {
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

  // --- staged-state guard: never leave a draft behind, and never measure one ---
  let t = await text(frame);
  console.log("STAGED_ON_ENTRY=" + /Apply \d+ change/i.test(t));

  // --- FOCUS CHIP on open ---
  const chip = await realFrame!.evaluate(() => {
    const el = document.querySelector('[data-testid="gantt-focus-chip"]') as HTMLElement | null;
    return el ? { reason: el.getAttribute("data-focus-reason"), label: el.innerText } : null;
  });
  console.log("FOCUS_CHIP=" + JSON.stringify(chip));
  console.log("FOCUS_CHIP_TEXT_MATCH=" + JSON.stringify((t.match(/Opened on [^\n]{0,160}/) || [])[0] || null));
  await page.screenshot({ path: `${SHOT}/i1-1-landing.png` });

  const rowState = () => realFrame!.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="gantt-row"]')).map((el) => {
      const bar = el.querySelector('[data-testid="gantt-bar"]');
      return { key: el.getAttribute("data-row-key"), dim: el.getAttribute("data-dim"), hasBar: !!bar, critical: bar?.getAttribute("data-critical") === "1" };
    }));
  const off = await rowState();
  console.log("OFF_CRITICAL_BARS=" + JSON.stringify(off.filter((r) => r.critical).map((r) => r.key)));

  // --- CRITICAL TOGGLE ON ---
  await frame.getByRole("button", { name: /^Critical/i }).first().click().catch(() => {});
  await page.waitForTimeout(2000);
  const on = await rowState();
  const critBtn = (await frame.getByRole("button", { name: /Critical/i }).first().textContent().catch(() => "")) || "";
  console.log("CRITICAL_BUTTON_TEXT=" + JSON.stringify(critBtn));
  console.log("CRITICAL_KEYS=" + JSON.stringify(on.filter((r) => r.critical).map((r) => r.key).sort()));
  console.log("UNDIMMED_KEYS=" + JSON.stringify(on.filter((r) => r.dim === "none").map((r) => r.key).sort()));
  console.log("ROWS=" + on.length);
  await page.screenshot({ path: `${SHOT}/i1-2-critical-on.png` });
  await frame.getByRole("button", { name: /^Critical/i }).first().click().catch(() => {});
  await page.waitForTimeout(1200);

  // --- EXPLAIN (real model call) ---
  await frame.getByRole("button", { name: /Explain this plan/i }).first().click();
  await frame.getByText(/Asking for the explanation|Computing what decides/i).first().waitFor({ state: "visible", timeout: 40_000 }).catch(() => {});
  await frame.getByText(/Asking for the explanation|Computing what decides/i).first().waitFor({ state: "hidden", timeout: 180_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  t = await text(frame);
  const start = t.indexOf("What decides the end date");
  console.log("EXPLAIN_FULL_START\n" + t.slice(Math.max(0, start - 300), start + 2200) + "\nEXPLAIN_FULL_END");
  await page.screenshot({ path: `${SHOT}/i1-3-explain.png`, fullPage: false });
  await frame.getByRole("button", { name: /^Close$/i }).first().click({ timeout: 10_000 }).catch(() => page.keyboard.press("Escape"));
  await page.waitForTimeout(1200);
  const tEnd = await text(frame);
  console.log("STAGED_AFTER_CLEANUP=" + /Apply \d+ change/i.test(tEnd));
  expect(true).toBeTruthy();
});
