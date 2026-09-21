// LZ7D0 items 3 + 4 — dev 7.13.0 / UI v4.58.650, bed "LZPT Scenarios".
// THE GESTURE IS THE DISCRIMINATOR (BREAK F3, commit 67b091e2):
//   a bar EDGE resize STATES a duration -> review `Dur: none -> Nd`, stored on Save;
//   a bar MOVE states nothing            -> dates only, duration stays null;
//   a typed DUE DATE re-measures and states -> `Dur: none -> Nd`, stored on Save.
// Row: LZPT-216 "EDGE weekend-span", 2026-05-08..2026-05-12, no predecessors and
// no successors, parent Epic LZPT-190. Jira holds NO duration for it (fieldAvail
// .duration === false on this project), so every baseline below is "none".
// Independent working-day arithmetic (Mon-Fri, no LZPT holidays in May 2026):
//   05-08 Fri, 05-11 Mon, 05-12 Tue                              = 3 wd (at rest)
//   resize right edge to 05-15 Fri: 8,11,12,13,14,15             = 6 wd
//   typed due 05-20 Wed:            8,11,12,13,14,15,18,19,20    = 9 wd
// Everything is discarded. NEVER applies to Jira.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7d0";
const PLAN = "LZPT Scenarios";
const PLAN_ID = "plan-msq9dg8l-gz6mz1";
const ROW = "LZPT-216";
const EPICS = ["LZPT-186", "LZPT-187", "LZPT-188", "LZPT-189", "LZPT-190", "LZPT-191"];
test.describe.configure({ retries: 0, timeout: 2_400_000 });

const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const snap = async () => {
  const p: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  const F = ["startDate", "dueDate", "duration", "buffer"];
  const iss = p.issues || [];
  const rows: any = {};
  for (const i of iss) rows[i.key] = { s: i.startDate ?? null, d: i.dueDate ?? null, du: i.duration ?? null };
  return {
    n: iss.length,
    row: rows[ROW],
    dec: iss.filter((i: any) => i.durationExplicitlyCleared === true).map((i: any) => i.key),
    storedDur: iss.filter((i: any) => i.duration !== null && i.duration !== undefined).map((i: any) => `${i.key}=${i.duration}`),
    epicDur: EPICS.map((k) => `${k}=${JSON.stringify(rows[k]?.du)}`),
    carriers: iss.filter((i: any) => F.some((f) => String(i[f] ?? "") !== String(i._original?.[f] ?? ""))).map((i: any) => `${i.key}:${i.startDate}/${i.dueDate}/${i.duration}`),
    savedEditsKey: p.meta && Object.prototype.hasOwnProperty.call(p.meta, "savedEdits"),
  };
};

test("D4: resize states a duration, move does not, a typed due date does", async ({ page }) => {
  console.log("PRE", JSON.stringify(await snap()));
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
  await page.waitForTimeout(6000);
  console.log("STAGED_ON_OPEN", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  await frame.locator("[data-gantt-scroll]").first().evaluate((el: any) => { el.scrollLeft = 0; }).catch(() => {});
  await page.waitForTimeout(1500);

  const dayNum = (iso: string | null) => (iso ? Math.round(new Date(`${iso}T00:00:00Z`).getTime() / 86400000) : NaN);
  const anchor = async (k: string) => await frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first().evaluate((el: any) => ({ left: parseFloat(el.style.left), start: el.getAttribute("data-bar-start") }));
  const aA = await anchor("LZPT-218"), aB = await anchor("LZPT-226");
  let dayPx = (aB.left - aA.left) / (dayNum(aB.start) - dayNum(aA.start));
  console.log("DAY_PX", dayPx);
  const bar = frame.locator(`[data-testid="gantt-bar"][data-key="${ROW}"]`).first();
  const read = async () => ({ s: await bar.getAttribute("data-bar-start"), d: await bar.getAttribute("data-bar-due") });
  console.log("BAR_AT_REST", JSON.stringify(await read()));

  const applyRows = async () => await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })));
  const gate = async (tag: string) => {
    console.log(tag, "STAGED_TEXT", ((await bodyText(frame)).match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/gi) || []).join(" | "));
    if (!(await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).count())) { console.log(tag, "NO_APPLY_BUTTON"); return []; }
    await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click");
    await page.waitForTimeout(3500);
    const rows = await applyRows();
    console.log(tag, "APPLY_ROWS", JSON.stringify(rows, null, 1));
    const me = rows.find((r: any) => r.key === ROW);
    console.log(tag, "ROW_DUR_LINE", JSON.stringify((me?.text || "").match(/Dur[^A-Z]{0,30}/i)?.[0] ?? null));
    console.log(tag, "EPIC_DUR_LINES", JSON.stringify(rows.filter((r: any) => EPICS.includes(r.key) && /Dur\s*:/i.test(r.text))));
    await page.screenshot({ path: `${OUT}/d4-${tag}-review.png` });
    await frame.locator("button").filter({ hasText: /^Cancel$/ }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(1800);
    return rows;
  };
  const save = async (tag: string) => {
    const btn = frame.locator('[data-testid="plan-save-btn"]').first();
    console.log(tag, "SAVE_LABEL_BEFORE", ((await btn.textContent().catch(() => "")) || "").trim());
    await btn.click({ timeout: 30000 }).catch((e: any) => console.log(tag, "SAVE_CLICK_ERR", String(e).slice(0, 80)));
    for (let i = 0; i < 240; i++) { if ((await btn.getAttribute("data-save-state").catch(() => null)) === "saved") break; await page.waitForTimeout(250); }
    await page.waitForTimeout(3000);
    console.log(tag, "SAVE_LABEL_AFTER", ((await btn.textContent().catch(() => "")) || "").trim());
    await page.waitForTimeout(6000);
    console.log(tag, "SAVE_LABEL_+6s", ((await btn.textContent().catch(() => "")) || "").trim(), "state", await btn.getAttribute("data-save-state").catch(() => null));
    const post = await snap();
    console.log(tag, "POSTSAVE ROW", JSON.stringify(post.row), "STORED_DUR", JSON.stringify(post.storedDur), "EPIC_DUR", JSON.stringify(post.epicDur), "DEC", JSON.stringify(post.dec));
    console.log(tag, "POSTSAVE carriers", JSON.stringify(post.carriers));
    await page.screenshot({ path: `${OUT}/d4-${tag}-saved.png` });
    return post;
  };
  const discard = async (tag: string) => {
    if (!(await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).count())) { console.log(tag, "NOTHING_TO_DISCARD"); return await snap(); }
    await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click");
    await page.waitForTimeout(3000);
    await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click");
    await page.waitForTimeout(14000);
    const d = await snap();
    console.log(tag, "POSTDISCARD ROW", JSON.stringify(d.row), "STORED_DUR", JSON.stringify(d.storedDur), "DEC", JSON.stringify(d.dec), "carriers", JSON.stringify(d.carriers), "savedEditsKey", d.savedEditsKey);
    console.log(tag, "STAGED_AFTER_DISCARD", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
    return d;
  };

  // ---------- (3a) RESIZE the right edge: 2026-05-12 -> 2026-05-15 ----------
  const TARGET_DUE = dayNum("2026-05-15");
  for (let a = 0; a < 8; a++) {
    await bar.scrollIntoViewIfNeeded().catch(() => {});
    const before = dayNum(await bar.getAttribute("data-bar-due"));
    const need = TARGET_DUE - before; if (need === 0) break;
    const dx = Math.max(-200, Math.min(200, need * dayPx));
    const bb = await bar.boundingBox(); if (!bb) throw new Error("no bar box");
    const cx = bb.x + bb.width - 3, cy = bb.y + bb.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(cx + (i * dx) / 8, cy, { steps: 2 }); await page.waitForTimeout(70); }
    await page.waitForTimeout(350); await page.mouse.up(); await page.waitForTimeout(2200);
    const after = dayNum(await bar.getAttribute("data-bar-due"));
    console.log(`RESIZE ${a}: due ${before} -> ${after} (need ${need}, dx ${dx.toFixed(0)})`);
    if (after !== before) dayPx = dx / (after - before);
  }
  console.log("BAR_AFTER_RESIZE", JSON.stringify(await read()), "(expect 2026-05-08..2026-05-15, 6 wd)");
  await page.screenshot({ path: `${OUT}/d4-01-resized.png` });
  await gate("RESIZE");
  await save("RESIZE");
  await discard("RESIZE");
  console.log("BAR_AFTER_RESIZE_DISCARD", JSON.stringify(await read()));

  // ---------- (3b) MOVE the bar: no duration key ----------
  const TARGET_START = dayNum("2026-05-15");
  for (let a = 0; a < 8; a++) {
    await bar.scrollIntoViewIfNeeded().catch(() => {});
    const before = dayNum(await bar.getAttribute("data-bar-start"));
    const need = TARGET_START - before; if (need === 0) break;
    const dx = Math.max(-200, Math.min(200, need * dayPx));
    const bb = await bar.boundingBox(); if (!bb) throw new Error("no bar box");
    const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(cx + (i * dx) / 8, cy, { steps: 2 }); await page.waitForTimeout(70); }
    await page.waitForTimeout(350); await page.mouse.up(); await page.waitForTimeout(2200);
    const after = dayNum(await bar.getAttribute("data-bar-start"));
    console.log(`MOVE ${a}: start ${before} -> ${after}`);
    if (after !== before) dayPx = dx / (after - before);
  }
  console.log("BAR_AFTER_MOVE", JSON.stringify(await read()));
  await page.screenshot({ path: `${OUT}/d4-02-moved.png` });
  await gate("MOVE");
  await save("MOVE");
  await discard("MOVE");
  console.log("BAR_AFTER_MOVE_DISCARD", JSON.stringify(await read()));

  // ---------- (4) TYPED DUE DATE in the Table: 2026-05-20 ----------
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  const trow = frame.locator(`[data-testid="table-row"][data-row-key="${ROW}"]`).first();
  await trow.scrollIntoViewIfNeeded().catch(() => {});
  console.log("TABLE_BEFORE", await trow.getAttribute("data-row-start"), await trow.getAttribute("data-row-due"), JSON.stringify(await trow.getAttribute("data-row-duration")));
  // the DUE cell is the second date cell on the row
  const cells = trow.locator("div").filter({ hasText: /^May \d+$/ });
  console.log("DATE_CELLS", await cells.count());
  await cells.nth(1).dispatchEvent("click");
  await page.waitForTimeout(1500);
  console.log("PICKER", await frame.locator(".lz-datepicker").count());
  await page.screenshot({ path: `${OUT}/d4-03-picker.png` });
  const day = frame.locator('button[aria-label="2026-05-20"]').first();
  console.log("DAY_BTN", await frame.locator('button[aria-label="2026-05-20"]').count());
  await day.dispatchEvent("click");
  await page.waitForTimeout(3500);
  console.log("TABLE_AFTER", await trow.getAttribute("data-row-start"), await trow.getAttribute("data-row-due"), JSON.stringify(await trow.getAttribute("data-row-duration")), "(expect due 2026-05-20, dur 9)");
  await page.screenshot({ path: `${OUT}/d4-04-typed-due.png` });
  await gate("DUE");
  await save("DUE");
  await discard("DUE");

  const fin = await snap();
  console.log("FINAL", JSON.stringify(fin));
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await page.screenshot({ path: `${OUT}/d4-05-final.png` });
});
