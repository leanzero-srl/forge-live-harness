// LZ7H0 item 1a — dev 7.17.0 / UI v4.58.654. THE DISCARD FIX (d3687b37).
// Bed LZ7H0 on WFH (created over the REST API):
//   A 2026-06-01|2026-06-02 duration 5  buffer Yes  (Jira DECLARES 5, the span is 2 wd)
//   B 2026-06-01|2026-06-01 duration 10 buffer Yes  (Jira DECLARES 10, the span is 1 wd)
//   D 2026-06-03|2026-06-05 duration 3  buffer No   <- successor of A and B
// Make ONE unrelated edit (D's due +1 working day -> 2026-06-08), Save, Discard All.
// EXPECT: A/B stored durations stay 5/10 with _original 5/10, no
// durationExplicitlyCleared, meta.savedEdits ABSENT. NEVER applies to Jira.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";
import * as fs from "fs";
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7h0";
const bed = JSON.parse(fs.readFileSync("/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz7h0/bed.json", "utf8"));
const { A, B, D, planId: PLAN_ID, planName: PLAN } = bed;
test.describe.configure({ retries: 0, timeout: 1_800_000 });
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const snap = async () => {
  const p: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  const F = ["startDate", "dueDate", "duration", "buffer"];
  const iss = p.issues || [];
  return {
    rows: iss.map((i: any) => `${i.key} ${i.startDate}|${i.dueDate} dur=${JSON.stringify(i.duration)} buf=${i.buffer} ORIG ${i._original?.startDate}|${i._original?.dueDate} dur=${JSON.stringify(i._original?.duration)} cleared=${JSON.stringify(i.durationExplicitlyCleared)}`),
    carriers: iss.filter((i: any) => F.some((f) => String(i[f] ?? "") !== String(i._original?.[f] ?? ""))).map((i: any) => i.key),
    savedEditsKey: p.meta && Object.prototype.hasOwnProperty.call(p.meta, "savedEdits"),
    savedEdits: p.meta?.savedEdits,
    createdByName: p.meta?.createdByName,
  };
};

test("H1a: an unrelated edit + Save + Discard leaves Jira's declared durations alone", async ({ page }) => {
  console.log("PRE", JSON.stringify(await snap(), null, 1));
  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  console.log("SHELL_REV", ((await bodyText(frame)).match(/rev\s*v?([\d.]+)/) || [])[1]);
  // ---- item 3: the plan CARD carries the author's name ----
  const card = frame.locator('[data-testid="plan-card"]').filter({ hasText: PLAN }).first();
  console.log("CARD_COUNT", await frame.locator('[data-testid="plan-card"]').count());
  console.log("CARD_TEXT", ((await card.textContent().catch(() => "")) || "").replace(/\s+/g, " "));
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${OUT}/h-00-cards.png` });
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(10000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  console.log("STAGED_ON_OPEN", ((await bodyText(frame)).match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/gi) || []).join(" | "));
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  const readTable = async (tag: string) => {
    const rows = await frame.locator('[data-testid="table-row"]').evaluateAll((els: any[]) =>
      els.map((e) => ({ k: e.getAttribute("data-row-key"), s: e.getAttribute("data-row-start"), d: e.getAttribute("data-row-due"), dur: e.getAttribute("data-row-duration"), derived: e.getAttribute("data-row-derived"), text: (e.textContent || "").replace(/\s+/g, " ") })));
    console.log(tag, "TABLE", JSON.stringify(rows, null, 1));
    return rows;
  };
  await readTable("AT_REST");
  console.log("DERIVED_CHIPS", JSON.stringify(await frame.locator('[data-testid="table-derived-chip"]').evaluateAll((els: any[]) => els.map((e) => `${e.getAttribute("data-key")}=${e.getAttribute("data-reason")}`))));
  await page.screenshot({ path: `${OUT}/h-01-table-at-rest.png` });

  // ---- ONE unrelated edit: D's due 2026-06-05 -> 2026-06-08 (next working day) ----
  const trow = frame.locator(`[data-testid="table-row"][data-row-key="${D}"]`).first();
  await trow.scrollIntoViewIfNeeded().catch(() => {});
  const cells = trow.locator("div").filter({ hasText: /^Jun \d+$/ });
  console.log("DATE_CELLS", await cells.count());
  await cells.nth(1).dispatchEvent("click");
  await page.waitForTimeout(1500);
  console.log("PICKER", await frame.locator(".lz-datepicker").count(), "DAYBTN", await frame.locator('button[aria-label="2026-06-08"]').count());
  await page.screenshot({ path: `${OUT}/h-02-picker.png` });
  await frame.locator('button[aria-label="2026-06-08"]').first().dispatchEvent("click");
  await page.waitForTimeout(4000);
  await readTable("AFTER_EDIT");
  console.log("STAGED_AFTER_EDIT", ((await bodyText(frame)).match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/gi) || []).join(" | "));
  await page.screenshot({ path: `${OUT}/h-03-edited.png` });
  // review it, then cancel
  await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click");
  await page.waitForTimeout(3500);
  console.log("REVIEW_ROWS", JSON.stringify(await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") }))), null, 1));
  await page.screenshot({ path: `${OUT}/h-04-review.png` });
  await frame.locator("button").filter({ hasText: /^Cancel$/ }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(2000);

  // ---- SAVE ----
  const btn = frame.locator('[data-testid="plan-save-btn"]').first();
  console.log("SAVE_LABEL_BEFORE", ((await btn.textContent().catch(() => "")) || "").trim());
  await btn.click({ timeout: 30000 }).catch((e: any) => console.log("SAVE_CLICK_ERR", String(e).slice(0, 80)));
  for (let i = 0; i < 240; i++) { if ((await btn.getAttribute("data-save-state").catch(() => null)) === "saved") break; await page.waitForTimeout(250); }
  await page.waitForTimeout(8000);
  console.log("SAVE_LABEL_AFTER", ((await btn.textContent().catch(() => "")) || "").trim(), await btn.getAttribute("data-save-state").catch(() => null));
  console.log("POSTSAVE", JSON.stringify(await snap(), null, 1));
  await page.screenshot({ path: `${OUT}/h-05-saved.png` });

  // ---- DISCARD ALL ----
  await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click");
  await page.waitForTimeout(3000);
  await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click");
  await page.waitForTimeout(5000);
  console.log("POSTDISCARD_5s", JSON.stringify(await snap(), null, 1));
  await page.waitForTimeout(10000);
  console.log("POSTDISCARD_15s", JSON.stringify(await snap(), null, 1));
  await readTable("AFTER_DISCARD");
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await page.screenshot({ path: `${OUT}/h-06-discarded.png` });
});
