// LZ7B0 item 1 (C) + item 2 (A) first half — dev 7.11.0 / UI v4.58.648.
// Drag LZPT-216 (no preds/succs) by ONE working day in the Gantt, Save, then:
//   (A) ?what=plan: start/due diverge from _original, `duration` NOT stored (null),
//       yet the Table/Gantt still SHOW a duration (span re-derived, not blank).
//   (C) the Apply review row prints Start:/Due: ONLY — no `Dur:` line, no bare `d`;
//       the Apply count is 1; the bar carries the amber "changed" outline.
// Then the CONTROL: type duration 3 on LZPT-215 (Jira null) -> `Dur: 42 -> 3d`.
// Discard All after each. NEVER applies to Jira.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7b0";
const PLAN = "LZPT Scenarios";
const PLAN_ID = "plan-msq9dg8l-gz6mz1";
const LEAF = "LZPT-216";   // EDGE weekend-span 2026-05-08 -> 2026-05-12 (3 wd)
const TYPED = "LZPT-215";  // EDGE long-run  2026-05-04 -> 2026-06-30 (42 wd), Jira duration null
test.describe.configure({ retries: 0, timeout: 900_000 });

const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const snap = async () => {
  const p: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  const rows: any = {};
  for (const i of p.issues || []) rows[i.key] = {
    s: i.startDate ?? null, d: i.dueDate ?? null, du: i.duration ?? null, b: i.buffer ?? null,
    os: i._original?.startDate ?? null, od: i._original?.dueDate ?? null, odu: i._original?.duration ?? null, ob: i._original?.buffer ?? null,
    dec: i.durationExplicitlyCleared === true,
  };
  return { n: (p.issues || []).length, rows, savedEditsKey: p.meta && Object.prototype.hasOwnProperty.call(p.meta, "savedEdits"), savedEdits: p.meta?.savedEdits ?? null };
};
const carriers = (s: any) => Object.entries(s.rows).filter(([, r]: any) => r.s !== r.os || r.d !== r.od || String(r.du ?? "") !== String(r.odu ?? "") || String(r.b ?? "") !== String(r.ob ?? "")).map(([k, r]) => [k, r]);
const decRows = (s: any) => Object.entries(s.rows).filter(([, r]: any) => r.dec).map(([k]) => k);

test("I1: drag->Save->Apply review has Start/Due only; duration shown but not stored; typed-3 control", async ({ page }) => {
  const pre = await snap();
  console.log("PRE n", pre.n, "carriers", JSON.stringify(carriers(pre)), "DEC", JSON.stringify(decRows(pre)), "savedEditsKey", pre.savedEditsKey);
  console.log("PRE 216", JSON.stringify(pre.rows[LEAF]), "215", JSON.stringify(pre.rows[TYPED]));

  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  await page.waitForTimeout(8000);
  const shell = await bodyText(frame);
  console.log("SHELL_REV", (shell.match(/rev\s*v?([\d.]+)/) || [])[1], "| raw:", (shell.match(/rev[^·]{0,20}/) || [])[0]);

  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(7000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  console.log("STAGED_ON_OPEN", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  await frame.locator("[data-gantt-scroll]").first().evaluate((el: any) => { el.scrollLeft = 0; }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/i1-00-open.png` });

  // ---- px-per-CALENDAR-day from the bars' OWN left offsets AND their RENDERED dates.
  // The Gantt draws SETTLED dates, so a bar's stored start is not where it is painted
  // (LZPT-217 has a predecessor and paints in June): read data-bar-start, never assume.
  const anchor = async (k: string) => await frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first()
    .evaluate((el: any) => ({ left: parseFloat(el.style.left), start: el.getAttribute("data-bar-start") }));
  const dayNum = (iso: string | null) => (iso ? Math.round(new Date(`${iso}T00:00:00Z`).getTime() / 86400000) : NaN);
  const aA = await anchor("LZPT-218");
  const aB = await anchor("LZPT-226");
  let dayPx = (aB.left - aA.left) / (dayNum(aB.start) - dayNum(aA.start));
  console.log("ANCHORS", JSON.stringify(aA), JSON.stringify(aB), "DAY_PX_INITIAL", dayPx);

  const bar = frame.locator(`[data-testid="gantt-bar"][data-key="${LEAF}"]`).first();
  await bar.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(600);
  const startOf = async () => await bar.getAttribute("data-bar-start");
  console.log("BAR_BEFORE", await startOf(), await bar.getAttribute("data-bar-due"));

  const dragPx = async (dx: number) => {
    await bar.scrollIntoViewIfNeeded().catch(() => {});
    const bb = await bar.boundingBox(); if (!bb) throw new Error("no bar box");
    const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(cx + (i * dx) / 8, cy, { steps: 2 }); await page.waitForTimeout(70); }
    await page.waitForTimeout(350); await page.mouse.up(); await page.waitForTimeout(2200);
  };

  // 2026-05-08 (Fri) + 1 working day = 2026-05-11 (Mon) = +3 calendar days.
  const TARGET = dayNum("2026-05-11");
  for (let attempt = 0; attempt < 10; attempt++) {
    const before = dayNum(await startOf());
    const need = TARGET - before;
    if (need === 0) break;
    // Cap each drag: a long drag auto-scrolls the timeline and travels further
    // than its pixels say (measured: -305 px moved 58 calendar days).
    const dx = Math.max(-150, Math.min(150, need * dayPx));
    console.log(`DRAG attempt=${attempt} from=${before} need=${need}d dayPx=${dayPx.toFixed(2)} dx=${dx.toFixed(1)}`);
    await dragPx(dx);
    const after = dayNum(await startOf());
    console.log("  -> now", await startOf(), "moved", after - before);
    if (after !== before) dayPx = dx / (after - before);
  }
  console.log("BAR_AFTER_DRAG", await startOf(), await bar.getAttribute("data-bar-due"), "DAY_PX_FINAL", dayPx);
  await page.screenshot({ path: `${OUT}/i1-01-dragged.png` });
  const afterDrag = await bodyText(frame);
  console.log("STAGED_AFTER_DRAG", (afterDrag.match(/Save\s*\(\d+\)/i) || [])[0], (afterDrag.match(/Apply\s+\d+\s+change\w*/i) || [])[0]);
  const stagedKeys = await frame.locator('[data-testid="gantt-bar"]').evaluateAll((els: any[]) => els.filter((e) => getComputedStyle(e).outlineColor === "rgb(217, 119, 6)").map((e) => e.getAttribute("data-key")));
  console.log("AMBER_BARS", JSON.stringify(stagedKeys));

  // ---- bar colour: amber draft outline ----
  const outline = await frame.locator(`[data-testid="gantt-bar"][data-key="${LEAF}"]`).first()
    .evaluate((el: any) => { const c = getComputedStyle(el); return { outline: c.outline, outlineColor: c.outlineColor, bg: c.backgroundImage }; });
  console.log("BAR_STYLE_AFTER_DRAG", JSON.stringify(outline));

  // ---- SAVE ----
  const btn = frame.locator('[data-testid="plan-save-btn"]').first();
  console.log("SAVE_LABEL", (await btn.textContent().catch(() => ""))?.trim());
  await btn.click({ timeout: 20000 });
  for (let i = 0; i < 200; i++) { if ((await btn.getAttribute("data-save-state").catch(() => null)) === "saved") break; await page.waitForTimeout(250); }
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/i1-02-saved.png` });

  const post = await snap();
  console.log("POST-SAVE 216", JSON.stringify(post.rows[LEAF]));
  console.log("POST-SAVE carriers", JSON.stringify(carriers(post)));
  console.log("POST-SAVE DEC_ROWS", JSON.stringify(decRows(post)), "of", post.n);
  console.log("POST-SAVE savedEditsKey", post.savedEditsKey, JSON.stringify(post.savedEdits));

  // ---- (A) the row still SHOWS a duration on Table AND Gantt ----
  const barTip = await frame.locator(`[data-testid="gantt-bar"][data-key="${LEAF}"]`).first().getAttribute("data-bar-due");
  console.log("GANTT_BAR_DUE_AFTER_SAVE", barTip);
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  await realFrame!.waitForFunction(() => Array.from(document.querySelectorAll('[data-testid="table-row"]')).filter((el) => (el.getAttribute("data-row-duration") || "") !== "").length >= 30, undefined, { timeout: 90_000 }).catch(() => console.log("NORMALIZE_TIMEOUT"));
  const trow = frame.locator(`[data-testid="table-row"][data-row-key="${LEAF}"]`).first();
  await trow.scrollIntoViewIfNeeded().catch(() => {});
  console.log("TABLE_216_AFTER_SAVE start/due/dur =", await trow.getAttribute("data-row-start"), await trow.getAttribute("data-row-due"), "|", JSON.stringify(await trow.getAttribute("data-row-duration")));
  console.log("TABLE_216_TEXT", ((await trow.textContent()) || "").replace(/\s+/g, " ").slice(0, 200));
  const bbT = await trow.boundingBox();
  if (bbT) await page.screenshot({ path: `${OUT}/i1-03-table-216.png`, clip: { x: Math.max(0, bbT.x - 10), y: Math.max(0, bbT.y - 60), width: Math.min(1400, bbT.width + 20), height: 130 } });
  await page.screenshot({ path: `${OUT}/i1-03b-table-full.png` });

  // ---- (C) the Apply review ----
  const applyBtn = frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first();
  console.log("APPLY_BTN_TEXT", ((await applyBtn.textContent().catch(() => "")) || "").trim());
  await applyBtn.dispatchEvent("click");
  await page.waitForTimeout(3000);
  const rowsInModal = await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })));
  console.log("APPLY_DIFF_ROWS", JSON.stringify(rowsInModal, null, 1));
  console.log("MODAL_TEXT", (await bodyText(frame)).match(/Review changes[\s\S]{0,400}/)?.[0]);
  await page.screenshot({ path: `${OUT}/i1-04-apply-modal.png` });

  // ---- DISCARD ALL from inside the review modal (round 1) ----
  const discard = async (tag: string) => {
    const n = await frame.locator("button").filter({ hasText: /^Discard All$/ }).count();
    console.log(tag, "DISCARD_ALL_BUTTONS", n);
    await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click");
    await page.waitForTimeout(10000);
  };
  await discard("R1");
  await page.screenshot({ path: `${OUT}/i1-05-discarded.png` });
  const d1 = await snap();
  console.log("POST-DISCARD1 216", JSON.stringify(d1.rows[LEAF]));
  console.log("POST-DISCARD1 carriers", JSON.stringify(carriers(d1)));
  console.log("POST-DISCARD1 DEC_ROWS", JSON.stringify(decRows(d1)), "of", d1.n);
  console.log("POST-DISCARD1 savedEditsKey", d1.savedEditsKey, JSON.stringify(d1.savedEdits));
  console.log("POST-DISCARD1 STAGED", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));

  // ---- CONTROL: type duration 3 on LZPT-215 ----
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  const row215 = frame.locator(`[data-testid="table-row"][data-row-key="${TYPED}"]`).first();
  await row215.scrollIntoViewIfNeeded().catch(() => {});
  console.log("215_BEFORE_TYPE start/due/dur", await row215.getAttribute("data-row-start"), await row215.getAttribute("data-row-due"), JSON.stringify(await row215.getAttribute("data-row-duration")));
  const durCell = row215.locator("div").filter({ hasText: /^\d+d$/ }).last();
  await durCell.dispatchEvent("click");
  await page.waitForTimeout(800);
  const input = row215.locator('input[inputmode="numeric"]').first();
  console.log("EDITOR_OPEN", await input.count());
  await input.fill("3");
  await input.press("Enter");
  await page.waitForTimeout(2500);
  console.log("215_AFTER_TYPE start/due/dur", await row215.getAttribute("data-row-start"), await row215.getAttribute("data-row-due"), JSON.stringify(await row215.getAttribute("data-row-duration")));
  await page.screenshot({ path: `${OUT}/i1-06-typed3.png` });

  const applyBtn2 = frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first();
  console.log("APPLY_BTN_TEXT_2", ((await applyBtn2.textContent().catch(() => "")) || "").trim());
  await applyBtn2.dispatchEvent("click");
  await page.waitForTimeout(3000);
  const rows2 = await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })));
  console.log("APPLY_DIFF_TYPED", JSON.stringify(rows2, null, 1));
  await page.screenshot({ path: `${OUT}/i1-07-apply-typed.png` });

  // ---- DISCARD ALL from inside the modal (round 2) ----
  await discard("R2");
  await page.screenshot({ path: `${OUT}/i1-08-final.png` });
  const fin = await snap();
  console.log("FINAL 215", JSON.stringify(fin.rows[TYPED]), "216", JSON.stringify(fin.rows[LEAF]));
  console.log("FINAL carriers", JSON.stringify(carriers(fin)));
  console.log("FINAL DEC_ROWS", JSON.stringify(decRows(fin)), "of", fin.n);
  console.log("FINAL savedEditsKey", fin.savedEditsKey, JSON.stringify(fin.savedEdits));
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
});
