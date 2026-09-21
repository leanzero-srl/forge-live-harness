// LZ7D0 item 2 — BREAK F2: a row left BLANK by a duration clear must be repairable
// from the UI by typing the SAME number the row's own span implies.
// dev 7.13.0 / UI v4.58.650, bed "LZPT Scenarios", row LZPT-215 "EDGE long-run".
//
// The test hook CANNOT produce `durationExplicitlyCleared` (`?what=applyEdit&
// field=duration&value=` writes the literal '' onto the row and never touches the
// flag — src/test-hook.js:415), so the blanked state is produced by the REAL
// gesture: the Table duration editor's clear on a Jira-null row (_lz7b0-i2).
//
// LZPT-215 is 2026-05-04..2026-06-30 and Jira holds NO duration. Independent
// working-day count (Mon-Fri): May 4-29 = 20, Jun 1-30 = 22, total 42 wd. So the
// repair gesture is typing 42 — exactly the number `isDerivedDuration`'s third
// clause used to swallow.
// Restore: Re-index, then ?what=clearDerivedDurations (dry recorded, then perform).
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
    row: me ? { s: me.startDate, d: me.dueDate, du: me.duration, dec: me.durationExplicitlyCleared, decPresent: Object.prototype.hasOwnProperty.call(me, "durationExplicitlyCleared") } : null,
    dec: iss.filter((i: any) => i.durationExplicitlyCleared === true).map((i: any) => i.key),
    storedDur: iss.filter((i: any) => i.duration !== null && i.duration !== undefined).map((i: any) => `${i.key}=${JSON.stringify(i.duration)}`),
    carriers: iss.filter((i: any) => F.some((f) => String(i[f] ?? "") !== String(i._original?.[f] ?? ""))).map((i: any) => `${i.key}:${i.startDate}/${i.dueDate}/${i.duration}`),
    savedEditsKey: p.meta && Object.prototype.hasOwnProperty.call(p.meta, "savedEdits"),
  };
};
const dryHeal = async (tag: string) => {
  const r: any = await getTestState("lz-ppm", { what: "clearDerivedDurations", planId: PLAN_ID, dry: "1" });
  console.log(tag, "DRY_HEAL", JSON.stringify(r));
  console.log(tag, "FLAGGED", JSON.stringify(r.flagged), "HEAL_SEQUENCE_HINT", JSON.stringify(r.hint ?? r.HEAL_SEQUENCE_HINT ?? null));
  return r;
};

test("D5: a blanked row is repaired by typing its own span", async ({ page }) => {
  console.log("PRE", JSON.stringify(await snap()));
  await dryHeal("PRE");
  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  let frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  console.log("SHELL_REV", ((await bodyText(frame)).match(/rev\s*v?([\d.]+)/) || [])[1]);
  const openPlan = async (f: any, view: string) => {
    await f.getByText(PLAN, { exact: true }).first().click().catch(() => {});
    await page.waitForTimeout(9000);
    if (!/Gantt/i.test(await bodyText(f))) await f.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
    await page.waitForTimeout(6000);
    await f.getByRole("button", { name: new RegExp(`^${view}`, "i") }).first().click().catch(() => {});
    await page.waitForTimeout(6000);
  };
  await openPlan(frame, "Table");
  console.log("STAGED_ON_OPEN", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));

  const saveNow = async (tag: string) => {
    const btn = frame.locator('[data-testid="plan-save-btn"]').first();
    const label = ((await btn.textContent().catch(() => "")) || "").trim();
    console.log(tag, "SAVE_NAG_LABEL", label, "nag?", /Save\s*\(\d+\)/.test(label));
    await btn.click({ timeout: 30000 }).catch((e: any) => console.log(tag, "SAVE_CLICK_ERR", String(e).slice(0, 80)));
    for (let i = 0; i < 240; i++) { if ((await btn.getAttribute("data-save-state").catch(() => null)) === "saved") break; await page.waitForTimeout(250); }
    await page.waitForTimeout(4000);
    console.log(tag, "SAVE_LABEL_AFTER", ((await btn.textContent().catch(() => "")) || "").trim());
    return label;
  };
  const rowLoc = () => frame.locator(`[data-testid="table-row"][data-row-key="${ROW}"]`).first();
  const readRow = async (tag: string) => {
    const r = rowLoc();
    await r.scrollIntoViewIfNeeded().catch(() => {});
    const d = await r.getAttribute("data-row-duration");
    console.log(tag, "TABLE", await r.getAttribute("data-row-start"), await r.getAttribute("data-row-due"), "dur=", JSON.stringify(d));
    console.log(tag, "ROW_TEXT", ((await r.textContent()) || "").replace(/\s+/g, " ").slice(0, 170));
    const bb = await r.boundingBox();
    if (bb) await page.screenshot({ path: `${OUT}/d5-${tag}.png`, clip: { x: Math.max(0, bb.x - 10), y: Math.max(0, bb.y - 70), width: Math.min(1500, bb.width + 20), height: 150 } });
    return d;
  };
  const editDuration = async (value: string) => {
    const r = rowLoc();
    await r.scrollIntoViewIfNeeded().catch(() => {});
    let cell = r.locator("div").filter({ hasText: /^\d+d$/ }).last();
    if (!(await cell.count())) cell = r.locator("div").filter({ hasText: /^(—|-|Set)$/ }).last();
    if (!(await cell.count())) cell = r.locator("div").nth(await r.locator("div").count() - 2);
    await cell.dispatchEvent("click");
    await page.waitForTimeout(1200);
    const input = r.locator('input[inputmode="numeric"]').first();
    console.log("EDITOR_OPEN", await input.count());
    await input.fill(value);
    await input.press("Enter");
    await page.waitForTimeout(3000);
  };

  // ---------- 1. create the blanked state ----------
  await readRow("00-before");
  await editDuration("");
  await readRow("01-cleared");
  console.log("STAGED_AFTER_CLEAR", ((await bodyText(frame)).match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/gi) || []).join(" | "));
  await saveNow("CLEAR");
  const afterClear = await snap();
  console.log("AFTER_CLEAR_SAVE", JSON.stringify(afterClear));
  const healWhileFlagged = await dryHeal("FLAGGED_STATE");

  // ---------- 2. reload: the row must render BLANK ----------
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  const s2 = await enterForgeSurface(page, { surface: "custom" });
  frame = s2.kind === "custom" ? s2.frame : null;
  await page.waitForTimeout(7000);
  await openPlan(frame, "Table");
  const blank = await readRow("02-reloaded-blank");
  console.log("RENDERS_BLANK", blank === "" || blank === null);

  // ---------- 3. THE REPAIR: type 42, the row's own derived span ----------
  await editDuration("42");
  await readRow("03-typed42");
  const nag = ((await bodyText(frame)).match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/gi) || []).join(" | ");
  console.log("SAVE_NAG_AFTER_TYPING_42", JSON.stringify(nag), "-> nag appeared?", /Save\s*\(\d+\)/.test(nag));
  if (await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).count()) {
    await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click");
    await page.waitForTimeout(3500);
    console.log("REPAIR_APPLY_ROWS", JSON.stringify(await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })))));
    await page.screenshot({ path: `${OUT}/d5-04-repair-review.png` });
    await frame.locator("button").filter({ hasText: /^Cancel$/ }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(1800);
  }
  await saveNow("REPAIR");
  const afterRepair = await snap();
  console.log("AFTER_REPAIR_SAVE", JSON.stringify(afterRepair));
  console.log("REPAIR_OK duration==42?", afterRepair.row?.du === 42, "| dec==false?", afterRepair.row?.dec === false, "| dec value", JSON.stringify(afterRepair.row?.dec), "present?", afterRepair.row?.decPresent);

  // ---------- 4. reload: 42d must show ----------
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  const s3 = await enterForgeSurface(page, { surface: "custom" });
  frame = s3.kind === "custom" ? s3.frame : null;
  await page.waitForTimeout(7000);
  await openPlan(frame, "Table");
  const shown = await readRow("05-reloaded-42");
  console.log("SHOWS_42_AFTER_RELOAD", shown === "42");

  // ---------- 5. RESTORE: Re-index, then the one-shot ----------
  await dryHeal("BEFORE_REINDEX");
  const reidx = frame.getByRole("button", { name: /Re-?index/i }).first();
  console.log("REINDEX_BTN", await frame.getByRole("button", { name: /Re-?index/i }).count());
  await reidx.dispatchEvent("click");
  await page.waitForTimeout(4000);
  const confirm = frame.locator("button").filter({ hasText: /^(Re-?index|Rebuild|Confirm|Yes)/i });
  console.log("REINDEX_CONFIRM_BTNS", await confirm.count());
  if (await confirm.count()) await confirm.last().dispatchEvent("click").catch(() => {});
  for (let i = 0; i < 120; i++) {
    const t = await bodyText(frame);
    if (!/Indexing|Re-?indexing|Rebuilding/i.test(t) && i > 6) break;
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(8000);
  console.log("AFTER_REINDEX", JSON.stringify(await snap()));
  await page.screenshot({ path: `${OUT}/d5-06-reindexed.png` });
  const dry2 = await dryHeal("AFTER_REINDEX");
  const perf: any = await getTestState("lz-ppm", { what: "clearDerivedDurations", planId: PLAN_ID, dry: "0" });
  console.log("PERFORM_HEAL", JSON.stringify(perf));
  const fin = await snap();
  console.log("FINAL", JSON.stringify(fin));
  console.log("HEAL_SUMMARY flaggedWhileBlank", JSON.stringify(healWhileFlagged.flagged), "dryAfterReindex", JSON.stringify(dry2.keys));
});
