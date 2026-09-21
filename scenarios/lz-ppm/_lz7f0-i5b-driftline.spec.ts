// LZ7F0 item 5b — the DRIFT LINE only on date-bearing rows (de1da402).
// Bed LZ7F0c on WFH: P 06-01|06-01 -> Q 06-01|06-03 (Q renders 06-02..06-04, so
// Q is DERIVED). Stage ONLY a buffer change on Q. The review row must NOT carry
// "The plan schedules this … — Jira gets the dates above", and the header must
// not count it ("… are scheduled elsewhere in the plan …").
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";
import * as fs from "fs";
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7f0";
const bed = JSON.parse(fs.readFileSync("/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz7f0/bed2.json", "utf8"));
const PLAN = bed.planName, PLAN_ID = bed.planId, Q = bed.Q;
test.describe.configure({ retries: 0, timeout: 1_800_000 });
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");

test("F5b: a buffer-only stage on a derived row prints no drift line", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  console.log("SHELL_REV", ((await bodyText(frame)).match(/rev\s*v?([\d.]+)/) || [])[1]);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(10000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  console.log("STAGED_ON_OPEN", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  console.log("BARS", JSON.stringify(await frame.locator('[data-testid="gantt-bar"]').evaluateAll((els: any[]) =>
    els.map((e) => `${e.getAttribute("data-key")} ${e.getAttribute("data-bar-start")}..${e.getAttribute("data-bar-due")}`))));
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  console.log("ROWS", JSON.stringify(await frame.locator('[data-testid="table-row"]').evaluateAll((els: any[]) =>
    els.map((e) => ({ k: e.getAttribute("data-row-key"), s: e.getAttribute("data-row-start"), d: e.getAttribute("data-row-due"), derived: e.getAttribute("data-row-derived") })))));
  console.log("DERIVED_CHIPS", JSON.stringify(await frame.locator('[data-testid="table-derived-chip"]').evaluateAll((els: any[]) =>
    els.map((e) => `${e.getAttribute("data-key")}=${e.getAttribute("data-reason")}`))));
  await frame.locator(`[title="Select ${Q}"]`).first().dispatchEvent("click");
  await page.waitForTimeout(800);
  await frame.locator("button").filter({ hasText: /^Yes$/ }).last().dispatchEvent("click");
  await page.waitForTimeout(4500);
  const t = await bodyText(frame);
  console.log("STAGED_AFTER_BULK", (t.match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/gi) || []).join(" | "));
  console.log("REFUSAL", JSON.stringify((t.match(/[^.·]*nothing was staged[^.·]*/i) || [])[0] ?? null));
  await page.screenshot({ path: `${OUT}/f5b-00-staged.png` });
  await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click").catch((e: any) => console.log("APPLY_ERR", String(e).slice(0, 100)));
  await page.waitForTimeout(3500);
  const rows = await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) =>
    els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })));
  console.log("REVIEW_ROWS", JSON.stringify(rows, null, 1));
  const modal = (await frame.locator('[role="dialog"]').first().textContent().catch(() => "")).replace(/\s+/g, " ");
  console.log("MODAL_TEXT", modal.slice(0, 1200));
  console.log("DRIFT_LINE_PRESENT", /The plan schedules this/.test(modal));
  console.log("DRIFT_NOTE_PRESENT", /scheduled elsewhere in the plan/.test(modal));
  console.log("Q_ROW_HAS_DRIFT", rows.filter((r: any) => r.key === Q).map((r: any) => /The plan schedules this/.test(r.text)));
  await page.screenshot({ path: `${OUT}/f5b-01-review.png` });
  await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click").catch((e: any) => console.log("DISCARD_ERR", String(e).slice(0, 100)));
  await page.waitForTimeout(13000);
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  const p: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  console.log("FINAL_ROWS", JSON.stringify((p.issues || []).map((i: any) => `${i.key} ${i.startDate}|${i.dueDate}|${i.duration}|${i.buffer} orig ${i._original?.duration}|${i._original?.buffer}`)));
});
