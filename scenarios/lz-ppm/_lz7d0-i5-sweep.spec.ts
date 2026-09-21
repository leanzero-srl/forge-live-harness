// LZ7D0 item 5 — the closing read-only sweep on the restored bed: cold open leaves
// nothing staged, the derived chip / review-dialog partition reconciles, and the
// savedEdits mark is ABSENT at rest. No gesture that changes anything.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7d0";
const PLAN = "LZPT Scenarios";
const PLAN_ID = "plan-msq9dg8l-gz6mz1";
test.describe.configure({ retries: 0, timeout: 1_200_000 });
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");

test("D7: cold open is clean; derived chip partition reconciles", async ({ page }) => {
  const p0: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  console.log("PRE savedEditsKey", Object.prototype.hasOwnProperty.call(p0.meta, "savedEdits"), "storedDur", JSON.stringify((p0.issues || []).filter((i: any) => i.duration != null).map((i: any) => i.key)), "dec", JSON.stringify((p0.issues || []).filter((i: any) => "durationExplicitlyCleared" in i).map((i: any) => i.key)));
  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  console.log("SHELL_REV", ((await bodyText(frame)).match(/rev\s*v?([\d.]+)/) || [])[1]);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(9000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  console.log("STAGED_ON_COLD_OPEN", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  console.log("SAVE_LABEL", ((await frame.locator('[data-testid="plan-save-btn"]').first().textContent().catch(() => "")) || "").trim());
  const chip = frame.locator('[data-testid="derived-count-chip"]').first();
  const chipText = ((await chip.textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim();
  console.log("CHIP_TEXT", chipText);
  const cb = await chip.boundingBox();
  if (cb) await page.screenshot({ path: `${OUT}/d7-01-chip.png`, clip: { x: Math.max(0, cb.x - 20), y: Math.max(0, cb.y - 20), width: 760, height: 70 } });
  await chip.dispatchEvent("click");
  await page.waitForTimeout(3000);
  console.log("DIALOG_SUBTITLE", ((await frame.locator('[data-testid="derived-review-subtitle"]').first().textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim());
  console.log("DIALOG_TEXT", (await bodyText(frame)).match(/Rows that differ from Jira[\s\S]{0,700}/)?.[0]);
  console.log("DIALOG_ROWS", JSON.stringify(await frame.locator('[data-testid="derived-review-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-key"), sel: e.getAttribute("data-selected"), text: (e.textContent || "").replace(/\s+/g, " ") })))));
  console.log("DIALOG_FINISH", ((await frame.locator('[data-testid="derived-review-finish"]').first().textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim());
  await page.screenshot({ path: `${OUT}/d7-02-dialog.png` });
  await frame.locator('[data-testid="derived-review-cancel"]').first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(2000);
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  console.log("TABLE_DERIVED_CHIPS", JSON.stringify(await frame.locator('[data-testid="table-derived-chip"]').evaluateAll((els: any[]) => els.map((e) => `${e.getAttribute("data-key")}:${e.getAttribute("data-reason")}`))));
  await page.screenshot({ path: `${OUT}/d7-03-table.png` });
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  const p1: any = await getTestState("lz-ppm", { what: "planMeta", planId: PLAN_ID });
  console.log("POST savedEditsKey", Object.prototype.hasOwnProperty.call(p1.meta, "savedEdits"));
});
