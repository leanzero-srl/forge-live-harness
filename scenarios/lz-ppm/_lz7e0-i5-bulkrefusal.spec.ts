// LZ7E0 item 5 + item 6 — dev 7.14.0 / UI v4.58.651, bed "LZPT Scenarios".
// (5) LZPT's writability says byReason {field-missing: 140} over 70 rows: EVERY row
//     is Buffer-missing (and Duration-missing), so the MIXED variant is not
//     constructible on this bed. Drive the ALL-REFUSED variant twice — two rows
//     ("2 selected tickets") and one row ("1 selected ticket", the singular) — and
//     assert exactly ONE toast, and nothing staged.
// (6) RECORD ONLY: the Epic offered to Jira after a LAG (199->200, +5wd, envelope
//     LZPT-187 moves) vs after a BULK gesture on the same envelope.
// The lag is persisted by setLinkLag, so it is driven back to 0 before exit.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7e0";
const PLAN = "LZPT Scenarios";
const PLAN_ID = "plan-msq9dg8l-gz6mz1";
const FROM = "LZPT-199", TO = "LZPT-200", EPIC = "LZPT-187";
const EPICS = ["LZPT-186", "LZPT-187", "LZPT-188", "LZPT-189", "LZPT-190", "LZPT-191"];
test.describe.configure({ retries: 0, timeout: 2_400_000 });

const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const toasts = async (f: any) => await f.locator('[data-testid="toast"]').evaluateAll((els: any[]) => els.map((e) => (e.textContent || "").replace(/\s+/g, " ")));
const applyRows = async (f: any) => await f.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })));
const snap = async () => {
  const p: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  const F = ["startDate", "dueDate", "duration", "buffer"];
  const iss = p.issues || [];
  return {
    n: iss.length,
    carriers: iss.filter((i: any) => F.some((f) => String(i[f] ?? "") !== String(i._original?.[f] ?? ""))).map((i: any) => `${i.key}:${i.startDate}/${i.dueDate}/${i.duration}/${i.buffer}`),
    storedDur: iss.filter((i: any) => i.duration !== null && i.duration !== undefined).map((i: any) => `${i.key}=${i.duration}`),
    savedEditsKey: p.meta && Object.prototype.hasOwnProperty.call(p.meta, "savedEdits"),
  };
};

test("E5: the bulk bar refuses every row; the Epic after a lag vs a bulk gesture", async ({ page }) => {
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

  // ================= item 5: ALL-REFUSED, two rows =================
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  const pick = async (k: string) => {
    const r = frame.locator(`[data-testid="table-row"][data-row-key="${k}"]`).first();
    await r.scrollIntoViewIfNeeded().catch(() => {});
    const cb = frame.locator(`button[role="checkbox"][title="Select ${k}"]`).first();
    console.log("CB", k, await frame.locator(`button[role="checkbox"][title="Select ${k}"]`).count());
    await cb.dispatchEvent("click").catch((e: any) => console.log("CB_ERR", k, String(e).slice(0, 80)));
    await page.waitForTimeout(1000);
  };
  await pick("LZPT-215"); await pick("LZPT-216");
  console.log("BULK_BAR", JSON.stringify((await bodyText(frame)).match(/\d+ selected[\s\S]{0,160}/)?.[0]));
  await page.screenshot({ path: `${OUT}/e5-00-bulkbar2.png` });
  await frame.locator("button").filter({ hasText: /^Yes$/ }).first().dispatchEvent("click");
  await page.waitForTimeout(3000);
  console.log("TOASTS_2ROW", JSON.stringify(await toasts(frame)));
  console.log("TOAST_COUNT_2ROW", (await toasts(frame)).length);
  console.log("STAGED_2ROW", ((await bodyText(frame)).match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/gi) || []).join(" | ") || "(none)");
  console.log("SNAP_2ROW", JSON.stringify((await snap()).carriers));
  await page.screenshot({ path: `${OUT}/e5-01-refused2.png` });
  await page.waitForTimeout(8000);

  // ================= item 5b: ALL-REFUSED, ONE row (singular copy) =================
  await pick("LZPT-216");
  console.log("BULK_BAR_1", JSON.stringify((await bodyText(frame)).match(/\d+ selected[\s\S]{0,160}/)?.[0]));
  await frame.locator("button").filter({ hasText: /^Yes$/ }).first().dispatchEvent("click");
  await page.waitForTimeout(3000);
  console.log("TOASTS_1ROW", JSON.stringify(await toasts(frame)));
  console.log("STAGED_1ROW", ((await bodyText(frame)).match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/gi) || []).join(" | ") || "(none)");
  await page.screenshot({ path: `${OUT}/e5-02-refused1.png` });
  await page.waitForTimeout(8000);

  // ================= item 6: LAG vs BULK on the same envelope =================
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  const barAttr = async (k: string) => {
    const b = frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first();
    if (!(await b.count())) return "ABSENT";
    return `${await b.getAttribute("data-bar-start")}..${await b.getAttribute("data-bar-due")}`;
  };
  await frame.locator(`[data-testid="gantt-bar"][data-key="${TO}"]`).first().scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(1500);
  console.log("OPEN EPIC", await barAttr(EPIC), "199", await barAttr(FROM), "200", await barAttr(TO));
  const arrow = frame.locator(`[data-testid="dep-arrow-hit"][data-link="${FROM}-${TO}"]`).first();
  const setLagTo = async (want: number) => {
    for (let i = 0; i < 14; i++) {
      if (!(await frame.locator('[data-testid="dep-link-menu"]').count())) {
        await arrow.dispatchEvent("click"); await page.waitForTimeout(1500);
      }
      const cur = parseInt(((await frame.locator('[data-testid="lag-value"]').first().textContent().catch(() => "0")) || "0").trim(), 10) || 0;
      if (cur === want) break;
      await frame.locator(`[data-testid="${cur < want ? "lag-inc" : "lag-dec"}"]`).first().dispatchEvent("click");
      await page.waitForTimeout(1400);
    }
    const cur = ((await frame.locator('[data-testid="lag-value"]').first().textContent().catch(() => "")) || "").trim();
    console.log("LAG_NOW", cur, "want", want);
    await frame.locator("body").first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(2500);
    return cur;
  };
  await setLagTo(5);
  console.log("AFTER_LAG5 EPIC", await barAttr(EPIC), "200", await barAttr(TO));
  await page.screenshot({ path: `${OUT}/e5-03-lag5.png` });
  const gate = async (tag: string) => {
    const t = await bodyText(frame);
    console.log(tag, "STAGED_TEXT", (t.match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/gi) || []).join(" | ") || "(none)");
    if (!(await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).count())) { console.log(tag, "NO_APPLY_BUTTON — nothing staged"); return []; }
    await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click");
    await page.waitForTimeout(3500);
    const rows = await applyRows(frame);
    console.log(tag, "APPLY_ROWS", JSON.stringify(rows, null, 1));
    console.log(tag, "EPIC_ROWS", JSON.stringify(rows.filter((r: any) => EPICS.includes(r.key))));
    console.log(tag, "HEADER", JSON.stringify(((await frame.locator('[data-testid="apply-review-modal"]').first().textContent().catch(() => "")) || "").replace(/\s+/g, " ").slice(0, 700)));
    console.log(tag, "DRIFT_LINES", JSON.stringify(rows.filter((r: any) => /Jira gets the dates/i.test(r.text)).map((r: any) => `${r.key} :: ${r.text}`)));
    await page.screenshot({ path: `${OUT}/e5-${tag}-review.png` });
    await frame.locator("button").filter({ hasText: /^Cancel$/ }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(2000);
    return rows;
  };
  await gate("LAG");

  // BULK gesture on the SAME envelope (LZPT-200 is Epic 187's child)
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await pick(TO);
  await frame.locator("button").filter({ hasText: /^Yes$/ }).first().dispatchEvent("click");
  await page.waitForTimeout(3000);
  console.log("BULK_TOASTS", JSON.stringify(await toasts(frame)));
  await page.screenshot({ path: `${OUT}/e5-04-bulk.png` });
  await gate("BULK");

  // ---- restore: lag back to 0, discard anything staged ----
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  await frame.locator(`[data-testid="gantt-bar"][data-key="${TO}"]`).first().scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(1500);
  await setLagTo(0);
  console.log("AFTER_REVERT EPIC", await barAttr(EPIC), "200", await barAttr(TO));
  if (await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).count()) {
    await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click");
    await page.waitForTimeout(3000);
    console.log("FINAL_REVIEW_ROWS", JSON.stringify(await applyRows(frame)));
    await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(12000);
  }
  console.log("FINAL", JSON.stringify(await snap()));
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await page.screenshot({ path: `${OUT}/e5-05-final.png` });
});
