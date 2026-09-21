// LZ7B0 item 5 — regression sweep on the derived surfaces (F13 chip, F4 past-date
// group / review subtitle, F14 bulk-bar count) plus the AI-summary path (the Apply
// review's "Review with AI" must not report a phantom duration change after a pure
// date drag). Read-only except for one drag that is discarded. NEVER applies.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7b0";
const PLAN = "LZPT Scenarios";
const PLAN_ID = "plan-msq9dg8l-gz6mz1";
test.describe.configure({ retries: 0, timeout: 1_200_000 });

const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const snap = async () => {
  const p: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  const F = ["startDate", "dueDate", "duration", "buffer"];
  return {
    carriers: (p.issues || []).filter((i: any) => F.some((f) => String(i[f] ?? "") !== String(i._original?.[f] ?? ""))).map((i: any) => i.key),
    dec: (p.issues || []).filter((i: any) => i.durationExplicitlyCleared === true).map((i: any) => i.key),
    n: (p.issues || []).length,
    savedEdits: p.meta?.savedEdits ?? null,
  };
};

test("I5: derived chip / review dialog / bulk bar counts, and the AI summary has no phantom duration", async ({ page }) => {
  console.log("PRE", JSON.stringify(await snap()));
  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(8000);
  console.log("SHELL_REV", ((await bodyText(frame)).match(/rev\s*v?([\d.]+)/) || [])[1]);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(7000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  console.log("STAGED_ON_OPEN", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));

  // ---- F13: the toolbar chip ----
  const chip = frame.locator('[data-testid="derived-count-chip"]').first();
  console.log("CHIP_COUNT", await frame.locator('[data-testid="derived-count-chip"]').count());
  console.log("CHIP_TEXT", ((await chip.textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim());
  const chipBox = await chip.boundingBox();
  if (chipBox) await page.screenshot({ path: `${OUT}/i5-01-chip.png`, clip: { x: Math.max(0, chipBox.x - 20), y: Math.max(0, chipBox.y - 20), width: 620, height: 70 } });

  // ---- F4 / review dialog ----
  await chip.dispatchEvent("click");
  await page.waitForTimeout(2500);
  const dlg = frame.locator('[data-testid="derived-review-dialog"]');
  console.log("DIALOG_PRESENT", await dlg.count());
  console.log("DIALOG_SUBTITLE", ((await frame.locator('[data-testid="derived-review-subtitle"]').first().textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim());
  console.log("DIALOG_ROWS", JSON.stringify(await frame.locator('[data-testid="derived-review-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-key"), sel: e.getAttribute("data-selected"), text: (e.textContent || "").replace(/\s+/g, " ") })))));
  console.log("DIALOG_TEXT", (await bodyText(frame)).match(/Rows that differ from Jira[\s\S]{0,900}/)?.[0]);
  const adoptBtn = frame.locator('[data-testid="derived-review-adopt"]').first();
  console.log("ADOPT_BTN", ((await adoptBtn.textContent().catch(() => "")) || "").trim(), "disabled=", await adoptBtn.isDisabled().catch(() => "n/a"));
  console.log("DIALOG_FINISH", ((await frame.locator('[data-testid="derived-review-finish"]').first().textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim());
  await page.screenshot({ path: `${OUT}/i5-02-review-dialog.png` });
  await frame.locator('[data-testid="derived-review-cancel"]').first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(1500);
  console.log("DIALOG_CLOSED", (await frame.locator('[data-testid="derived-review-dialog"]').count()) === 0);

  // ---- F14: the bulk bar counts ADOPTABLE rows only ----
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  for (const key of ["LZPT-202", "LZPT-217"]) {
    const row = frame.locator(`[data-testid="table-row"][data-row-key="${key}"]`).first();
    await row.scrollIntoViewIfNeeded().catch(() => {});
    console.log(`ROW ${key} derived=`, await row.getAttribute("data-row-derived"), "status=", await row.getAttribute("data-row-status"));
    await row.locator('input[type="checkbox"], [role="checkbox"]').first().dispatchEvent("click").catch(async () => {
      await row.locator("div").first().dispatchEvent("click");
    });
    await page.waitForTimeout(900);
  }
  const bulk = frame.locator('[data-testid="bulk-adopt-derived"]').first();
  console.log("BULK_PRESENT", await frame.locator('[data-testid="bulk-adopt-derived"]').count());
  console.log("BULK_LABEL", ((await bulk.textContent().catch(() => "")) || "").trim(), "data-count=", await bulk.getAttribute("data-count").catch(() => null), "disabled=", await bulk.isDisabled().catch(() => "n/a"));
  console.log("BULK_BAR_TEXT", (await bodyText(frame)).match(/\d+ selected[\s\S]{0,200}/)?.[0]);
  await page.screenshot({ path: `${OUT}/i5-03-bulkbar.png` });
  await frame.locator("button").filter({ hasText: /^Clear$/ }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(1500);
  console.log("AFTER_CLEAR staged", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));

  // ---- AI summary: a PURE DATE drag must not be reported as a duration change ----
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  const dayNum = (iso: string | null) => (iso ? Math.round(new Date(`${iso}T00:00:00Z`).getTime() / 86400000) : NaN);
  const anchor = async (k: string) => await frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first()
    .evaluate((el: any) => ({ left: parseFloat(el.style.left), start: el.getAttribute("data-bar-start") }));
  const aA = await anchor("LZPT-218"), aB = await anchor("LZPT-226");
  let dayPx = (aB.left - aA.left) / (dayNum(aB.start) - dayNum(aA.start));
  const bar = frame.locator(`[data-testid="gantt-bar"][data-key="LZPT-216"]`).first();
  for (let attempt = 0; attempt < 8; attempt++) {
    await bar.scrollIntoViewIfNeeded().catch(() => {});
    const before = dayNum(await bar.getAttribute("data-bar-start"));
    const need = dayNum("2026-05-11") - before;
    if (need === 0) break;
    const dx = Math.max(-150, Math.min(150, need * dayPx));
    const bb = await bar.boundingBox(); if (!bb) break;
    const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(cx + (i * dx) / 8, cy, { steps: 2 }); await page.waitForTimeout(70); }
    await page.waitForTimeout(350); await page.mouse.up(); await page.waitForTimeout(2200);
    const after = dayNum(await bar.getAttribute("data-bar-start"));
    if (after !== before) dayPx = dx / (after - before);
  }
  console.log("AI_DRAG_RESULT", await bar.getAttribute("data-bar-start"), await bar.getAttribute("data-bar-due"));
  const applyBtn = frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first();
  console.log("APPLY_BTN", ((await applyBtn.textContent().catch(() => "")) || "").trim());
  await applyBtn.dispatchEvent("click");
  await page.waitForTimeout(3000);
  console.log("APPLY_ROWS", JSON.stringify(await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })))));
  const aiBtn = frame.locator("button").filter({ hasText: /Review with AI/i }).first();
  console.log("AI_BTN", await frame.locator("button").filter({ hasText: /Review with AI/i }).count());
  await aiBtn.dispatchEvent("click");
  for (let i = 0; i < 100; i++) {
    const t = await bodyText(frame);
    if (!/Reviewing|Analy[sz]ing|loading/i.test(t) && /AI/i.test(t) && i > 8) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(4000);
  const aiText = await bodyText(frame);
  console.log("AI_MENTIONS_DURATION", /duration/i.test(aiText));
  console.log("AI_TEXT", (aiText.match(/AI Review[\s\S]{0,1600}/i) || aiText.match(/Review with AI[\s\S]{0,1600}/i) || [])[0]);
  await page.screenshot({ path: `${OUT}/i5-04-ai-review.png` });

  // ---- restore ----
  const closes = frame.locator("button").filter({ hasText: /^(Close|Cancel)$/i });
  console.log("CLOSE_BUTTONS", await closes.count());
  await closes.last().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(2000);
  if ((await frame.locator('[data-testid="apply-review-modal"]').count()) === 0) {
    await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(2500);
  }
  console.log("DISCARD_BTNS", await frame.locator("button").filter({ hasText: /^Discard All$/ }).count());
  await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(10000);
  await page.screenshot({ path: `${OUT}/i5-05-final.png` });
  console.log("FINAL", JSON.stringify(await snap()));
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
});
