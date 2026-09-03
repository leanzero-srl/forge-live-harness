// IMPORT A REAL JIRA PLAN — the Premium path, end to end.
//
// wolfaenpak was upgraded to Jira Premium on 2026-09-03, so the Plans API answers
// for real and the whole importer can finally be driven through the UI instead of
// the synthetic `importFixture` hook. The bed is three seeded Jira plans
// (scenarios/lz-ppm/_seed-jira-plans.spec.ts — run it once with SEED=1).
//
//  A: the wizard LISTS the site's real Jira plans (no 'unavailable' panel), and the
//     preview of the DEAD-BOARD plan warns that the deleted board was skipped while
//     still importing the surviving source.
//  B: the full import of the TARGET-DATES plan — pick → preview → settings → import
//     → indexed plan — then audits what the import produced: the "Jira plan"
//     provenance chip, the per-plan field mapping (Target start / Target end, NOT the
//     site defaults) surfaced in the writability modal, and the writability chip.
//     The created LeanZero plan is deleted in a finally; the JIRA plan is never touched.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
test.describe.configure({ retries: 1, timeout: 900_000 });

const PLAN_PROJECTS = "LZ Import Test — Projects";
const PLAN_TARGET = "LZ Import Test — Target dates";
const PLAN_DEAD = "LZ Import Test — Dead board";

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

async function openWizard(page: any, frame: any) {
  const entry = frame.locator('[data-testid="import-jira-plan-btn"]').first();
  await entry.waitFor({ state: "visible", timeout: 20_000 });
  await entry.click();
  await frame.locator('[data-testid="plan-import-wizard"]').first().waitFor({ state: "visible", timeout: 20_000 });
  // The pick step resolves to EITHER a list of plans or the unavailable panel.
  const rows = frame.locator('[data-testid="jira-plan-row"]');
  const bad = frame.locator('[data-testid="jira-plans-unavailable"]');
  for (let i = 0; i < 60; i++) {
    if (await rows.count() > 0 || await bad.count() > 0) break;
    await page.waitForTimeout(500);
  }
  const unavailableCode = await bad.first().getAttribute("data-code").catch(() => null);
  return { rows, unavailableCode };
}

async function pickAndPreview(frame: any, planName: string) {
  const row = frame.locator('[data-testid="jira-plan-row"]', { hasText: planName }).first();
  await row.waitFor({ state: "visible", timeout: 20_000 });
  await row.click();
  await frame.locator('[data-testid="import-continue"]').first().click();
  const preview = frame.locator('[data-testid="import-preview"]').first();
  await preview.waitFor({ state: "visible", timeout: 60_000 });
  return preview;
}

test("A: the wizard lists the site's real Jira plans and warns about a dead board", async ({ page }) => {
  const frame = await open(page);
  const { rows, unavailableCode } = await openWizard(page, frame);
  console.log("UNAVAILABLE code=", unavailableCode, "rows=", await rows.count());
  expect(unavailableCode, "a Premium site must not show the unavailable panel").toBeNull();

  const names = await rows.allTextContents();
  console.log("PLAN ROWS", names.map((n: string) => n.replace(/\s+/g, " ").trim()).join(" | "));
  expect(await rows.count(), "the seeded Jira plans are listed").toBeGreaterThanOrEqual(3);
  const joined = names.join("\n");
  for (const n of [PLAN_PROJECTS, PLAN_TARGET, PLAN_DEAD]) expect(joined).toContain(n);

  // The dead-board plan: the deleted board is skipped with a warning, the surviving
  // project source is still importable.
  const preview = await pickAndPreview(frame, PLAN_DEAD);
  const ptext = (await preview.textContent()) || "";
  const sources = await preview.locator('[data-testid="import-source-row"]').allTextContents();
  const warns = await preview.locator('[data-level="warn"]').allTextContents();
  console.log("DEAD-BOARD sources=", sources.map((s: string) => s.replace(/\s+/g, " ").trim()));
  console.log("DEAD-BOARD warns=", warns.map((s: string) => s.replace(/\s+/g, " ").trim()));
  expect(warns.join(" "), "the deleted board is named and skipped").toMatch(/could not be resolved.*skipped/i);
  expect(sources.length, "the surviving project source is still imported").toBe(1);
  expect(sources.join(" ")).toMatch(/WORK FOR HIRE/);
  expect(ptext, "the 30-day completed rule became JQL").toMatch(/resolved >= -30d/);
  expect(await frame.locator('[data-testid="import-continue"]').first().isDisabled(), "still importable").toBe(false);
  expect(await preview.locator('[data-testid="import-no-sources"]').count()).toBe(0);

  await frame.getByRole("button", { name: /Back/i }).first().click().catch(() => {});
});

test("B: importing the Target-dates plan creates a plan that writes Target start/end", async ({ page }) => {
  const NAME = `Import premium ${Date.now().toString(36)}`;
  let createdPlanId: string | null = null;
  const idsBefore = new Set(((await getTestState("lz-ppm", { what: "plans" })).plans as any[]).map((p) => p.id));

  try {
    const frame = await open(page);
    const { unavailableCode } = await openWizard(page, frame);
    expect(unavailableCode).toBeNull();

    // --- preview: the contract -------------------------------------------------
    const preview = await pickAndPreview(frame, PLAN_TARGET);
    const ptext = ((await preview.textContent()) || "").replace(/\s+/g, " ");
    const sources = await preview.locator('[data-testid="import-source-row"]').allTextContents();
    const warns = (await preview.locator('[data-level="warn"]').allTextContents()).map((s: string) => s.replace(/\s+/g, " ").trim());
    console.log("TARGET sources=", sources.map((s: string) => s.replace(/\s+/g, " ").trim()));
    console.log("TARGET warns=", warns);
    expect(ptext, "the plan's own date fields, not the site defaults").toMatch(/Target start\s*→\s*Target end/);
    expect(ptext).toMatch(/Plan-specific/);
    expect(ptext, "Concurrent is reinterpreted as finish-to-start").toMatch(/Concurrent in Jira → finish-to-start here/);
    expect(warns.join(" ")).toMatch(/Concurrent/);
    expect(sources.length, "board + filter + project all resolved").toBe(3);
    expect(ptext, "the exclusion rules became one JQL clause").toMatch(/issuetype not in \(10016\).*status not in \(10009\).*resolved >= -14d/);

    // --- settings + import -----------------------------------------------------
    await frame.locator('[data-testid="import-continue"]').first().click();
    const nameInput = frame.locator('[data-testid="import-name"]').first();
    await nameInput.waitFor({ state: "visible", timeout: 20_000 });
    await nameInput.fill(NAME);
    await frame.locator('[data-testid="import-continue"]').first().click();
    const submit = frame.locator('[data-testid="import-submit"]').first();
    await submit.waitFor({ state: "visible", timeout: 20_000 });
    await submit.click();

    // Import + index can take minutes on a cold Lambda; wait for the plan view.
    const wr = frame.locator('[data-testid="writability-chip"]').first();
    const imported = frame.locator('[data-testid="imported-from-chip"]').first();
    for (let i = 0; i < 240; i++) {
      if (await imported.count() > 0) break;
      await page.waitForTimeout(1000);
    }
    console.log("AFTER IMPORT body=", (await bodyText(frame)).replace(/\s+/g, " ").slice(0, 200));
    expect(await imported.count(), "the plan view shows the Jira-plan provenance chip").toBe(1);

    // --- what the import actually produced, from the backend -------------------
    const plans = (await getTestState("lz-ppm", { what: "plans" })).plans as any[];
    const created = plans.find((p) => !idsBefore.has(p.id));
    expect(created, "a new plan exists in KVS").toBeTruthy();
    createdPlanId = created.id;
    const detail = await getTestState("lz-ppm", { what: "plan", planId: createdPlanId! });
    const meta = detail.meta || {};
    console.log("IMPORTED META", JSON.stringify({
      name: meta.name, overrides: meta.fieldOverrides, from: meta.importedFrom?.planId,
      sources: (meta.sources || []).map((s: any) => s.query || s.projectKey), issues: (detail.issues || []).length,
    }));
    expect(meta.fieldOverrides, "per-plan field mapping came from the Jira plan").toEqual({
      startDate: "customfield_10022", dueDate: "customfield_10023",
    });
    expect(String(meta.importedFrom?.planId ?? meta.importedFrom?.id ?? "")).not.toBe("");
    expect((detail.issues || []).length, "the imported sources actually indexed issues").toBeGreaterThan(0);
    const q = (meta.sources || []).map((s: any) => s.query || "").join(" ");
    expect(q, "exclusion rules persisted onto the plan's sources").toMatch(/resolved >= -14d/);

    // --- the writability modal names the plan's OWN fields ---------------------
    await wr.waitFor({ state: "visible", timeout: 60_000 });
    console.log("CHIP blocked=", await wr.getAttribute("data-blocked"), "partial=", await wr.getAttribute("data-partial"));
    await wr.click();
    const modal = frame.locator('[data-testid="writability-modal"]').first();
    await modal.waitFor({ state: "visible", timeout: 20_000 });
    const start = (await modal.locator('[data-testid="writability-field-start"]').textContent()) || "";
    const due = (await modal.locator('[data-testid="writability-field-due"]').textContent()) || "";
    console.log("MODAL FIELDS", start.trim(), "|", due.trim());
    expect(start, "names the field, not the raw id").toMatch(/Target start/);
    expect(due).toMatch(/Target end/);
    await page.screenshot({ path: "evidence/import-premium-writability.png" }).catch(() => {});
    await frame.getByRole("button", { name: /^Done$/ }).first().click().catch(() => {});
  } finally {
    if (createdPlanId) {
      await getTestState("lz-ppm", { what: "clearDrafts", planId: createdPlanId }).catch(() => {});
      await getTestState("lz-ppm", { what: "deleteFixture", planId: createdPlanId }).catch(() => {});
      const still = ((await getTestState("lz-ppm", { what: "plans" })).plans as any[]).some((p) => p.id === createdPlanId);
      console.log("IMPORTED_PLAN_STILL_EXISTS=", still);
      expect(still, "the imported plan is cleaned up").toBe(false);
    }
  }
});
