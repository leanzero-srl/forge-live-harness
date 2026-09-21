// LZ7D0 item 1 (a)(c)(b) — dev 7.13.0 / UI v4.58.650, bed "LZPT Scenarios".
// BREAK F1: `stampRollupDurations` now lives in usePlan's setIssues door, so the
// NON-CASCADE publish paths (link-lag set, link-lag revert, bulk field) must no
// longer leave an Epic holding the engine's envelope measurement as a statement.
//
// Bed geometry (harvested from ?what=plan at entry, all 70 rows, ZERO stored
// durations, no lags, no flags):
//   Epic LZPT-187 "E2 Diamond" has NO Jira dates -> its envelope is pure rollup.
//   Kids: 197 (05-04..05-06) -> 198 (05-07..05-12) + 199 (05-07..05-14) -> 200
//   (05-15..05-19).  Envelope 2026-05-04 .. 2026-05-19 = 12 working days.
//   A lag of 5 wd on 199->200 pushes 200 to 05-22..05-26 -> envelope 05-04..05-26
//   = 17 working days.  That is F1's exact shape: the rollup number MOVES.
// (a) lag 5 on 199->200   (c) bulk buffer Yes on 200 (absorbs the push, moves the
// envelope back) (b) lag back to 0.  After EACH: review has no `Dur:` on any Epic,
// Save stores no Epic duration, the Save button reads Saved, Discard All is clean.
// NEVER applies to Jira.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7d0";
const PLAN = "LZPT Scenarios";
const PLAN_ID = "plan-msq9dg8l-gz6mz1";
const FROM = "LZPT-199", TO = "LZPT-200", EPIC = "LZPT-187";
const EPICS = ["LZPT-186", "LZPT-187", "LZPT-188", "LZPT-189", "LZPT-190", "LZPT-191"];
test.describe.configure({ retries: 0, timeout: 2_400_000 });

const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const snap = async () => {
  const p: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  const F = ["startDate", "dueDate", "duration", "buffer"];
  const iss = p.issues || [];
  const rows: any = {};
  for (const i of iss) rows[i.key] = { s: i.startDate ?? null, d: i.dueDate ?? null, du: i.duration ?? null, b: i.buffer ?? null };
  return {
    n: iss.length,
    dec: iss.filter((i: any) => i.durationExplicitlyCleared === true).map((i: any) => i.key),
    storedDur: iss.filter((i: any) => i.duration !== null && i.duration !== undefined).map((i: any) => `${i.key}=${i.duration}`),
    epicDur: EPICS.map((k) => `${k}=${JSON.stringify(rows[k]?.du)}`),
    carriers: iss.filter((i: any) => F.some((f) => String(i[f] ?? "") !== String(i._original?.[f] ?? ""))).map((i: any) => `${i.key}:${i.startDate}/${i.dueDate}/${i.duration}/${i.buffer}`),
    rows,
    savedEditsKey: p.meta && Object.prototype.hasOwnProperty.call(p.meta, "savedEdits"),
  };
};
const applyRows = async (frame: any) => await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })));

test("D1: lag set / bulk field / lag revert leave no stored Epic duration", async ({ page }) => {
  const pre = await snap();
  console.log("PRE", JSON.stringify({ n: pre.n, dec: pre.dec, storedDur: pre.storedDur, carriers: pre.carriers, savedEditsKey: pre.savedEditsKey }));
  console.log("PRE EPIC", JSON.stringify(pre.rows[EPIC]), "199", JSON.stringify(pre.rows[FROM]), "200", JSON.stringify(pre.rows[TO]));

  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  const shell = await bodyText(frame);
  console.log("SHELL_REV", (shell.match(/rev\s*v?([\d.]+)/) || [])[1]);

  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(9000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  console.log("STAGED_ON_OPEN", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);

  const barAttr = async (k: string) => {
    const b = frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first();
    if (!(await b.count())) return "ABSENT";
    return `${await b.getAttribute("data-bar-start")}..${await b.getAttribute("data-bar-due")}`;
  };
  const showEpic = async (tag: string) => console.log(tag, "EPIC_BAR", await barAttr(EPIC), "| 200", await barAttr(TO), "| 199", await barAttr(FROM));

  // make sure the diamond rows are on screen (virtualised window)
  await frame.locator(`[data-testid="gantt-bar"][data-key="${TO}"]`).first().scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(1500);
  await showEpic("OPEN");
  await page.screenshot({ path: `${OUT}/d1-00-open.png` });

  const arrow = frame.locator(`[data-testid="dep-arrow-hit"][data-link="${FROM}-${TO}"]`).first();
  console.log("ARROW_COUNT", await frame.locator(`[data-testid="dep-arrow-hit"][data-link="${FROM}-${TO}"]`).count());
  console.log("ALL_ARROWS", JSON.stringify((await frame.locator('[data-testid="dep-arrow-hit"]').evaluateAll((els: any[]) => els.map((e) => e.getAttribute("data-link")))).slice(0, 40)));

  const openMenu = async () => {
    await arrow.dispatchEvent("click");
    await page.waitForTimeout(1500);
    const c = await frame.locator('[data-testid="dep-link-menu"]').count();
    console.log("MENU", c, "LAG_VALUE", ((await frame.locator('[data-testid="lag-value"]').first().textContent().catch(() => "")) || "").trim());
    return c;
  };
  const setLagTo = async (want: number) => {
    for (let i = 0; i < 12; i++) {
      if (!(await frame.locator('[data-testid="dep-link-menu"]').count())) await openMenu();
      const cur = parseInt(((await frame.locator('[data-testid="lag-value"]').first().textContent().catch(() => "0")) || "0").trim(), 10) || 0;
      if (cur === want) break;
      await frame.locator(`[data-testid="${cur < want ? "lag-inc" : "lag-dec"}"]`).first().dispatchEvent("click");
      await page.waitForTimeout(1400);
    }
    const cur = ((await frame.locator('[data-testid="lag-value"]').first().textContent().catch(() => "")) || "").trim();
    console.log("LAG_NOW", cur, "want", want);
    await frame.locator("body").first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(2500);
  };

  const gate = async (tag: string) => {
    // ---- the review ----
    const t = await bodyText(frame);
    console.log(tag, "STAGED_TEXT", (t.match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/gi) || []).join(" | "));
    const applyBtn = frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first();
    if (!(await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).count())) {
      console.log(tag, "NO_APPLY_BUTTON — nothing staged");
      return { rows: [] as any[], staged: false };
    }
    await applyBtn.dispatchEvent("click");
    await page.waitForTimeout(3500);
    const rows = await applyRows(frame);
    console.log(tag, "APPLY_ROWS", JSON.stringify(rows, null, 1));
    console.log(tag, "EPIC_ROWS_IN_REVIEW", JSON.stringify(rows.filter((r: any) => EPICS.includes(r.key))));
    console.log(tag, "EPIC_DUR_LINES", JSON.stringify(rows.filter((r: any) => EPICS.includes(r.key) && /Dur\s*:/i.test(r.text)).map((r: any) => `${r.key} :: ${r.text}`)));
    console.log(tag, "ANY_DUR_LINE", JSON.stringify(rows.filter((r: any) => /Dur\s*:/i.test(r.text)).map((r: any) => `${r.key} :: ${(r.text.match(/Dur[^A-Z]{0,30}/i) || [])[0]}`)));
    await page.screenshot({ path: `${OUT}/d1-${tag}-review.png` });
    await frame.locator("button").filter({ hasText: /^Cancel$/ }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(1800);
    return { rows, staged: true };
  };

  const saveAndRead = async (tag: string) => {
    const btn = frame.locator('[data-testid="plan-save-btn"]').first();
    console.log(tag, "SAVE_LABEL_BEFORE", ((await btn.textContent().catch(() => "")) || "").trim());
    await btn.click({ timeout: 30000 }).catch((e: any) => console.log(tag, "SAVE_CLICK_ERR", String(e).slice(0, 120)));
    for (let i = 0; i < 240; i++) { if ((await btn.getAttribute("data-save-state").catch(() => null)) === "saved") break; await page.waitForTimeout(250); }
    await page.waitForTimeout(3000);
    console.log(tag, "SAVE_LABEL_AFTER", ((await btn.textContent().catch(() => "")) || "").trim(), "state", await btn.getAttribute("data-save-state").catch(() => null));
    await page.waitForTimeout(5000);
    console.log(tag, "SAVE_LABEL_+5s", ((await btn.textContent().catch(() => "")) || "").trim(), "state", await btn.getAttribute("data-save-state").catch(() => null));
    const post = await snap();
    console.log(tag, "POSTSAVE EPIC_DUR", JSON.stringify(post.epicDur), "STORED_DUR", JSON.stringify(post.storedDur));
    console.log(tag, "POSTSAVE DEC", JSON.stringify(post.dec), "carriers", JSON.stringify(post.carriers), "savedEditsKey", post.savedEditsKey);
    await page.screenshot({ path: `${OUT}/d1-${tag}-saved.png` });
    return post;
  };

  const discard = async (tag: string) => {
    if (!(await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).count())) { console.log(tag, "NOTHING_TO_DISCARD"); return await snap(); }
    await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click");
    await page.waitForTimeout(3000);
    await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click");
    await page.waitForTimeout(12000);
    const d = await snap();
    console.log(tag, "POSTDISCARD EPIC_DUR", JSON.stringify(d.epicDur), "STORED_DUR", JSON.stringify(d.storedDur), "DEC", JSON.stringify(d.dec));
    console.log(tag, "POSTDISCARD carriers", JSON.stringify(d.carriers), "savedEditsKey", d.savedEditsKey);
    console.log(tag, "STAGED_AFTER_DISCARD", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
    await page.screenshot({ path: `${OUT}/d1-${tag}-discarded.png` });
    return d;
  };

  // ================= (a) LAG SET =================
  await setLagTo(5);
  await showEpic("A_AFTER_LAG5");
  await page.screenshot({ path: `${OUT}/d1-01-lag5.png` });
  await gate("A");
  await saveAndRead("A");
  await discard("A");

  // ================= (c) BULK FIELD =================
  // lag is STILL 5 (setLinkLag persists to KVS), so LZPT-200 is being pushed;
  // marking it a buffer row makes the buffer absorb the push and moves the
  // Epic envelope again — a real move published through handleBulkField.
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  const trow = frame.locator(`[data-testid="table-row"][data-row-key="${TO}"]`).first();
  await trow.scrollIntoViewIfNeeded().catch(() => {});
  console.log("C_ROW_BEFORE", await trow.getAttribute("data-row-start"), await trow.getAttribute("data-row-due"), JSON.stringify(await trow.getAttribute("data-row-duration")));
  await trow.locator('input[type="checkbox"], [role="checkbox"]').first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(1200);
  console.log("C_BULK_BAR", (await bodyText(frame)).match(/\d+ selected[\s\S]{0,140}/)?.[0]);
  await frame.locator("button").filter({ hasText: /^Yes$/ }).first().dispatchEvent("click");
  await page.waitForTimeout(4000);
  console.log("C_ROW_AFTER", await trow.getAttribute("data-row-start"), await trow.getAttribute("data-row-due"), JSON.stringify(await trow.getAttribute("data-row-duration")));
  await page.screenshot({ path: `${OUT}/d1-02-bulk.png` });
  await gate("C");
  await saveAndRead("C");
  await discard("C");

  // ================= (b) LAG REVERT =================
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  await frame.locator(`[data-testid="gantt-bar"][data-key="${TO}"]`).first().scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(1500);
  await setLagTo(0);
  await showEpic("B_AFTER_REVERT");
  await page.screenshot({ path: `${OUT}/d1-03-lag0.png` });
  await gate("B");
  await saveAndRead("B");
  await discard("B");

  const fin = await snap();
  console.log("FINAL EPIC_DUR", JSON.stringify(fin.epicDur), "STORED_DUR", JSON.stringify(fin.storedDur), "DEC", JSON.stringify(fin.dec));
  console.log("FINAL carriers", JSON.stringify(fin.carriers), "savedEditsKey", fin.savedEditsKey, "n", fin.n);
  console.log("FINAL 200", JSON.stringify(fin.rows[TO]), "EPIC", JSON.stringify(fin.rows[EPIC]));
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await page.screenshot({ path: `${OUT}/d1-04-final.png` });
});
