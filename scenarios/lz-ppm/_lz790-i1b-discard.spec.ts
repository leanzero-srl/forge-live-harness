// LZ790 item 1 (part b) — DISCARD ALL restores the row byte-identically on all four
// schedule fields and clears meta.savedEdits; Re-index then raises NO confirm.
// Then the NEGATIVE: a TYPED duration on a Jira-null row IS stored and IS in the Apply diff.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz790shots";
const PLAN = "LZPT Scenarios";
const PLAN_ID = "plan-msq9dg8l-gz6mz1";
const LEAF = "LZPT-216";
const TYPED = "LZPT-215"; // EDGE long-run, Jira duration null, no preds/succs
test.describe.configure({ retries: 0, timeout: 900_000 });

const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const snap = async () => {
  const p: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  const rows: any = {};
  for (const i of p.issues || []) rows[i.key] = { s: i.startDate ?? null, d: i.dueDate ?? null, du: i.duration ?? null, b: i.buffer ?? null, os: i._original?.startDate ?? null, od: i._original?.dueDate ?? null, odu: i._original?.duration ?? null, ob: i._original?.buffer ?? null };
  return { rows, savedEditsKey: p.meta && Object.prototype.hasOwnProperty.call(p.meta, "savedEdits"), savedEdits: p.meta?.savedEdits ?? null };
};
const carriers = (s: any) => Object.entries(s.rows).filter(([, r]: any) => r.s !== r.os || r.d !== r.od || String(r.du ?? "") !== String(r.odu ?? "") || String(r.b ?? "") !== String(r.ob ?? "")).map(([k, r]: any) => [k, r]);

test("I1b: Discard All restores; re-index no confirm; typed duration IS stored", async ({ page }) => {
  console.log("PRE carriers", JSON.stringify(carriers(await snap())));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(7000);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  let t = await bodyText(frame);
  console.log("APPLY_BUTTON_TEXT", (t.match(/Apply\s+\d+\s+[Cc]hange\w*/) || [])[0]);

  // --- open the Apply review, screenshot the diff, Discard All ---
  const applyBtn = frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first();
  await applyBtn.dispatchEvent("click");
  await page.waitForTimeout(3000);
  const modal = frame.locator('[data-testid="apply-review-modal"]');
  console.log("MODAL_PRESENT", await modal.count());
  const rowsInModal = await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ").slice(0, 160) })));
  console.log("APPLY_DIFF_ROWS", JSON.stringify(rowsInModal, null, 1));
  await page.screenshot({ path: `${OUT}/i1b-01-apply-modal.png` });
  await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click");
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${OUT}/i1b-02-discarded.png` });
  const after = await snap();
  console.log("POST-DISCARD carriers", JSON.stringify(carriers(after)));
  console.log("POST-DISCARD savedEditsKey", after.savedEditsKey, JSON.stringify(after.savedEdits));

  // --- RE-INDEX: expect NO confirm dialog ---
  const reindex = frame.locator("button").filter({ hasText: /Re-?index/i }).first();
  await reindex.dispatchEvent("click");
  await page.waitForTimeout(2500);
  const t2 = await bodyText(frame);
  const confirmShown = /Jira wins|will be dropped|Re-?index this plan\?|keep|discard/i.test(t2.slice(0, 4000)) && /Cancel/i.test(t2);
  console.log("REINDEX_CONFIRM_SHOWN", confirmShown);
  console.log("REINDEX_TEXT_SNIP", t2.slice(0, 500));
  await page.screenshot({ path: `${OUT}/i1b-03-reindex.png` });
  await page.waitForTimeout(20000);
  await page.screenshot({ path: `${OUT}/i1b-04-reindexed.png` });
  console.log("POST-REINDEX carriers", JSON.stringify(carriers(await snap())));

  // --- NEGATIVE: type a duration on a Jira-null row ---
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  const row = frame.locator(`[data-testid="table-row"][data-row-key="${TYPED}"]`).first();
  await row.scrollIntoViewIfNeeded().catch(() => {});
  console.log("TYPED_ROW_BEFORE", await row.getAttribute("data-row-start"), await row.getAttribute("data-row-due"), await row.getAttribute("data-row-duration"));
  const durCell = row.locator("td, div").filter({ hasText: /^\d+d$/ }).last();
  await durCell.click({ timeout: 10000 }).catch(async () => { await durCell.dispatchEvent("click"); });
  await page.waitForTimeout(800);
  const input = row.locator('input[inputmode="numeric"]').first();
  await input.fill("3");
  await input.press("Enter");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/i1b-05-typed3.png` });
  const btn = frame.locator('[data-testid="plan-save-btn"]').first();
  console.log("SAVE_LABEL", (await btn.textContent().catch(() => ""))?.trim());
  await btn.click({ timeout: 20000 });
  for (let i = 0; i < 160; i++) { if ((await btn.getAttribute("data-save-state").catch(() => null)) === "saved") break; await page.waitForTimeout(250); }
  await page.waitForTimeout(2500);
  const typedSnap = await snap();
  console.log("TYPED_ROW_STORED", JSON.stringify(typedSnap.rows[TYPED]));
  console.log("TYPED carriers", JSON.stringify(carriers(typedSnap)));

  const applyBtn2 = frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first();
  await applyBtn2.dispatchEvent("click");
  await page.waitForTimeout(3000);
  const rows2 = await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ").slice(0, 200) })));
  console.log("APPLY_DIFF_AFTER_TYPED", JSON.stringify(rows2, null, 1));
  await page.screenshot({ path: `${OUT}/i1b-06-apply-typed.png` });
  // restore: discard everything again
  await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click");
  await page.waitForTimeout(9000);
  const fin = await snap();
  console.log("FINAL carriers", JSON.stringify(carriers(fin)));
  console.log("FINAL savedEditsKey", fin.savedEditsKey, JSON.stringify(fin.savedEdits));
  console.log("FINAL STAGED", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await page.screenshot({ path: `${OUT}/i1b-07-final.png` });
});
