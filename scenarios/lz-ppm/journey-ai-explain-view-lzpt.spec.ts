// AI arc live proof on LZPT (dev): open the plan → the "opened on the critical path" chip;
// ✦ Explain this plan → the three-question modal; Gantt Group → AI structure → every row
// still present under named group headers. Requires cfg:ai ON and an AI view built
// (test hook: what=aiConfig&enabled=true; buildAiView over REST). Restore both afterwards.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
const T = getTarget("lz-ppm-dashboard");
const OUT = process.env.AI_SHOT_DIR || "/tmp";
test.describe.configure({ retries: 0, timeout: 300_000 });
const text = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";
test("LZPT: focus chip, Explain modal, AI structure view", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(1500);
  await frame.getByText("LZPT Scenarios", { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt|Table|Dashboard/i.test(await text(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  let t = await text(frame);
  const chip = (t.match(/Opened on [^\n]{0,140}/) || [])[0] || null;
  console.log("FOCUS CHIP:", chip);
  await page.screenshot({ path: `${OUT}/ai-1-landing.png` });
  // Explain
  await frame.getByRole("button", { name: /Explain this plan/i }).first().click();
  await frame.getByText(/Asking for the explanation|Computing what decides/i).first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
  await frame.getByText(/Asking for the explanation|Computing what decides/i).first().waitFor({ state: "hidden", timeout: 120_000 });
  await page.waitForTimeout(1500);
  t = await text(frame);
  const start = t.indexOf("What decides the end date");
  console.log("EXPLAIN:\n" + t.slice(Math.max(0, start - 200), start + 1400));
  await page.screenshot({ path: `${OUT}/ai-2-explain.png` });
  expect(t).toMatch(/What would move it/i); expect(t).toMatch(/What to do next/i);
  await frame.getByRole("button", { name: /^Close$/i }).first().click({ timeout: 10_000 }).catch(() => page.keyboard.press("Escape"));
  await page.waitForTimeout(1000);
  // AI structure in the Gantt: the custom Select shows "No grouping" beside the Group label
  const before = await frame.locator('[data-testid="gantt-row"]').count();
  await frame.getByText(/No grouping/i).first().click({ timeout: 10_000 });
  await page.waitForTimeout(600);
  await frame.getByText(/AI structure/i).first().click({ timeout: 10_000 });
  await page.waitForTimeout(6000);
  t = await text(frame);
  const after = await frame.locator('[data-testid="gantt-row"]').count();
  const headers = await frame.locator('[data-testid="gantt-group-header"], [data-group-header]').count();
  console.log("ROWS before/after:", before, after, "group headers:", headers);
  console.log("AI STRIP:", (t.match(/AI structure[^\n]{0,160}/) || [])[0]);
  console.log("GROUP NAMES:", (t.match(/(Wide|Cross-Cycle|Chain|Edge Case|Diamond|Rollup) Scenarios/g) || []).join(" | "));
  await page.screenshot({ path: `${OUT}/ai-3-ai-view.png` });
  expect(after).toBe(before);
});
