// LZ7D0 item 2 (second attempt) — BREAK F2 repair, dev 7.13.0 / UI v4.58.650.
//
// WHY THE FIRST ATTEMPT COULD NOT BUILD THE PRECONDITION:
//  * `?what=applyEdit&field=duration&value=` writes the literal '' onto the row
//    and never touches `durationExplicitlyCleared` (src/test-hook.js:415) — the
//    hook CANNOT produce the flag.
//  * the Table's clear gesture on a row whose duration is DERIVED is REFUSED by
//    `editRefusal` (utils/duration-input.js:123) — "Jira holds no Duration for
//    this issue — the 42d shown is measured from its dates, so there is nothing
//    to clear." Captured below as evidence.
// So the blank row is built the only way that is still reachable: STATE a
// duration first (30), which makes the clear a real clear rather than a no-op.
//
// LZPT-215, Jira 2026-05-04..2026-06-30, no Jira duration.
// Independent working days (Mon-Fri): 05-04 + 30 wd  -> 2026-06-12
//                                     05-04 + 42 wd  -> 2026-06-30 (Jira's own)
// So: type 30 -> Save -> clear -> Save (row is BLANK + flagged) -> reload ->
// type 42 (== `_original.duration`, F2's swallowed input) -> nag -> Save ->
// duration 42, flag false -> reload shows 42d. Restore with the operator
// one-shot, whose predicate this row then matches exactly.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7d0";
const PLAN = "LZPT Scenarios";
const PLAN_ID = "plan-msq9dg8l-gz6mz1";
const ROW = "LZPT-215";
test.describe.configure({ retries: 0, timeout: 2_400_000 });

const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const snap = async () => {
  const p: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  const F = ["startDate", "dueDate", "duration", "buffer"];
  const iss = p.issues || [];
  const me = iss.find((i: any) => i.key === ROW);
  return {
    n: iss.length,
    row: me ? { s: me.startDate, d: me.dueDate, du: me.duration, dec: me.durationExplicitlyCleared, decPresent: Object.prototype.hasOwnProperty.call(me, "durationExplicitlyCleared"), origDur: me._original?.duration ?? null, origS: me._original?.startDate, origD: me._original?.dueDate } : null,
    dec: iss.filter((i: any) => i.durationExplicitlyCleared === true).map((i: any) => i.key),
    storedDur: iss.filter((i: any) => i.duration !== null && i.duration !== undefined).map((i: any) => `${i.key}=${JSON.stringify(i.duration)}`),
    carriers: iss.filter((i: any) => F.some((f) => String(i[f] ?? "") !== String(i._original?.[f] ?? ""))).map((i: any) => `${i.key}:${i.startDate}/${i.dueDate}/${i.duration}`),
    savedEditsKey: p.meta && Object.prototype.hasOwnProperty.call(p.meta, "savedEdits"),
  };
};
const dryHeal = async (tag: string) => {
  const r: any = await getTestState("lz-ppm", { what: "clearDerivedDurations", planId: PLAN_ID, dry: "1" });
  console.log(tag, "DRY_HEAL", JSON.stringify(r));
  return r;
};

test("D6: state 30, clear it, then repair the blank row by typing 42", async ({ page }) => {
  console.log("PRE", JSON.stringify(await snap()));
  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  const enter = async () => {
    await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
    const s = await enterForgeSurface(page, { surface: "custom" });
    const f: any = s.kind === "custom" ? s.frame : null; if (!f) throw new Error("no frame");
    await page.waitForTimeout(9000);
    await f.getByText(PLAN, { exact: true }).first().click().catch(() => {});
    await page.waitForTimeout(9000);
    if (!/Gantt/i.test(await bodyText(f))) await f.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
    await page.waitForTimeout(6000);
    await f.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
    await page.waitForTimeout(6000);
    return f;
  };
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  let frame = await enter();
  console.log("SHELL_REV", ((await bodyText(frame)).match(/rev\s*v?([\d.]+)/) || [])[1]);
  console.log("STAGED_ON_OPEN", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));

  const rowLoc = () => frame.locator(`[data-testid="table-row"][data-row-key="${ROW}"]`).first();
  const readRow = async (tag: string) => {
    const r = rowLoc(); await r.scrollIntoViewIfNeeded().catch(() => {});
    const d = await r.getAttribute("data-row-duration");
    console.log(tag, "TABLE", await r.getAttribute("data-row-start"), await r.getAttribute("data-row-due"), "dur=", JSON.stringify(d));
    console.log(tag, "ROW_TEXT", ((await r.textContent()) || "").replace(/\s+/g, " ").slice(0, 170));
    const bb = await r.boundingBox();
    if (bb) await page.screenshot({ path: `${OUT}/d6-${tag}.png`, clip: { x: Math.max(0, bb.x - 10), y: Math.max(0, bb.y - 70), width: Math.min(1500, bb.width + 20), height: 150 } });
    return d;
  };
  const editDuration = async (value: string, tag: string) => {
    const r = rowLoc(); await r.scrollIntoViewIfNeeded().catch(() => {});
    let cell = r.locator("div").filter({ hasText: /^\d+d$/ }).last();
    if (!(await cell.count())) cell = r.locator("div").filter({ hasText: /^(—|–|-)$/ }).last();
    console.log(tag, "DUR_CELL_FOUND", await cell.count());
    await cell.dispatchEvent("click");
    await page.waitForTimeout(1200);
    const input = r.locator('input[inputmode="numeric"]').first();
    console.log(tag, "EDITOR_OPEN", await input.count());
    if (!(await input.count())) {
      // blank cell: the duration column may render an empty clickable div
      const divs = await r.locator("div").count();
      for (let i = divs - 1; i >= Math.max(0, divs - 6); i--) {
        await r.locator("div").nth(i).dispatchEvent("click");
        await page.waitForTimeout(600);
        if (await r.locator('input[inputmode="numeric"]').count()) { console.log(tag, "OPENED_VIA_DIV", i); break; }
      }
    }
    const inp = r.locator('input[inputmode="numeric"]').first();
    console.log(tag, "EDITOR_OPEN2", await inp.count());
    await inp.fill(value);
    await inp.press("Enter");
    await page.waitForTimeout(3000);
    const toast = (await bodyText(frame)).match(/Jira holds no Duration[^.]*\.|won't be stored[^.]*\.|nothing to clear[^.]*\./i);
    console.log(tag, "TOAST", JSON.stringify(toast?.[0] ?? null));
    console.log(tag, "STAGED", ((await bodyText(frame)).match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/gi) || []).join(" | "));
  };
  const save = async (tag: string) => {
    const btn = frame.locator('[data-testid="plan-save-btn"]').first();
    const label = ((await btn.textContent().catch(() => "")) || "").trim();
    console.log(tag, "SAVE_NAG", label, "nag?", /Save\s*\(\d+\)/.test(label));
    await btn.click({ timeout: 30000 }).catch((e: any) => console.log(tag, "SAVE_CLICK_ERR", String(e).slice(0, 80)));
    for (let i = 0; i < 240; i++) { if ((await btn.getAttribute("data-save-state").catch(() => null)) === "saved") break; await page.waitForTimeout(250); }
    await page.waitForTimeout(4000);
    console.log(tag, "SAVE_LABEL_AFTER", ((await btn.textContent().catch(() => "")) || "").trim());
    const p = await snap(); console.log(tag, "PLAN", JSON.stringify(p));
    return p;
  };

  // ---- 0. the REFUSAL on a derived row, captured ----
  await readRow("00-rest");
  await editDuration("", "REFUSE");
  await page.screenshot({ path: `${OUT}/d6-00b-refusal.png` });

  // ---- 1. state 30 ----
  await editDuration("30", "STATE30");
  const r1 = await readRow("01-typed30");
  console.log("EXPECT due 2026-06-12 dur 30 ->", r1);
  await save("STATE30");

  // ---- 2. clear it: now a real clear ----
  await editDuration("", "CLEAR");
  await readRow("02-cleared");
  const afterClear = await save("CLEAR");
  console.log("FLAG_SET?", afterClear.row?.dec === true);
  const flaggedDry = await dryHeal("FLAGGED_STATE");
  console.log("FLAGGED_LIST", JSON.stringify(flaggedDry.flagged), "HINT", JSON.stringify(flaggedDry.hint ?? null));

  // ---- 3. reload: BLANK ----
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  frame = await enter();
  const blank = await readRow("03-blank");
  console.log("RENDERS_BLANK", blank === "" || blank === null);

  // ---- 4. THE REPAIR: type 42 (== _original.duration the normaliser derived) ----
  await editDuration("42", "REPAIR");
  const r4 = await readRow("04-typed42");
  console.log("EXPECT due 2026-06-30 dur 42 ->", r4);
  if (await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).count()) {
    await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click");
    await page.waitForTimeout(3500);
    console.log("REPAIR_APPLY_ROWS", JSON.stringify(await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })))));
    await page.screenshot({ path: `${OUT}/d6-05-repair-review.png` });
    await frame.locator("button").filter({ hasText: /^Cancel$/ }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(1800);
  }
  const rep = await save("REPAIR");
  console.log("REPAIR_OK dur==42?", rep.row?.du === 42, "dec===false?", rep.row?.dec === false, "dec=", JSON.stringify(rep.row?.dec));

  // ---- 5. reload: 42d shown ----
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  frame = await enter();
  const shown = await readRow("06-reload42");
  console.log("SHOWS_42_AFTER_RELOAD", shown === "42");

  // ---- 6. RESTORE via the one-shot ----
  const dry = await dryHeal("RESTORE_DRY");
  console.log("RESTORE_KEYS", JSON.stringify(dry.keys), "HITS", JSON.stringify(dry.hits), "FLAGGED", JSON.stringify(dry.flagged), "HINT", JSON.stringify(dry.hint ?? null));
  const perf: any = await getTestState("lz-ppm", { what: "clearDerivedDurations", planId: PLAN_ID, dry: "0" });
  console.log("PERFORM", JSON.stringify(perf));
  const fin = await snap();
  console.log("FINAL", JSON.stringify(fin));
});
