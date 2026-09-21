// LZ7H0 item 2 — the REVIEW DROPS LINE (4f01029f), dev 7.17.0 / UI v4.58.654.
// One PURE-DATE drag on D (2026-06-03..06-05 -> a later week, dates only, no
// Dur line), then Review with AI. The modal must carry data-drops-total /
// -compression / -weekend / -ignored-edges; if total > 0 the line
// "N findings were withheld…" appears under the findings, if 0 it must NOT.
// ONE real model call. Everything is discarded; NEVER applies to Jira.
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
  for (const i of p.issues || []) r[i.key] = `${i.startDate}|${i.dueDate} dur=${JSON.stringify(i.duration)} ORIGdur=${JSON.stringify(i._original?.duration)}`;
  return { r, savedEditsKey: p.meta && Object.prototype.hasOwnProperty.call(p.meta, "savedEdits") };
};

test("H2: the AI review modal carries the drop counts and the withheld line", async ({ page }) => {
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
  await page.waitForTimeout(10000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  console.log("STAGED_ON_OPEN", ((await bodyText(frame)).match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/gi) || []).join(" | "));
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  console.log("ZOOM_BUTTONS", JSON.stringify(await frame.locator("button").evaluateAll((els: any[]) => els.map((e) => (e.textContent || "").trim()).filter((t: string) => /^(Day|Week|Month|Quarter|Year)$/i.test(t)))));
  await frame.getByRole("button", { name: /^Day$/i }).first().click().catch((e: any) => console.log("ZOOM_ERR", String(e).slice(0, 60)));
  await page.waitForTimeout(4000);
  const dayNum = (iso: string | null) => (iso ? Math.round(new Date(`${iso}T00:00:00Z`).getTime() / 86400000) : NaN);
  const anchor = async (k: string) => await frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first().evaluate((el: any) => ({ left: parseFloat(el.style.left), start: el.getAttribute("data-bar-start") }));
  const aA = await anchor(A), aD = await anchor(D);
  let dayPx = (aD.left - aA.left) / (dayNum(aD.start) - dayNum(aA.start));
  console.log("ANCHORS", JSON.stringify([aA, aD]), "DAY_PX", dayPx);
  const DRAGKEY = B;
  const bar = frame.locator(`[data-testid="gantt-bar"][data-key="${DRAGKEY}"]`).first();
  const TARGET = dayNum("2026-06-10");
  for (let a = 0; a < 10; a++) {
    await bar.scrollIntoViewIfNeeded().catch(() => {});
    const before = dayNum(await bar.getAttribute("data-bar-start"));
    const need = TARGET - before; if (need === 0) break;
    const dx = Math.max(-400, Math.min(400, need * dayPx));
    const bb = await bar.boundingBox(); if (!bb) throw new Error("no bar box");
    const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
    console.log("BOX", JSON.stringify(bb), "VP", JSON.stringify(page.viewportSize()));
    await page.mouse.move(cx, cy); await page.waitForTimeout(300); await page.mouse.down();
    await page.mouse.move(cx + 4, cy, { steps: 2 }); await page.waitForTimeout(200);
    for (let i = 1; i <= 10; i++) { await page.mouse.move(cx + (i * dx) / 10, cy, { steps: 2 }); await page.waitForTimeout(90); }
    if (a === 0) await page.screenshot({ path: `${OUT}/h2-mid-drag.png` });
    await page.waitForTimeout(400); await page.mouse.up(); await page.waitForTimeout(2500);
    const after = dayNum(await bar.getAttribute("data-bar-start"));
    console.log(`DRAG ${a}: ${before} -> ${after} (need ${need}, dx ${dx.toFixed(0)})`);
    if (after !== before) dayPx = dx / (after - before);
  }
  console.log("BAR_AFTER_DRAG", await bar.getAttribute("data-bar-start"), await bar.getAttribute("data-bar-due"));
  await page.screenshot({ path: `${OUT}/h2-00-dragged.png` });
  const applyBtn = frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first();
  console.log("APPLY_BTN", ((await applyBtn.textContent().catch(() => "")) || "").trim());
  await applyBtn.dispatchEvent("click");
  await page.waitForTimeout(3500);
  const rows = await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })));
  console.log("REVIEW_ROWS", JSON.stringify(rows, null, 1));
  console.log("PURE_DATE", JSON.stringify(rows.map((r: any) => ({ k: r.key, hasDur: /Dur\s*:/i.test(r.text) }))));
  const aiBtn = frame.locator("button").filter({ hasText: /Review with AI/i }).first();
  console.log("AI_BTN_COUNT", await frame.locator("button").filter({ hasText: /Review with AI/i }).count());
  await aiBtn.dispatchEvent("click");
  const modal = frame.locator('[data-testid="ai-review-modal"]').first();
  await modal.waitFor({ state: "visible", timeout: 60_000 }).catch(() => console.log("AI_MODAL_NOT_VISIBLE"));
  const t0 = Date.now();
  for (let i = 0; i < 400; i++) { const t = ((await modal.textContent().catch(() => "")) || ""); if (!/Reviewing the plan/i.test(t)) break; await page.waitForTimeout(500); }
  console.log("AI_REVIEW_MS", Date.now() - t0);
  await page.waitForTimeout(2500);
  console.log("DROPS_ATTRS", JSON.stringify(await modal.evaluate((e: any) => ({ total: e.getAttribute("data-drops-total"), compression: e.getAttribute("data-drops-compression"), weekend: e.getAttribute("data-drops-weekend"), ignoredEdges: e.getAttribute("data-drops-ignored-edges") })).catch((err: any) => String(err).slice(0, 120))));
  console.log("DROPS_LINE_COUNT", await frame.locator('[data-testid="ai-review-drops"]').count());
  console.log("DROPS_LINE_TEXT", JSON.stringify(((await frame.locator('[data-testid="ai-review-drops"]').first().textContent().catch(() => null)) || null)));
  console.log("FINDING_COUNT", await frame.locator('[data-testid="ai-review-modal"] [data-testid^="ai-finding"]').count());
  console.log("AI_MODAL_TEXT >>>", ((await modal.textContent().catch(() => "")) || "").replace(/\s+/g, " "), "<<<");
  await page.screenshot({ path: `${OUT}/h2-01-ai.png` });
  await modal.screenshot({ path: `${OUT}/h2-01b-ai-modal.png` }).catch(() => {});
  await modal.locator("button").last().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(2000);
  await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click").catch((e: any) => console.log("DISCARD_ERR", String(e).slice(0, 90)));
  await page.waitForTimeout(14000);
  console.log("FINAL", JSON.stringify(await snap(), null, 1));
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await page.screenshot({ path: `${OUT}/h2-02-final.png` });
  await frame.getByRole("button", { name: /^Week$/i }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
});
