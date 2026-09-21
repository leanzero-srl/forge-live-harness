// LZ7B0 item 2, the POSITIVE control for `durationExplicitlyCleared`: clearing a
// duration with the Table editor's clear gesture on a Jira-null row (LZPT-215) must
// stamp the flag on THAT ROW ONLY, and the row must then render BLANK (the stamp is
// what suppresses the re-derivation). Restored with refreshPlan afterwards.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7b0";
const PLAN = "LZPT Scenarios";
const PLAN_ID = "plan-msq9dg8l-gz6mz1";
const ROW = "LZPT-215";
test.describe.configure({ retries: 0, timeout: 900_000 });

const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const snap = async () => {
  const p: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  const F = ["startDate", "dueDate", "duration", "buffer"];
  const r = (p.issues || []).find((i: any) => i.key === ROW);
  return {
    n: (p.issues || []).length,
    dec: (p.issues || []).filter((i: any) => i.durationExplicitlyCleared === true).map((i: any) => i.key),
    carriers: (p.issues || []).filter((i: any) => F.some((f) => String(i[f] ?? "") !== String(i._original?.[f] ?? ""))).map((i: any) => i.key),
    row: r ? { s: r.startDate, d: r.dueDate, du: r.duration, dec: r.durationExplicitlyCleared === true } : null,
    savedEdits: p.meta?.savedEdits ?? null,
  };
};

test("I2: the editor's clear gesture stamps durationExplicitlyCleared on that row only", async ({ page }) => {
  console.log("PRE", JSON.stringify(await snap()));
  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(8000);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(7000);
  if (!/Gantt|Table/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  console.log("STAGED_ON_OPEN", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);

  const row = frame.locator(`[data-testid="table-row"][data-row-key="${ROW}"]`).first();
  await row.scrollIntoViewIfNeeded().catch(() => {});
  console.log("BEFORE start/due/dur", await row.getAttribute("data-row-start"), await row.getAttribute("data-row-due"), JSON.stringify(await row.getAttribute("data-row-duration")));
  const durCell = row.locator("div").filter({ hasText: /^\d+d$/ }).last();
  await durCell.dispatchEvent("click");
  await page.waitForTimeout(900);
  const input = row.locator('input[inputmode="numeric"]').first();
  console.log("EDITOR_OPEN", await input.count());
  await input.fill("");
  await input.press("Enter");
  await page.waitForTimeout(2500);
  console.log("AFTER_CLEAR start/due/dur", await row.getAttribute("data-row-start"), await row.getAttribute("data-row-due"), JSON.stringify(await row.getAttribute("data-row-duration")));
  console.log("ROW_TEXT", ((await row.textContent()) || "").replace(/\s+/g, " ").slice(0, 160));
  console.log("STAGED_AFTER_CLEAR", ((await bodyText(frame)).match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/i) || [])[0]);
  const bb = await row.boundingBox();
  if (bb) await page.screenshot({ path: `${OUT}/i2-01-cleared.png`, clip: { x: Math.max(0, bb.x - 10), y: Math.max(0, bb.y - 60), width: Math.min(1400, bb.width + 20), height: 140 } });

  // Does the Gantt call it a changed row?
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(3500);
  const style = await frame.locator(`[data-testid="gantt-bar"][data-key="${ROW}"]`).first()
    .evaluate((el: any) => { const c = getComputedStyle(el); return { outlineColor: c.outlineColor, outline: c.outline }; }).catch((e: any) => String(e).slice(0, 80));
  console.log("BAR_STYLE_AFTER_CLEAR", JSON.stringify(style), "(amber = rgb(217, 119, 6))");
  const amber = await frame.locator('[data-testid="gantt-bar"]').evaluateAll((els: any[]) => els.filter((e) => getComputedStyle(e).outlineColor === "rgb(217, 119, 6)").map((e) => e.getAttribute("data-key")));
  console.log("AMBER_BARS", JSON.stringify(amber));

  // Apply review for the clear
  const applyBtn = frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first();
  const applyCount = await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).count();
  console.log("APPLY_BTN", applyCount, applyCount ? ((await applyBtn.textContent()) || "").trim() : "none");
  if (applyCount) {
    await applyBtn.dispatchEvent("click");
    await page.waitForTimeout(3000);
    console.log("APPLY_ROWS", JSON.stringify(await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })))));
    await page.screenshot({ path: `${OUT}/i2-02-apply-clear.png` });
    await frame.locator("button").filter({ hasText: /^Cancel$/ }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(1500);
  }

  // SAVE -> the stamp
  const btn = frame.locator('[data-testid="plan-save-btn"]').first();
  console.log("SAVE_LABEL", ((await btn.textContent().catch(() => "")) || "").trim());
  await btn.click({ timeout: 30000 }).catch((e: any) => console.log("SAVE_CLICK_ERR", String(e).slice(0, 100)));
  for (let i = 0; i < 200; i++) { if ((await btn.getAttribute("data-save-state").catch(() => null)) === "saved") break; await page.waitForTimeout(250); }
  await page.waitForTimeout(2500);
  const post = await snap();
  console.log("POST-SAVE", JSON.stringify(post));
  console.log("STAMPED_ON_ONLY_THAT_ROW", JSON.stringify(post.dec) === JSON.stringify([ROW]), "of", post.n);

  // Reload and read the row: the stamp must suppress the re-derivation (BLANK)
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  const s2 = await enterForgeSurface(page, { surface: "custom" });
  const f2: any = s2.kind === "custom" ? s2.frame : null;
  await page.waitForTimeout(6000);
  await f2.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  await f2.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  const row2 = f2.locator(`[data-testid="table-row"][data-row-key="${ROW}"]`).first();
  await row2.scrollIntoViewIfNeeded().catch(() => {});
  console.log("AFTER_RELOAD dur =", JSON.stringify(await row2.getAttribute("data-row-duration")), "| text:", ((await row2.textContent()) || "").replace(/\s+/g, " ").slice(0, 160));
  const bb2 = await row2.boundingBox();
  if (bb2) await page.screenshot({ path: `${OUT}/i2-03-reloaded.png`, clip: { x: Math.max(0, bb2.x - 10), y: Math.max(0, bb2.y - 60), width: Math.min(1400, bb2.width + 20), height: 140 } });
  console.log("FINAL_BEFORE_RESTORE", JSON.stringify(await snap()));
});
