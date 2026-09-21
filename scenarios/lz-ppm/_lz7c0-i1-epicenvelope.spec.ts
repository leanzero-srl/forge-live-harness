// LZ7C0 items 1 + 2 + 3 + 7 — dev 7.12.0 / UI v4.58.649, bed "LZPT Scenarios".
// LZPT-215 (EDGE long-run, 2026-05-04 -> 2026-06-30, 42 wd derived, Jira duration
// NULL) is the only child that sets BOTH ends of its undated Epic LZPT-190's
// envelope. Drag it one working day and:
//   (2) the Apply review prints the EPIC's Start/Due (parent dates ARE written) and
//       NO `Dur:` line for the Epic;
//   (7)+(1) Save -> meta.savedEdits PRESENT <=5 s; ?what=plan: LZPT-190 duration
//       stays null, NO durationExplicitlyCleared on ANY of the 70 rows, no stored
//       duration on any Epic;
//   (1) Discard All -> the same 70-row scan clean, savedEdits ABSENT <=5 s.
//   (3) then type duration 3 on LZPT-215 -> review must read `Dur: none -> 3d`
//       (42 is DERIVED; Jira holds nothing), Discard All.
// NEVER applies to Jira.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7c0";
const PLAN = "LZPT Scenarios";
const PLAN_ID = "plan-msq9dg8l-gz6mz1";
const LEAF = "LZPT-215";
const EPIC = "LZPT-190";
test.describe.configure({ retries: 0, timeout: 1_500_000 });

const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const EPICS = ["LZPT-186", "LZPT-187", "LZPT-188", "LZPT-189", "LZPT-190", "LZPT-191"];
const snap = async () => {
  const p: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  const F = ["startDate", "dueDate", "duration", "buffer"];
  const iss = p.issues || [];
  const rows: any = {};
  for (const i of iss) rows[i.key] = { s: i.startDate ?? null, d: i.dueDate ?? null, du: i.duration ?? null };
  return {
    n: iss.length,
    dec: iss.filter((i: any) => i.durationExplicitlyCleared === true).map((i: any) => i.key),
    decAnyTruthy: iss.filter((i: any) => "durationExplicitlyCleared" in i && i.durationExplicitlyCleared).map((i: any) => i.key),
    decKeyPresent: iss.filter((i: any) => Object.prototype.hasOwnProperty.call(i, "durationExplicitlyCleared")).map((i: any) => `${i.key}=${JSON.stringify(i.durationExplicitlyCleared)}`),
    storedDur: iss.filter((i: any) => i.duration !== null && i.duration !== undefined).map((i: any) => `${i.key}=${i.duration}`),
    epicDur: EPICS.map((k) => `${k}=${JSON.stringify(rows[k]?.du)}`),
    carriers: iss.filter((i: any) => F.some((f) => String(i[f] ?? "") !== String(i._original?.[f] ?? ""))).map((i: any) => `${i.key}:${i.startDate}/${i.dueDate}/${i.duration}`),
    rows,
    savedEditsKey: p.meta && Object.prototype.hasOwnProperty.call(p.meta, "savedEdits"),
    savedEdits: p.meta?.savedEdits ?? null,
  };
};
const mark = async () => {
  const p: any = await getTestState("lz-ppm", { what: "planMeta", planId: PLAN_ID });
  return { has: p.meta && Object.prototype.hasOwnProperty.call(p.meta, "savedEdits"), at: p.meta?.savedEdits?.at ?? null };
};
const pollMark = async (tag: string, want: "present" | "absent", ms = 20000) => {
  const t0 = Date.now(); let last: any = null;
  while (Date.now() - t0 < ms) {
    last = await mark();
    if (want === "present" ? !!last.at : !last.has) { console.log(`${tag} -> ${want} after ${Date.now() - t0}ms`, JSON.stringify(last)); return Date.now() - t0; }
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(`${tag} -> STILL NOT ${want} after ${ms}ms`, JSON.stringify(last));
  return -1;
};
const applyRows = async (frame: any) => await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })));

test("C1: epic envelope review, no Dur for the epic, discard is clean, typed-3 baseline", async ({ page }) => {
  const pre = await snap();
  console.log("PRE", JSON.stringify({ n: pre.n, dec: pre.dec, storedDur: pre.storedDur, carriers: pre.carriers, savedEditsKey: pre.savedEditsKey }));
  console.log("PRE 215", JSON.stringify(pre.rows[LEAF]), "190", JSON.stringify(pre.rows[EPIC]));

  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  const shell = await bodyText(frame);
  console.log("SHELL_REV", (shell.match(/rev\s*v?([\d.]+)/) || [])[1], "| raw:", (shell.match(/rev[^·]{0,20}/) || [])[0]);

  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  console.log("STAGED_ON_OPEN", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  await frame.locator("[data-gantt-scroll]").first().evaluate((el: any) => { el.scrollLeft = 0; }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/c1-00-open.png` });

  const dayNum = (iso: string | null) => (iso ? Math.round(new Date(`${iso}T00:00:00Z`).getTime() / 86400000) : NaN);
  const anchor = async (k: string) => await frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first()
    .evaluate((el: any) => ({ left: parseFloat(el.style.left), start: el.getAttribute("data-bar-start") }));
  const aA = await anchor("LZPT-218"), aB = await anchor("LZPT-226");
  let dayPx = (aB.left - aA.left) / (dayNum(aB.start) - dayNum(aA.start));
  console.log("ANCHORS", JSON.stringify(aA), JSON.stringify(aB), "DAY_PX", dayPx);
  console.log("EPIC_BAR_BEFORE", await frame.locator(`[data-testid="gantt-bar"][data-key="${EPIC}"]`).first().getAttribute("data-bar-start").catch(() => "none"),
    await frame.locator(`[data-testid="gantt-bar"][data-key="${EPIC}"]`).first().getAttribute("data-bar-due").catch(() => "none"));

  const bar = frame.locator(`[data-testid="gantt-bar"][data-key="${LEAF}"]`).first();
  const TARGET = dayNum("2026-05-05");
  for (let attempt = 0; attempt < 10; attempt++) {
    await bar.scrollIntoViewIfNeeded().catch(() => {});
    const before = dayNum(await bar.getAttribute("data-bar-start"));
    const need = TARGET - before;
    if (need === 0) break;
    const dx = Math.max(-150, Math.min(150, need * dayPx));
    const bb = await bar.boundingBox(); if (!bb) throw new Error("no bar box");
    const cx = Math.min(bb.x + 40, bb.x + bb.width / 2), cy = bb.y + bb.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(cx + (i * dx) / 8, cy, { steps: 2 }); await page.waitForTimeout(70); }
    await page.waitForTimeout(350); await page.mouse.up(); await page.waitForTimeout(2200);
    const after = dayNum(await bar.getAttribute("data-bar-start"));
    console.log(`DRAG ${attempt}: ${before} -> ${after} (need ${need}, dx ${dx.toFixed(0)})`);
    if (after !== before) dayPx = dx / (after - before);
  }
  console.log("BAR_AFTER_DRAG", await bar.getAttribute("data-bar-start"), await bar.getAttribute("data-bar-due"));
  console.log("EPIC_BAR_AFTER", await frame.locator(`[data-testid="gantt-bar"][data-key="${EPIC}"]`).first().getAttribute("data-bar-start").catch(() => "none"),
    await frame.locator(`[data-testid="gantt-bar"][data-key="${EPIC}"]`).first().getAttribute("data-bar-due").catch(() => "none"));
  await page.screenshot({ path: `${OUT}/c1-01-dragged.png` });
  console.log("STAGED_AFTER_DRAG", ((await bodyText(frame)).match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/i) || [])[0]);

  // ---- (2) the review BEFORE saving ----
  const openReview = async (tag: string) => {
    const b = frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first();
    console.log(tag, "APPLY_BTN", ((await b.textContent().catch(() => "")) || "").trim());
    await b.dispatchEvent("click");
    await page.waitForTimeout(3500);
    const r = await applyRows(frame);
    console.log(tag, "APPLY_DIFF_ROWS", JSON.stringify(r, null, 1));
    return r;
  };
  const r1 = await openReview("R1");
  await page.screenshot({ path: `${OUT}/c1-02-review.png`, fullPage: false });
  const epicRow = r1.find((x: any) => x.key === EPIC);
  console.log("EPIC_ROW_IN_REVIEW", JSON.stringify(epicRow));
  console.log("EPIC_HAS_DUR_LINE", !!epicRow && /Dur\s*:/i.test(epicRow.text));
  console.log("EPIC_HAS_START", !!epicRow && /Start\s*:/i.test(epicRow.text), "HAS_DUE", !!epicRow && /Due\s*:/i.test(epicRow.text));
  console.log("ANY_DUR_LINE", JSON.stringify(r1.filter((x: any) => /Dur\s*:/i.test(x.text)).map((x: any) => x.key)));
  // close the modal without discarding
  await frame.locator("button").filter({ hasText: /^Cancel$/ }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(1800);

  // ---- (7) SAVE -> mark present ----
  const btn = frame.locator('[data-testid="plan-save-btn"]').first();
  console.log("SAVE_LABEL", ((await btn.textContent().catch(() => "")) || "").trim());
  const tSave = Date.now();
  await btn.click({ timeout: 30000 });
  for (let i = 0; i < 240; i++) { if ((await btn.getAttribute("data-save-state").catch(() => null)) === "saved") break; await page.waitForTimeout(250); }
  console.log("SAVE_STATE_MS", Date.now() - tSave);
  const msPresent = await pollMark("MARK_AFTER_SAVE", "present", 20000);
  console.log("B_MARK_PRESENT_MS", msPresent, "<=5000?", msPresent >= 0 && msPresent <= 5000);
  await page.waitForTimeout(2000);
  const post = await snap();
  console.log("POST-SAVE 215", JSON.stringify(post.rows[LEAF]), "190", JSON.stringify(post.rows[EPIC]));
  console.log("POST-SAVE carriers", JSON.stringify(post.carriers));
  console.log("POST-SAVE DEC", JSON.stringify(post.dec), "DEC_KEY_PRESENT", JSON.stringify(post.decKeyPresent));
  console.log("POST-SAVE STORED_DUR", JSON.stringify(post.storedDur), "EPIC_DUR", JSON.stringify(post.epicDur), "n", post.n);
  await page.screenshot({ path: `${OUT}/c1-03-saved.png` });

  // ---- (1) DISCARD ALL from inside the review ----
  await openReview("R2");
  await page.screenshot({ path: `${OUT}/c1-04-review2.png` });
  const tDisc = Date.now();
  console.log("DISCARD_BTNS", await frame.locator("button").filter({ hasText: /^Discard All$/ }).count());
  await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click");
  const msAbsent = await pollMark("MARK_AFTER_DISCARD", "absent", 20000);
  console.log("B_MARK_ABSENT_MS", msAbsent, "<=5000?", msAbsent >= 0 && msAbsent <= 5000, "wall", Date.now() - tDisc);
  await page.waitForTimeout(6000);
  const d1 = await snap();
  console.log("POST-DISCARD 215", JSON.stringify(d1.rows[LEAF]), "190", JSON.stringify(d1.rows[EPIC]));
  console.log("POST-DISCARD carriers", JSON.stringify(d1.carriers));
  console.log("POST-DISCARD DEC", JSON.stringify(d1.dec), "DEC_KEY_PRESENT", JSON.stringify(d1.decKeyPresent));
  console.log("POST-DISCARD STORED_DUR", JSON.stringify(d1.storedDur), "EPIC_DUR", JSON.stringify(d1.epicDur), "n", d1.n);
  console.log("POST-DISCARD savedEditsKey", d1.savedEditsKey);
  await page.screenshot({ path: `${OUT}/c1-05-discarded.png` });

  // ---- (3) typed duration 3 on LZPT-215: the review's BASELINE must be "none" ----
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  const row = frame.locator(`[data-testid="table-row"][data-row-key="${LEAF}"]`).first();
  await row.scrollIntoViewIfNeeded().catch(() => {});
  console.log("215_BEFORE_TYPE start/due/dur", await row.getAttribute("data-row-start"), await row.getAttribute("data-row-due"), JSON.stringify(await row.getAttribute("data-row-duration")));
  console.log("215_ROW_TEXT", ((await row.textContent()) || "").replace(/\s+/g, " ").slice(0, 200));
  const durCell = row.locator("div").filter({ hasText: /^\d+d$/ }).last();
  await durCell.dispatchEvent("click");
  await page.waitForTimeout(900);
  const input = row.locator('input[inputmode="numeric"]').first();
  console.log("EDITOR_OPEN", await input.count());
  await input.fill("3");
  await input.press("Enter");
  await page.waitForTimeout(2800);
  console.log("215_AFTER_TYPE start/due/dur", await row.getAttribute("data-row-start"), await row.getAttribute("data-row-due"), JSON.stringify(await row.getAttribute("data-row-duration")));
  await page.screenshot({ path: `${OUT}/c1-06-typed3.png` });
  const r3 = await openReview("R3");
  const typedRow = r3.find((x: any) => x.key === LEAF);
  console.log("TYPED_ROW", JSON.stringify(typedRow));
  console.log("DUR_LINE_TEXT", (typedRow?.text || "").match(/Dur[^A-Z]{0,40}/i)?.[0]);
  await page.screenshot({ path: `${OUT}/c1-07-review-typed.png` });

  await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click");
  await page.waitForTimeout(12000);
  const fin = await snap();
  console.log("FINAL 215", JSON.stringify(fin.rows[LEAF]), "190", JSON.stringify(fin.rows[EPIC]));
  console.log("FINAL carriers", JSON.stringify(fin.carriers));
  console.log("FINAL DEC", JSON.stringify(fin.dec), "DEC_KEY_PRESENT", JSON.stringify(fin.decKeyPresent));
  console.log("FINAL STORED_DUR", JSON.stringify(fin.storedDur), "n", fin.n, "savedEditsKey", fin.savedEditsKey);
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await page.screenshot({ path: `${OUT}/c1-08-final.png` });
});
