// LZ7C0 item 5 (+ item 4's bulk-bar RECORD) — dev 7.12.0 / UI v4.58.649.
// Stage ONE pure-date drag (LZPT-216, no preds/succs), open the Apply review, run
// "Review with AI" and record every finding VERBATIM. The reviewer must NOT report a
// conflict the app has already resolved: LZPT-217 carries LZPT-196 as a predecessor
// and is RENDERED at its settled 2026-06-08, never at its stored 2026-05-04.
// Then: select the same blocked row and drive the BULK field bar (record only).
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7c0";
const PLAN = "LZPT Scenarios";
const PLAN_ID = "plan-msq9dg8l-gz6mz1";
const LEAF = "LZPT-216";
test.describe.configure({ retries: 0, timeout: 1_500_000 });

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

test("C5: the AI reviewer sees the RENDERED plan; bulk field bar on a blocked row", async ({ page }) => {
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
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4500);
  await frame.locator("[data-gantt-scroll]").first().evaluate((el: any) => { el.scrollLeft = 0; }).catch(() => {});
  await page.waitForTimeout(1500);

  // the app's OWN answer for the pair the reviewer used to flag
  const barOf = async (k: string) => ({ k, s: await frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first().getAttribute("data-bar-start").catch(() => null), d: await frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first().getAttribute("data-bar-due").catch(() => null) });
  console.log("RENDERED_196", JSON.stringify(await barOf("LZPT-196")));
  console.log("RENDERED_217", JSON.stringify(await barOf("LZPT-217")));

  const dayNum = (iso: string | null) => (iso ? Math.round(new Date(`${iso}T00:00:00Z`).getTime() / 86400000) : NaN);
  const anchor = async (k: string) => await frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first()
    .evaluate((el: any) => ({ left: parseFloat(el.style.left), start: el.getAttribute("data-bar-start") }));
  const aA = await anchor("LZPT-218"), aB = await anchor("LZPT-226");
  let dayPx = (aB.left - aA.left) / (dayNum(aB.start) - dayNum(aA.start));
  console.log("DAY_PX", dayPx);
  const bar = frame.locator(`[data-testid="gantt-bar"][data-key="${LEAF}"]`).first();
  const TARGET = dayNum("2026-05-11");
  for (let attempt = 0; attempt < 8; attempt++) {
    await bar.scrollIntoViewIfNeeded().catch(() => {});
    const before = dayNum(await bar.getAttribute("data-bar-start"));
    const need = TARGET - before;
    if (need === 0) break;
    const dx = Math.max(-120, Math.min(120, need * dayPx));
    const bb = await bar.boundingBox(); if (!bb) throw new Error("no bar box");
    const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(cx + (i * dx) / 8, cy, { steps: 2 }); await page.waitForTimeout(70); }
    await page.waitForTimeout(350); await page.mouse.up(); await page.waitForTimeout(2200);
    const after = dayNum(await bar.getAttribute("data-bar-start"));
    console.log(`DRAG ${attempt}: ${before} -> ${after} (need ${need}, dx ${dx.toFixed(0)})`);
    if (after !== before) dayPx = dx / (after - before);
  }
  console.log("BAR_AFTER_DRAG", await bar.getAttribute("data-bar-start"), await bar.getAttribute("data-bar-due"));
  console.log("STAGED_AFTER_DRAG", ((await bodyText(frame)).match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/i) || [])[0]);
  await page.screenshot({ path: `${OUT}/c5-00-dragged.png` });

  const applyBtn = frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first();
  console.log("APPLY_BTN", ((await applyBtn.textContent().catch(() => "")) || "").trim());
  await applyBtn.dispatchEvent("click");
  await page.waitForTimeout(3500);
  console.log("REVIEW_ROWS", JSON.stringify(await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })))));

  // ---- Review with AI ----
  const aiBtn = frame.locator("button").filter({ hasText: /Review with AI/i }).first();
  console.log("AI_BTN_COUNT", await frame.locator("button").filter({ hasText: /Review with AI/i }).count());
  await aiBtn.dispatchEvent("click");
  await frame.locator('[data-testid="ai-review-modal"]').first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => console.log("AI_MODAL_NOT_VISIBLE"));
  const t0 = Date.now();
  for (let i = 0; i < 240; i++) {
    const t = ((await frame.locator('[data-testid="ai-review-modal"]').first().textContent().catch(() => "")) || "");
    if (!/Reviewing the plan/i.test(t)) break;
    await page.waitForTimeout(500);
  }
  console.log("AI_REVIEW_MS", Date.now() - t0);
  await page.waitForTimeout(1500);
  const aiText = ((await frame.locator('[data-testid="ai-review-modal"]').first().textContent().catch(() => "")) || "").replace(/\s+/g, " ");
  console.log("AI_MODAL_TEXT_VERBATIM >>>", aiText, "<<<");
  console.log("AI_MENTIONS_217", /LZPT-217/.test(aiText), "AI_MENTIONS_196", /LZPT-196/.test(aiText));
  console.log("AI_MENTIONS_216", /LZPT-216/.test(aiText));
  await page.screenshot({ path: `${OUT}/c5-01-ai-review.png` });
  await frame.locator('[data-testid="ai-review-modal"]').first().screenshot({ path: `${OUT}/c5-01b-ai-modal.png` }).catch(() => {});

  // close AI modal, discard everything
  await frame.locator('[data-testid="ai-review-modal"]').locator("button").last().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/c5-02-back-to-review.png` });
  await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click").catch((e: any) => console.log("DISCARD_ERR", String(e).slice(0, 80)));
  await page.waitForTimeout(12000);
  console.log("AFTER_DISCARD", JSON.stringify(await snap()));
  console.log("STAGED_AFTER_DISCARD", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));

  // ---- BULK field bar on a blocked row (record only) ----
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  const row = frame.locator('[data-testid="table-row"][data-row-key="LZPT-215"]').first();
  await row.scrollIntoViewIfNeeded().catch(() => {});
  const cb = frame.locator('button[role="checkbox"][title="Select LZPT-215"]').first();
  console.log("CHECKBOX_COUNT", await frame.locator('button[role="checkbox"][title="Select LZPT-215"]').count());
  await cb.dispatchEvent("click").catch((e: any) => console.log("CB_ERR", String(e).slice(0, 80)));
  await page.waitForTimeout(1500);
  console.log("BULK_BAR", JSON.stringify((await bodyText(frame)).match(/\d+ selected[\s\S]{0,140}/)?.[0]));
  await page.screenshot({ path: `${OUT}/c5-03-bulkbar.png` });
  const yesBtns = frame.locator("button").filter({ hasText: /^Yes$/ });
  console.log("YES_BTNS", await yesBtns.count());
  await yesBtns.first().dispatchEvent("click").catch((e: any) => console.log("YES_ERR", String(e).slice(0, 80)));
  await page.waitForTimeout(2500);
  console.log("BULK_TOAST", JSON.stringify(((await frame.locator('[data-testid="toast"]').first().textContent().catch(() => "")) || "").replace(/\s+/g, " ")));
  console.log("BULK_STAGED", ((await bodyText(frame)).match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/i) || [])[0] || "none");
  console.log("BULK_ROW_TEXT", ((await row.textContent()) || "").replace(/\s+/g, " ").slice(0, 200));
  await page.screenshot({ path: `${OUT}/c5-04-bulk-set.png` });
  const ab = frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ });
  if (await ab.count()) {
    await ab.first().dispatchEvent("click");
    await page.waitForTimeout(3000);
    console.log("BULK_REVIEW_ROWS", JSON.stringify(await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })))));
    await page.screenshot({ path: `${OUT}/c5-05-bulk-review.png` });
    await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click");
    await page.waitForTimeout(12000);
  }
  const fin = await snap();
  console.log("FINAL", JSON.stringify(fin));
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await page.screenshot({ path: `${OUT}/c5-06-final.png` });
});
