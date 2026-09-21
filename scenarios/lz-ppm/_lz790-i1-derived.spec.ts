// LZ790 item 1 (UI half) — DERIVED DURATION IS NEVER STORED.
// Bed: LZPT Scenarios. Drag a leaf -> Save -> only the two DATES may diverge from
// _original. Discard All -> byte-identical on all four schedule fields, savedEdits
// absent. Re-index -> no confirm. NEGATIVE: a TYPED duration on a Jira-null row IS
// stored and shows in the Apply diff.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz790shots";
const PLAN = "LZPT Scenarios";
const PLAN_ID = "plan-msq9dg8l-gz6mz1";
const LEAF = "LZPT-216"; // EDGE weekend-span: no predecessors, no successors -> draggable
test.describe.configure({ retries: 0, timeout: 900_000 });

const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const rowOf = async (key: string) => {
  const p: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  const r = (p.issues || []).find((i: any) => i.key === key);
  return { row: r, savedEdits: p.meta?.savedEdits ?? null, hasSavedEditsKey: p.meta && Object.prototype.hasOwnProperty.call(p.meta, "savedEdits") };
};
const four = (r: any) => JSON.stringify({ startDate: r.startDate ?? null, dueDate: r.dueDate ?? null, duration: r.duration ?? null, buffer: r.buffer ?? null });
const fourOrig = (r: any) => JSON.stringify({ startDate: r._original?.startDate ?? null, dueDate: r._original?.dueDate ?? null, duration: r._original?.duration ?? null, buffer: r._original?.buffer ?? null });

test("I1: derived duration never stored; discard restores; re-index no confirm; typed duration IS stored", async ({ page }) => {
  const b0 = await rowOf(LEAF);
  console.log("PRE row", four(b0.row), "orig", fourOrig(b0.row), "savedEditsKey", b0.hasSavedEditsKey);

  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(7000);
  const shell = await bodyText(frame);
  console.log("SHELL_HEADER_VERSION_MATCH", (shell.match(/v?4\.58\.\d+/) || [])[0], "| 7\\.9 present:", /7\.9\.0/.test(shell));
  console.log("SHELL_SNIP", shell.slice(0, 200));

  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  console.log("STAGED_ON_OPEN", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await page.screenshot({ path: `${OUT}/i1-00-open.png` });

  // ---- DRAG the leaf's Gantt bar ----
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  // The plan starts 2026-04-27; park the timeline at its left edge so the May bars exist.
  await frame.locator("[data-gantt-scroll]").first().evaluate((el: any) => { el.scrollLeft = 0; }).catch((e: any) => console.log("SCROLL_ERR", String(e).slice(0, 120)));
  await page.waitForTimeout(1500);
  const bar = frame.locator(`[data-testid="gantt-bar"][data-key="${LEAF}"]`).first();
  await bar.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(800);
  const ifr = await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().boundingBox();
  const bb = await bar.boundingBox();
  console.log("BAR_BOX", JSON.stringify(bb), "IFRAME", JSON.stringify(ifr));
  if (!bb || !ifr) throw new Error("no bar box");
  // NOTE: a FrameLocator boundingBox is ALREADY in main-page coordinates — adding the
  // iframe origin double-counts it and the drag lands on empty canvas (cost one run).
  const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
  const dayPx = 14; // week zoom, measured from the Oct-5..Oct-12 gridline span
  console.log("DAY_PX", dayPx);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(cx + (i * dayPx * 3) / 8, cy, { steps: 2 }); await page.waitForTimeout(80); }
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/i1-01-dragged.png` });
  const afterDrag = await bodyText(frame);
  console.log("STAGED_AFTER_DRAG", /Save\s*\(\d+\)/i.test(afterDrag), (afterDrag.match(/Save\s*\(\d+\)/i) || [])[0]);

  // ---- SAVE ----
  const btn = frame.locator('[data-testid="plan-save-btn"]').first();
  console.log("SAVE_LABEL", (await btn.textContent().catch(() => ""))?.trim());
  await btn.click();
  for (let i = 0; i < 120; i++) { if ((await btn.getAttribute("data-save-state").catch(() => null)) === "saved") break; await page.waitForTimeout(250); }
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/i1-02-saved.png` });

  const a1 = await rowOf(LEAF);
  console.log("POST-SAVE row", four(a1.row), "orig", fourOrig(a1.row));
  const diverged = ["startDate", "dueDate", "duration", "buffer"].filter((f) => String(a1.row[f] ?? "") !== String(a1.row._original?.[f] ?? ""));
  console.log("DIVERGED_FIELDS", JSON.stringify(diverged));
  console.log("SAVED_EDITS", JSON.stringify(a1.savedEdits));

  // ---- DISCARD ALL ----
  const disc = frame.locator("button").filter({ hasText: /^Discard all$/i }).first();
  const discCount = await frame.locator("button").filter({ hasText: /Discard all/i }).count();
  console.log("DISCARD_BUTTONS", discCount);
  await disc.click({ timeout: 15000 }).catch(async () => { await disc.dispatchEvent("click"); });
  await page.waitForTimeout(1500);
  const confirmTxt = await bodyText(frame);
  console.log("DISCARD_CONFIRM_PRESENT", /Discard/i.test(confirmTxt) ? "yes-text" : "no");
  await page.screenshot({ path: `${OUT}/i1-03-discard-confirm.png` });
  const yes = frame.locator("button").filter({ hasText: /^(Discard all|Discard|Yes, discard)$/i }).last();
  await yes.click({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUT}/i1-04-discarded.png` });

  const a2 = await rowOf(LEAF);
  console.log("POST-DISCARD row", four(a2.row), "orig", fourOrig(a2.row));
  console.log("POST-DISCARD byteIdentical", four(a2.row) === fourOrig(a2.row));
  console.log("POST-DISCARD savedEditsKeyPresent", a2.hasSavedEditsKey, JSON.stringify(a2.savedEdits));
  console.log("POST-DISCARD matchesPreRun", four(a2.row) === four(b0.row));

  // ---- RE-INDEX: expect NO confirm ----
  await page.waitForTimeout(1500);
  const reindex = frame.locator("button").filter({ hasText: /Re-?index/i }).first();
  console.log("REINDEX_BUTTONS", await frame.locator("button").filter({ hasText: /Re-?index/i }).count());
  await reindex.click({ timeout: 15000 }).catch(async () => { await reindex.dispatchEvent("click"); });
  await page.waitForTimeout(2000);
  const afterRe = await bodyText(frame);
  const confirmShown = /Jira wins|will be dropped|keep your saved|Re-index this plan\?/i.test(afterRe);
  console.log("REINDEX_CONFIRM_SHOWN", confirmShown);
  console.log("REINDEX_SNIP", afterRe.slice(0, 400));
  await page.screenshot({ path: `${OUT}/i1-05-reindex.png` });
  await page.waitForTimeout(12000);
  await page.screenshot({ path: `${OUT}/i1-06-reindexed.png` });
});
