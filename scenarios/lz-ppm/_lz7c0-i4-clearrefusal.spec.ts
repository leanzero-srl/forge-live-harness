// LZ7C0 item 4 — dev 7.12.0 / UI v4.58.649. LZPT has NO PPM Duration field, so the
// 42d on LZPT-215 is a SPAN the normalizer measured. Clearing it must be refused OUT
// LOUD ("Duration won't be stored on this issue"), the cell must keep 42d, and
// NOTHING may stage — in the Table cell AND in the Gantt's DateEditor.
// Also records (does not gate) what the BULK field bar does on the same blocked row.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7c0";
const PLAN = "LZPT Scenarios";
const PLAN_ID = "plan-msq9dg8l-gz6mz1";
const ROW = "LZPT-215";
test.describe.configure({ retries: 0, timeout: 1_200_000 });

const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const snap = async () => {
  const p: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  const F = ["startDate", "dueDate", "duration", "buffer"];
  const iss = p.issues || [];
  return {
    n: iss.length,
    dec: iss.filter((i: any) => i.durationExplicitlyCleared === true).map((i: any) => i.key),
    storedDur: iss.filter((i: any) => i.duration !== null && i.duration !== undefined).map((i: any) => `${i.key}=${i.duration}`),
    carriers: iss.filter((i: any) => F.some((f) => String(i[f] ?? "") !== String(i._original?.[f] ?? ""))).map((i: any) => `${i.key}:${i.startDate}/${i.dueDate}/${i.duration}/${i.buffer}`),
    savedEditsKey: p.meta && Object.prototype.hasOwnProperty.call(p.meta, "savedEdits"),
  };
};
/** Watch the toast: when it appeared, what it said, how long it stayed. */
const watchToast = async (page: any, frame: any, tag: string, gesture: () => Promise<void>) => {
  const t0 = Date.now();
  await gesture();
  let appearedAt = -1, text = "";
  while (Date.now() - t0 < 15000) {
    const n = await frame.locator('[data-testid="toast"]').count();
    if (n) { appearedAt = Date.now() - t0; text = ((await frame.locator('[data-testid="toast"]').first().textContent()) || "").replace(/\s+/g, " ").trim(); break; }
    await page.waitForTimeout(80);
  }
  console.log(tag, "TOAST_APPEARED_MS", appearedAt, "TEXT", JSON.stringify(text));
  if (appearedAt < 0) return { appearedAt, text, visibleMs: -1 };
  const tShow = Date.now();
  let visibleMs = -1;
  while (Date.now() - tShow < 12000) {
    if ((await frame.locator('[data-testid="toast"]').count()) === 0) { visibleMs = Date.now() - tShow; break; }
    await page.waitForTimeout(100);
  }
  console.log(tag, "TOAST_VISIBLE_MS", visibleMs < 0 ? ">12000" : visibleMs, "| >=500ms?", visibleMs < 0 || visibleMs >= 500);
  return { appearedAt, text, visibleMs };
};

test("C4: the duration clear is refused out loud in the Table and in the Gantt editor", async ({ page }) => {
  console.log("PRE", JSON.stringify(await snap()));
  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  console.log("SHELL_REV", ((await bodyText(frame)).match(/rev\s*v?([\d.]+)/) || [])[1]);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  console.log("STAGED_ON_OPEN", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));

  // ---------- A. the TABLE cell ----------
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  const row = frame.locator(`[data-testid="table-row"][data-row-key="${ROW}"]`).first();
  await row.scrollIntoViewIfNeeded().catch(() => {});
  const before = { s: await row.getAttribute("data-row-start"), d: await row.getAttribute("data-row-due"), du: await row.getAttribute("data-row-duration") };
  console.log("TABLE_BEFORE", JSON.stringify(before), "| text:", ((await row.textContent()) || "").replace(/\s+/g, " ").slice(0, 160));
  const bb0 = await row.boundingBox();
  if (bb0) await page.screenshot({ path: `${OUT}/c4-00-before.png`, clip: { x: Math.max(0, bb0.x - 10), y: Math.max(0, bb0.y - 60), width: Math.min(1400, bb0.width + 20), height: 140 } });

  const tA = await watchToast(page, frame, "TABLE", async () => {
    const durCell = row.locator("div").filter({ hasText: /^\d+d$/ }).last();
    await durCell.dispatchEvent("click");
    await page.waitForTimeout(900);
    const input = row.locator('input[inputmode="numeric"]').first();
    console.log("TABLE_EDITOR_OPEN", await input.count());
    await input.fill("");
    await input.press("Enter");
  });
  // screenshot WHILE it is up: re-fire and shoot immediately
  await page.waitForTimeout(500);
  const after = { s: await row.getAttribute("data-row-start"), d: await row.getAttribute("data-row-due"), du: await row.getAttribute("data-row-duration") };
  console.log("TABLE_AFTER", JSON.stringify(after), "| text:", ((await row.textContent()) || "").replace(/\s+/g, " ").slice(0, 160));
  console.log("TABLE_CELL_KEPT_42", after.du === "42");
  console.log("TABLE_STAGED", ((await bodyText(frame)).match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/i) || [])[0] || "none");
  console.log("TABLE_SNAP", JSON.stringify(await snap()));

  // re-fire the same gesture and screenshot the live toast
  const durCell2 = row.locator("div").filter({ hasText: /^\d+d$/ }).last();
  await durCell2.dispatchEvent("click");
  await page.waitForTimeout(700);
  await row.locator('input[inputmode="numeric"]').first().fill("");
  await row.locator('input[inputmode="numeric"]').first().press("Enter");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/c4-01-table-toast.png` });
  console.log("TOAST_TEXT_SHOT", JSON.stringify(((await frame.locator('[data-testid="toast"]').first().textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim()));
  await page.waitForTimeout(5000);

  // ---------- B. the GANTT DateEditor ----------
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  const bar = frame.locator(`[data-testid="gantt-bar"][data-key="${ROW}"]`).first();
  await bar.scrollIntoViewIfNeeded().catch(() => {});
  await bar.dispatchEvent("click");
  await page.waitForTimeout(2000);
  const editorOpen = await frame.locator('[data-testid="dateeditor-apply"]').count();
  console.log("DATEEDITOR_OPEN", editorOpen);
  await page.screenshot({ path: `${OUT}/c4-02-editor-open.png` });
  if (editorOpen) {
    const durInput = frame.locator('input[inputmode="numeric"]').first();
    console.log("EDITOR_DUR_VALUE", await durInput.inputValue().catch(() => "?"));
    const tB = await watchToast(page, frame, "GANTT", async () => {
      await durInput.fill("");
      await page.waitForTimeout(600);
      console.log("APPLY_DISABLED", await frame.locator('[data-testid="dateeditor-apply"]').first().isDisabled().catch(() => "?"));
      await frame.locator('[data-testid="dateeditor-apply"]').first().dispatchEvent("click");
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/c4-03-gantt-toast.png` });
    console.log("GANTT_TOAST", JSON.stringify(tB));
    console.log("GANTT_STAGED", ((await bodyText(frame)).match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/i) || [])[0] || "none");
    console.log("GANTT_BAR_AFTER", await bar.getAttribute("data-bar-start"), await bar.getAttribute("data-bar-due"));
    console.log("GANTT_SNAP", JSON.stringify(await snap()));
    await page.waitForTimeout(5000);
  }

  // ---------- C. the BULK field bar on the same blocked row (RECORD only) ----------
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  const row3 = frame.locator(`[data-testid="table-row"][data-row-key="${ROW}"]`).first();
  await row3.scrollIntoViewIfNeeded().catch(() => {});
  const cb = row3.locator('input[type="checkbox"]').first();
  console.log("ROW_CHECKBOX", await cb.count());
  await cb.dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(1200);
  const barText = (await bodyText(frame)).match(/\d+ selected[\s\S]{0,120}/)?.[0];
  console.log("BULK_BAR", JSON.stringify(barText));
  await page.screenshot({ path: `${OUT}/c4-04-bulkbar.png` });
  const yes = frame.locator("button").filter({ hasText: /^Yes$/ }).first();
  console.log("BULK_YES_COUNT", await frame.locator("button").filter({ hasText: /^Yes$/ }).count());
  const tC = await watchToast(page, frame, "BULK", async () => { await yes.dispatchEvent("click"); });
  await page.waitForTimeout(2500);
  console.log("BULK_STAGED", ((await bodyText(frame)).match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/i) || [])[0] || "none");
  console.log("BULK_ROW_BUFFER_TEXT", ((await row3.textContent()) || "").replace(/\s+/g, " ").slice(0, 200));
  const bulkSnap = await snap();
  console.log("BULK_SNAP", JSON.stringify(bulkSnap));
  await page.screenshot({ path: `${OUT}/c4-05-bulk-applied.png` });
  // what does the review say about a buffer Jira cannot store?
  const ab = frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ });
  if (await ab.count()) {
    await ab.first().dispatchEvent("click");
    await page.waitForTimeout(3000);
    console.log("BULK_REVIEW_ROWS", JSON.stringify(await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })))));
    await page.screenshot({ path: `${OUT}/c4-06-bulk-review.png` });
    await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click");
    await page.waitForTimeout(12000);
  }
  const fin = await snap();
  console.log("FINAL", JSON.stringify(fin));
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await page.screenshot({ path: `${OUT}/c4-07-final.png` });
});
