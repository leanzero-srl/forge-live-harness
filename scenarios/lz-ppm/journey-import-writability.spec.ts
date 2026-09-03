// IMPORT-A-JIRA-PLAN + WRITABILITY journey.
//
// wolfaenpak was a Jira FREE site when this was written (the Plans API answered 403
// and the wizard had to explain that). It was upgraded to PREMIUM on 2026-09-03, so
// Part A now asserts the opposite: the wizard reaches the real listing instead of the
// unavailable panel. The full Premium path (list -> preview -> import -> indexed plan)
// lives in journey-import-premium.spec.ts; the Free-site copy is covered by the
// `?harness=import` visual scene, which is the only place it can still be exercised.
//
// Part B creates a plan through the SAME import pipeline from a synthetic Jira-plan
// object (test hook `importFixture`: TPP project, Target start/end scheduling, a
// 30-day completed rule, a Concurrent-dependencies note, a dead board) and then
// audits the UI it produces: the "Jira plan" chip, the writability chip with the
// exact count of partial issues (TPP has no context for Duration/Buffer — measured),
// the lock glyphs on Table rows, the modal's reasons, and the Apply review tagging a
// duration change as "partial: Duration won't be stored". The fixture plan is deleted
// in a finally; nothing is written to Jira (the review is cancelled + discarded).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
test.describe.configure({ retries: 1, timeout: 600_000 });

async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

async function open(page: any) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  await page.waitForTimeout(1500);
  return frame;
}

test("A: the import wizard reaches the real Jira Plans listing", async ({ page }) => {
  const frame = await open(page);
  const entry = frame.locator('[data-testid="import-jira-plan-btn"]').first();
  await entry.waitFor({ state: "visible", timeout: 20_000 });
  await entry.click();
  const rows = frame.locator('[data-testid="jira-plan-row"]');
  const panel = frame.locator('[data-testid="jira-plans-unavailable"]').first();
  for (let i = 0; i < 60; i++) {
    if ((await rows.count()) > 0 || (await panel.count()) > 0) break;
    await page.waitForTimeout(500);
  }
  const code = await panel.getAttribute("data-code").catch(() => null);
  const count = await rows.count();
  console.log("PICK STATE unavailableCode=", code, "planRows=", count);
  expect(code, "wolfaenpak is Premium since 2026-09-03 — no unavailable panel").toBeNull();
  expect(count, "the site's Jira plans are listed").toBeGreaterThan(0);
  // Continue is gated on a SELECTION, not on availability.
  expect(await frame.locator('[data-testid="import-continue"]').first().isDisabled()).toBe(true);
  await frame.getByRole("button", { name: /Back/i }).first().click().catch(() => {});
});

test("B: an imported plan flags exactly which issues Jira can't fully update", async ({ page }) => {
  const NAME = `Import journey ${Date.now().toString(36)}`;
  const fx = await getTestState("lz-ppm", { what: "importFixture", projectId: "10007", schedule: "target", deadBoard: "1", completedDays: "30", name: NAME });
  const planId = fx.planId as string;
  console.log("FIXTURE planId=", planId, "issues=", fx.issues?.length, "overrides=", JSON.stringify(fx.meta?.fieldOverrides), "writability=", JSON.stringify({ b: fx.meta?.writability?.blocked, p: fx.meta?.writability?.partial }));
  expect(fx.meta?.fieldOverrides).toEqual({ startDate: "customfield_10022", dueDate: "customfield_10023" });
  expect(fx.meta?.sources?.[0]?.query).toMatch(/resolved >= -30d/);
  const expectedPartial = fx.meta?.writability?.partial as number;
  expect(expectedPartial, "TPP issues are 'partial' (Duration/Buffer have no context there)").toBeGreaterThan(0);
  expect(fx.meta?.writability?.blocked).toBe(0);

  try {
    const frame = await open(page);
    // The list card carries the provenance pill.
    const card = frame.locator('.lz-card', { hasText: NAME }).first();
    await card.waitFor({ state: "visible", timeout: 30_000 });
    expect(await card.locator('[data-testid="plan-card-imported"]').count(), "plan card shows the 'Jira plan' pill").toBe(1);
    await card.getByRole("button", { name: /Open plan/i }).first().click();
    await page.waitForTimeout(3000);

    // Toolbar: provenance chip + writability chip with the exact partial count.
    const wr = frame.locator('[data-testid="writability-chip"]').first();
    await wr.waitFor({ state: "visible", timeout: 30_000 });
    const partial = Number(await wr.getAttribute("data-partial"));
    const blocked = Number(await wr.getAttribute("data-blocked"));
    console.log("CHIP partial=", partial, "blocked=", blocked, "label=", await wr.textContent());
    expect(blocked).toBe(0);
    expect(partial, "chip count == backend summary").toBe(expectedPartial);
    expect(await frame.locator('[data-testid="imported-from-chip"]').count()).toBe(1);

    // The modal: reasons name the missing fields and the plan's write fields.
    await wr.click();
    const modal = frame.locator('[data-testid="writability-modal"]').first();
    await modal.waitFor({ state: "visible", timeout: 15_000 });
    const mtext = (await modal.textContent()) || "";
    console.log("MODAL", mtext.slice(0, 220));
    expect(mtext).toMatch(/Target start/);
    expect(mtext).toMatch(/Target end/);
    expect(mtext).toMatch(/Field not on project/);
    expect(await modal.locator('[data-testid="writability-row"]').count()).toBeGreaterThan(0);
    await frame.getByRole("button", { name: /^Done$/ }).first().click();

    // Table: lock glyphs on the rows.
    await frame.getByRole("button", { name: /^Table/i }).first().click();
    await page.waitForTimeout(2500);
    const locks = await frame.locator('[data-testid="writability-lock"][data-level="partial"]').count();
    console.log("TABLE locks=", locks);
    expect(locks).toBeGreaterThan(0);

    // A DURATION change on a leaf (staged in KVS through the hook — the same shape a
    // Table edit produces: current != _original) -> the Apply review must tag it as
    // "partial: Duration won't be stored" while keeping it writable, excluding nothing.
    await frame.getByRole("button", { name: /^Gantt/i }).first().click();
    await page.waitForTimeout(1000);
    await frame.locator('button', { hasText: /Back to plans|←/ }).first().click().catch(() => {});
    await frame.getByRole("button", { name: /Back to plans/i }).first().click().catch(() => {});
    await page.waitForTimeout(1500);
    const leaf = (fx.issues as any[]).find((i) => !i.children?.length && i.hierarchyLevel <= 0) || fx.issues[0];
    await getTestState("lz-ppm", { what: "applyEdit", planId, key: leaf.key, field: "duration", value: "3" });
    const card2 = frame.locator('.lz-card', { hasText: NAME }).first();
    await card2.waitFor({ state: "visible", timeout: 30_000 });
    await card2.getByRole("button", { name: /Open plan/i }).first().click();
    await page.waitForTimeout(3500);
    const staged = /Apply \d+ change/.test(await bodyText(frame));
    console.log("STAGED after duration edit on", leaf.key, "=", staged);
    expect(staged, "a KVS duration edit shows up as a pending Apply").toBe(true);
    const applyBtn = frame.locator('button').filter({ hasText: /Apply \d+ change/ }).first();
    await applyBtn.click();
    const review = frame.locator('[data-testid="apply-review-modal"]').first();
    await review.waitFor({ state: "visible", timeout: 15_000 });
    const warnings = review.locator('[data-testid="apply-row-warning"]');
    const wcount = await warnings.count();
    const wtext = wcount ? (await warnings.first().textContent()) || "" : "";
    const excluded = await review.locator('[data-testid="apply-blocked-count"]').count();
    console.log("REVIEW warnings=", wcount, "first=", wtext, "excludedBanner=", excluded);
    expect(wcount, "the duration change is tagged").toBeGreaterThan(0);
    expect(wtext).toMatch(/partial: Duration won't be stored/);
    expect(await warnings.first().getAttribute("data-writable")).toBe("1");
    expect(excluded, "nothing is excluded (dates still write on TPP)").toBe(0);
    await page.screenshot({ path: "evidence/import-writability-review.png" }).catch(() => {});
    // Cancel — never write to Jira from this journey.
    await review.getByRole("button", { name: /Cancel/i }).first().click().catch(async () => {
      await frame.locator('[data-testid="apply-review-modal"] button[aria-label="Close"], [data-testid="apply-review-modal"] button[title="Close"]').first().click().catch(() => {});
    });
    await page.waitForTimeout(500);
  } finally {
    await getTestState("lz-ppm", { what: "clearDrafts", planId }).catch(() => {});
    await getTestState("lz-ppm", { what: "deleteFixture", planId }).catch(() => {});
    const still = (await getTestState("lz-ppm", { what: "plans" })).plans.some((p: any) => p.id === planId);
    console.log("FIXTURE_STILL_EXISTS=", still);
  }
});
