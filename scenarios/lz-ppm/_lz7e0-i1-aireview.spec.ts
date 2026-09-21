// LZ7E0 item 1 (UI half) + item 4 — dev 7.14.0 / UI v4.58.651, bed "LZPT Scenarios".
// (1) A PURE-DATE drag on LZPT-216 (EDGE weekend-span, 2026-05-08..05-12, no preds,
//     no succs) to 2026-05-11..05-13 — the EXACT 3wd -> 3wd shape the 7.12.0 reviewer
//     called "compressed ... shifting into a weekend". Run "Review with AI" and record
//     every finding VERBATIM. It must name no precedence conflict on the CUT edge
//     LZPT-202 -> LZPT-203 (meta.cycleEdges), no compression, and no weekend for a
//     Mon..Wed span.
// (4) DateEditor "Clear" on a NORMAL row (LZPT-215, dates writable) must clear and
//     stage. The refusal half is not constructible on this bed (writability: blocked 0).
// Read-only: everything is discarded, nothing is applied to Jira, nothing is saved.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7e0";
const PLAN = "LZPT Scenarios";
const PLAN_ID = "plan-msq9dg8l-gz6mz1";
const LEAF = "LZPT-216";
const CLEARROW = "LZPT-215";
test.describe.configure({ retries: 0, timeout: 1_800_000 });

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

test("E1: the AI reviewer on a pure-date drag; Clear on a writable row", async ({ page }) => {
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
  console.log("CYCLE_BANNER", JSON.stringify(((await bodyText(frame)).match(/[^.]{0,160}ignore[sd]?[^.]{0,160}\./g) || []).slice(0, 4)));

  const dayNum = (iso: string | null) => (iso ? Math.round(new Date(`${iso}T00:00:00Z`).getTime() / 86400000) : NaN);
  const anchor = async (k: string) => await frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first()
    .evaluate((el: any) => ({ left: parseFloat(el.style.left), start: el.getAttribute("data-bar-start") }));
  const aA = await anchor("LZPT-218"), aB = await anchor("LZPT-226");
  let dayPx = (aB.left - aA.left) / (dayNum(aB.start) - dayNum(aA.start));
  console.log("DAY_PX", dayPx);
  const bar = frame.locator(`[data-testid="gantt-bar"][data-key="${LEAF}"]`).first();
  console.log("BAR_BEFORE", await bar.getAttribute("data-bar-start"), await bar.getAttribute("data-bar-due"));
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
  await page.screenshot({ path: `${OUT}/e1-00-dragged.png` });

  const applyBtn = frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first();
  console.log("APPLY_BTN", ((await applyBtn.textContent().catch(() => "")) || "").trim());
  await applyBtn.dispatchEvent("click");
  await page.waitForTimeout(3500);
  console.log("REVIEW_ROWS", JSON.stringify(await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })))));
  await page.screenshot({ path: `${OUT}/e1-01-review.png` });

  // ---- Review with AI (ONE real model call) ----
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
  await page.waitForTimeout(2000);
  const aiText = ((await frame.locator('[data-testid="ai-review-modal"]').first().textContent().catch(() => "")) || "").replace(/\s+/g, " ");
  console.log("AI_MODAL_TEXT_VERBATIM >>>", aiText, "<<<");
  console.log("AI_MENTIONS_202", /LZPT-202/.test(aiText), "AI_MENTIONS_203", /LZPT-203/.test(aiText));
  console.log("AI_MENTIONS_216", /LZPT-216/.test(aiText));
  console.log("AI_COMPRESS", JSON.stringify((aiText.match(/[^.]{0,140}compress[^.]{0,120}\./gi) || [])));
  console.log("AI_WEEKEND", JSON.stringify((aiText.match(/[^.]{0,140}weekend[^.]{0,120}\./gi) || [])));
  console.log("AI_PRECEDENCE", JSON.stringify((aiText.match(/[^.]{0,140}(depend|predecessor|precede)[^.]{0,120}\./gi) || [])));
  await page.screenshot({ path: `${OUT}/e1-02-ai-review.png` });
  await frame.locator('[data-testid="ai-review-modal"]').first().screenshot({ path: `${OUT}/e1-02b-ai-modal.png` }).catch(() => {});

  await frame.locator('[data-testid="ai-review-modal"]').locator("button").last().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(1500);
  await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click").catch((e: any) => console.log("DISCARD_ERR", String(e).slice(0, 80)));
  await page.waitForTimeout(12000);
  console.log("AFTER_DISCARD", JSON.stringify(await snap()));
  console.log("STAGED_AFTER_DISCARD", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));

  // ---- item 4: DateEditor Clear on a WRITABLE row ----
  const cbar = frame.locator(`[data-testid="gantt-bar"][data-key="${CLEARROW}"]`).first();
  await cbar.scrollIntoViewIfNeeded().catch(() => {});
  console.log("CLEARROW_BEFORE", await cbar.getAttribute("data-bar-start"), await cbar.getAttribute("data-bar-due"));
  await cbar.dblclick().catch((e: any) => console.log("DBL_ERR", String(e).slice(0, 80)));
  await page.waitForTimeout(2500);
  console.log("DATE_EDITOR", await frame.locator('[data-testid="date-editor"]').count());
  await page.screenshot({ path: `${OUT}/e1-03-editor.png` });
  const clearBtn = frame.locator('[data-testid="date-editor"] button').filter({ hasText: /^Clear$/ }).first();
  console.log("CLEAR_BTN_COUNT", await frame.locator('[data-testid="date-editor"] button').filter({ hasText: /^Clear$/ }).count());
  await clearBtn.dispatchEvent("click").catch((e: any) => console.log("CLEAR_ERR", String(e).slice(0, 80)));
  await page.waitForTimeout(3000);
  const afterClear = await bodyText(frame);
  console.log("CLEAR_TOAST", JSON.stringify((afterClear.match(/[^.·]*won't be stored[^.·]*/i) || afterClear.match(/Jira (holds|won't)[^.]*/i) || [])[0] ?? null));
  console.log("CLEAR_STAGED", ((afterClear.match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/gi) || []).join(" | ")) || "(none)");
  console.log("CLEARROW_AFTER", await cbar.getAttribute("data-bar-start").catch(() => "ABSENT"), await cbar.getAttribute("data-bar-due").catch(() => "ABSENT"), "barCount", await frame.locator(`[data-testid="gantt-bar"][data-key="${CLEARROW}"]`).count());
  await page.screenshot({ path: `${OUT}/e1-04-cleared.png` });
  if (await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).count()) {
    await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click");
    await page.waitForTimeout(3000);
    console.log("CLEAR_REVIEW_ROWS", JSON.stringify(await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })))));
    await page.screenshot({ path: `${OUT}/e1-05-clear-review.png` });
    await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(12000);
  }
  console.log("FINAL", JSON.stringify(await snap()));
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await page.screenshot({ path: `${OUT}/e1-06-final.png` });
});
