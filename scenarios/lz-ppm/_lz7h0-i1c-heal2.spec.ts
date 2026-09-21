// LZ7H0 item 1c + item 2 — dev 7.17.0 / UI v4.58.654.
// The bed is now in the EXACT shape an OLD build left behind: A holds a NUMERIC
// duration 2 (the measured span) against `_original.duration: 5` (Jira's
// declaration), `meta.savedEdits` pinned. d3687b37 claims "a plain Save/Discard
// also HEALS a row an earlier build pinned at the span" (save-payload.js
// -> assignPersistedDuration). Drive it from a FRESH hydration.
// Then item 2: one PURE-DATE drag -> Review with AI -> read data-drops-*.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";
import * as fs from "fs";
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7h0";
const bed = JSON.parse(fs.readFileSync("/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz7h0/bed.json", "utf8"));
const { A, B, D, planId: PLAN_ID, planName: PLAN } = bed;
test.describe.configure({ retries: 0, timeout: 2_400_000 });
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const snap = async () => {
  const p: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  const r: any = {};
  for (const i of p.issues || []) r[i.key] = `${i.startDate}|${i.dueDate} dur=${JSON.stringify(i.duration)} ORIGdur=${JSON.stringify(i._original?.duration)} cleared=${JSON.stringify(i.durationExplicitlyCleared)}`;
  return { r, savedEditsKey: p.meta && Object.prototype.hasOwnProperty.call(p.meta, "savedEdits") };
};

test("H1c: a fresh hydration of a span-pinned row heals on Save/Discard; AI drops line", async ({ page }) => {
  console.log("PRE", JSON.stringify(await snap(), null, 1));
  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  console.log("SHELL_REV", ((await bodyText(frame)).match(/rev\s*v?([\d.]+)/) || [])[1]);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(10000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  console.log("STAGED_ON_OPEN", ((await bodyText(frame)).match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/gi) || []).join(" | "));
  const reviewRows = async (tag: string) => {
    if (!(await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).count())) { console.log(tag, "NO_APPLY_BUTTON"); return []; }
    await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click");
    await page.waitForTimeout(3500);
    const rows = await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })));
    console.log(tag, "REVIEW_ROWS", JSON.stringify(rows, null, 1));
    await page.screenshot({ path: `${OUT}/h1c-${tag}-review.png` });
    return rows;
  };
  const cancel = async () => { await frame.locator("button").filter({ hasText: /^Cancel$/ }).first().dispatchEvent("click").catch(() => {}); await page.waitForTimeout(2000); };
  await reviewRows("ONOPEN"); await cancel();

  // --- unrelated edit: D due 06-05 -> 06-08 (Table) ---
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  const trow = frame.locator(`[data-testid="table-row"][data-row-key="${D}"]`).first();
  await trow.scrollIntoViewIfNeeded().catch(() => {});
  await trow.locator("div").filter({ hasText: /^Jun \d+$/ }).nth(1).dispatchEvent("click");
  await page.waitForTimeout(1500);
  await frame.locator('button[aria-label="2026-06-08"]').first().dispatchEvent("click");
  await page.waitForTimeout(4000);
  await reviewRows("AFTEREDIT"); await cancel();
  const btn = frame.locator('[data-testid="plan-save-btn"]').first();
  console.log("SAVE_BEFORE", ((await btn.textContent().catch(() => "")) || "").trim());
  await btn.click({ timeout: 30000 }).catch((e: any) => console.log("SAVE_ERR", String(e).slice(0, 80)));
  for (let i = 0; i < 240; i++) { if ((await btn.getAttribute("data-save-state").catch(() => null)) === "saved") break; await page.waitForTimeout(250); }
  await page.waitForTimeout(8000);
  console.log("HEAL_POSTSAVE", JSON.stringify(await snap(), null, 1), "(expect WFH-3755 dur=5)");
  await page.screenshot({ path: `${OUT}/h1c-01-saved.png` });
  await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click");
  await page.waitForTimeout(3000);
  await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click");
  await page.waitForTimeout(6000);
  console.log("HEAL_POSTDISCARD_6s", JSON.stringify(await snap(), null, 1));
  await page.waitForTimeout(9000);
  console.log("HEAL_POSTDISCARD_15s", JSON.stringify(await snap(), null, 1));
  console.log("STAGED_AFTER_HEAL", ((await bodyText(frame)).match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/gi) || []).join(" | "));
  await page.screenshot({ path: `${OUT}/h1c-02-healed.png` });

  // ---------------- item 2: a PURE-DATE drag, then Review with AI ----------------
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  await frame.locator("[data-gantt-scroll]").first().evaluate((el: any) => { el.scrollLeft = 0; }).catch(() => {});
  await page.waitForTimeout(1500);
  const dayNum = (iso: string | null) => (iso ? Math.round(new Date(`${iso}T00:00:00Z`).getTime() / 86400000) : NaN);
  const bar = frame.locator(`[data-testid="gantt-bar"][data-key="${D}"]`).first();
  console.log("BARS", JSON.stringify(await frame.locator('[data-testid="gantt-bar"]').evaluateAll((els: any[]) => els.map((e) => `${e.getAttribute("data-key")} ${e.getAttribute("data-bar-start")}..${e.getAttribute("data-bar-due")}`))));
  const bb0 = await bar.boundingBox();
  let dayPx = bb0 ? bb0.width / 3 : 24;
  const TARGET = dayNum("2026-06-10");
  for (let a = 0; a < 8; a++) {
    await bar.scrollIntoViewIfNeeded().catch(() => {});
    const before = dayNum(await bar.getAttribute("data-bar-start"));
    const need = TARGET - before; if (need === 0) break;
    const dx = Math.max(-300, Math.min(300, need * dayPx));
    const bb = await bar.boundingBox(); if (!bb) throw new Error("no bar box");
    const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(cx + (i * dx) / 8, cy, { steps: 2 }); await page.waitForTimeout(70); }
    await page.waitForTimeout(350); await page.mouse.up(); await page.waitForTimeout(2200);
    const after = dayNum(await bar.getAttribute("data-bar-start"));
    console.log(`DRAG ${a}: ${before} -> ${after} (need ${need})`);
    if (after !== before) dayPx = dx / (after - before);
  }
  console.log("BAR_AFTER_DRAG", await bar.getAttribute("data-bar-start"), await bar.getAttribute("data-bar-due"));
  const rows = await reviewRows("DRAG");
  console.log("PURE_DATE", JSON.stringify(rows.map((r: any) => ({ k: r.key, hasDur: /Dur\s*:/i.test(r.text) }))));
  const aiBtn = frame.locator("button").filter({ hasText: /Review with AI/i }).first();
  console.log("AI_BTN_COUNT", await frame.locator("button").filter({ hasText: /Review with AI/i }).count());
  await aiBtn.dispatchEvent("click");
  const modal = frame.locator('[data-testid="ai-review-modal"]').first();
  await modal.waitFor({ state: "visible", timeout: 60_000 }).catch(() => console.log("AI_MODAL_NOT_VISIBLE"));
  const t0 = Date.now();
  for (let i = 0; i < 300; i++) { const t = ((await modal.textContent().catch(() => "")) || ""); if (!/Reviewing the plan/i.test(t)) break; await page.waitForTimeout(500); }
  console.log("AI_REVIEW_MS", Date.now() - t0);
  await page.waitForTimeout(2500);
  console.log("DROPS", JSON.stringify(await modal.evaluate((e: any) => ({ total: e.getAttribute("data-drops-total"), compression: e.getAttribute("data-drops-compression"), weekend: e.getAttribute("data-drops-weekend"), ignoredEdges: e.getAttribute("data-drops-ignored-edges") })).catch(() => null)));
  console.log("DROPS_LINE_PRESENT", await frame.locator('[data-testid="ai-review-drops"]').count());
  console.log("DROPS_LINE_TEXT", JSON.stringify(((await frame.locator('[data-testid="ai-review-drops"]').first().textContent().catch(() => null)) || null)));
  console.log("AI_MODAL_TEXT >>>", ((await modal.textContent().catch(() => "")) || "").replace(/\s+/g, " "), "<<<");
  await page.screenshot({ path: `${OUT}/h1c-03-ai.png` });
  await modal.screenshot({ path: `${OUT}/h1c-03b-ai-modal.png` }).catch(() => {});
  await modal.locator("button").last().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(1500);

  // ---------------- clean up the stage ----------------
  await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click").catch(async () => {
    await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click");
    await page.waitForTimeout(3000);
    await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click");
  });
  await page.waitForTimeout(14000);
  console.log("FINAL", JSON.stringify(await snap(), null, 1));
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await page.screenshot({ path: `${OUT}/h1c-04-final.png` });
});
