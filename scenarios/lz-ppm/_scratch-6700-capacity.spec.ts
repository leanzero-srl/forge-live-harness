// SCRATCH 6.70.0 — item 3: the Capacity TAB on the LZPT plan.
// Gate screen, people row, percentiles, the roster dialog (add a typed person ->
// save -> read meta.capacity.roster over the hook -> remove -> save), and the
// "Backfill history" confirm showing the DRY RUN's measured request count — then
// CANCEL. Writes only meta.capacity, and removes it again.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
const PLAN_ID = "plan-msq9dg8l-gz6mz1";
const PERSON = "[harness-test] Tester One";
const OUT = "/Users/mihaiperdum/Projects/forge-live-harness/scratchpad/live-6700";
test.describe.configure({ retries: 0, timeout: 1_200_000, mode: "serial" });
const txt = async (l: any) => ((await l.innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();

async function openCapacity(page: any) {
  await page.setViewportSize({ width: 1600, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  if (s.kind !== "custom") throw new Error("no frame");
  const frame = s.frame;
  await page.waitForTimeout(3000);
  const card = frame.locator('[data-testid="plan-card"]').filter({ hasText: PLAN }).first();
  await card.waitFor({ state: "visible", timeout: 60_000 });
  await card.locator(".plan-card-open").first().click();
  await page.waitForTimeout(6000);
  await frame.locator('[data-testid="view-tab-capacity"]').first().click();
  await frame.locator('[data-testid="plan-capacity"]').waitFor({ state: "visible", timeout: 90_000 });
  await page.waitForTimeout(2500);
  return frame;
}

test("C-A the gate, the people row, the percentiles", async ({ page }) => {
  const back: any = await getTestState("lz-ppm", { what: "capacity", planId: PLAN_ID });
  console.log("BACKEND gate:", JSON.stringify(back.gate));
  console.log("BACKEND people:", JSON.stringify(back.people.map((p: any) => ({ name: p.name, source: p.source, total: p.total, done: p.done, wip: p.wip }))));
  console.log("BACKEND leadTime p50/p85:", back.metrics.leadTime.p50, back.metrics.leadTime.p85,
    "| cycleTime p50/p85:", back.metrics.cycleTime.p50, back.metrics.cycleTime.p85,
    "| throughput perWeek p50/p85:", back.metrics.throughput.perWeek.p50, back.metrics.throughput.perWeek.p85,
    "| wipAge p50/p85:", back.metrics.wip.age.p50, back.metrics.wip.age.p85);

  const frame = await openCapacity(page);
  const gate = frame.locator('[data-testid="capacity-gate"]');
  console.log("GATE data-state =", await gate.getAttribute("data-state"));
  console.log("GATE TEXT =", JSON.stringify(await txt(gate)));
  const people = frame.locator('[data-testid="capacity-person"]');
  console.log("PEOPLE ROWS =", await people.count());
  for (const p of await people.all()) {
    console.log("  PERSON:", JSON.stringify(await txt(p)), "| data-source =", await p.getAttribute("data-source"), "| id =", await p.getAttribute("data-person-id"));
  }
  const measures = await frame.locator('[data-testid="capacity-measure-value"]').allInnerTexts();
  console.log("MEASURE VALUES:", JSON.stringify(measures));
  console.log("PERCENTILE NOTE:", JSON.stringify(await txt(frame.locator('[data-testid="capacity-percentile-note"]'))));
  console.log("CYCLE-UNKNOWN NOTE:", await frame.locator('[data-testid="capacity-cycle-unknown"]').count() ? JSON.stringify(await txt(frame.locator('[data-testid="capacity-cycle-unknown"]'))) : "(absent)");
  console.log("NO-PEOPLE BLOCK:", await frame.locator('[data-testid="capacity-no-people"]').count());
  console.log("BACKFILL COST LINE:", JSON.stringify(await txt(frame.locator('[data-testid="capacity-backfill-cost"]'))));
  console.log("FULL CAPACITY TEXT:\n" + (await txt(frame.locator('[data-testid="plan-capacity"]'))).slice(0, 2500));
  await page.screenshot({ path: `${OUT}/c1-capacity.png`, fullPage: true });
  expect(await gate.getAttribute("data-state")).toBe("insufficient");
  expect(await txt(gate)).toContain(back.gate.message);
});

test("C-B the roster dialog: add a typed person, save, read meta, remove", async ({ page }) => {
  const before: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  console.log("meta.capacity BEFORE =", JSON.stringify(before.meta?.capacity ?? null));
  const frame = await openCapacity(page);
  await frame.locator('[data-testid="capacity-roster-open"]').click();
  await frame.locator('[data-testid="capacity-roster-editor"]').waitFor({ state: "visible", timeout: 20_000 });
  console.log("ROSTER DIALOG:", JSON.stringify(await txt(frame.locator('[data-testid="capacity-roster-editor"]'))));
  console.log("ROWS AT OPEN:", await frame.locator('[data-testid="capacity-roster-row"]').count(),
    "| empty-line:", await frame.locator('[data-testid="capacity-roster-empty"]').count());
  await page.screenshot({ path: `${OUT}/c2-roster-open.png` });
  if (!(await frame.locator('[data-testid="capacity-roster-row"]').count())) {
    await frame.locator('[data-testid="capacity-roster-add"]').click();
    await page.waitForTimeout(500);
  }
  const row = frame.locator('[data-testid="capacity-roster-row"]').first();
  await row.locator("input[type=text]").first().fill(PERSON);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/c3-roster-typed.png` });
  await frame.locator('[data-testid="capacity-roster-save"]').click();
  await page.waitForTimeout(5000);
  const after: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  console.log("meta.capacity AFTER SAVE =", JSON.stringify(after.meta?.capacity));
  const people = frame.locator('[data-testid="capacity-person"]');
  console.log("PEOPLE AFTER SAVE =", await people.count());
  for (const p of await people.all()) console.log("  PERSON:", JSON.stringify(await txt(p)), "| source =", await p.getAttribute("data-source"));
  await page.screenshot({ path: `${OUT}/c4-roster-saved.png`, fullPage: true });
  expect(JSON.stringify(after.meta?.capacity?.roster || [])).toContain(PERSON);

  // REMOVE it again.
  await frame.locator('[data-testid="capacity-roster-open"]').click();
  await frame.locator('[data-testid="capacity-roster-editor"]').waitFor({ state: "visible", timeout: 20_000 });
  const rows = frame.locator('[data-testid="capacity-roster-row"]');
  const n = await rows.count();
  console.log("ROWS BEFORE REMOVE:", n);
  for (let i = n - 1; i >= 0; i--) {
    const r = rows.nth(i);
    if ((await txt(r)).includes("Tester One") || (await r.locator("input[type=text]").first().inputValue()) === PERSON) {
      await r.locator("button").filter({ hasText: /Remove/i }).first().click();
      await page.waitForTimeout(400);
    }
  }
  console.log("ROWS AFTER REMOVE CLICK:", await rows.count());
  await frame.locator('[data-testid="capacity-roster-save"]').click();
  await page.waitForTimeout(5000);
  const restored: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  console.log("meta.capacity AFTER REMOVE =", JSON.stringify(restored.meta?.capacity ?? null));
  await page.screenshot({ path: `${OUT}/c5-roster-removed.png`, fullPage: true });
  expect(JSON.stringify(restored.meta?.capacity?.roster || [])).not.toContain(PERSON);
});

test("C-C the backfill confirm shows the dry run's MEASURED request count; cancel", async ({ page }) => {
  const dry: any = await getTestState("lz-ppm", { what: "flowBackfill", planId: PLAN_ID });
  console.log("HOOK DRY RUN:", JSON.stringify(dry));
  const frame = await openCapacity(page);
  const cost = await txt(frame.locator('[data-testid="capacity-backfill-cost"]'));
  console.log("SECTION COST LINE (the static ceiling):", JSON.stringify(cost));
  await frame.locator('[data-testid="capacity-backfill"]').click();
  const dlg = frame.locator('[role="dialog"]');
  await dlg.waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(1500);
  const dtext = await txt(dlg);
  console.log("CONFIRM DIALOG:", JSON.stringify(dtext));
  await page.screenshot({ path: `${OUT}/c6-backfill-confirm.png`, fullPage: true });
  const m = dtext.match(/at most ([\d,]+) issues? — at most ([\d,]+) Jira requests?/i);
  console.log("PARSED candidates =", m?.[1], "| calls =", m?.[2], "| hook said candidates =", dry.candidates, "calls =", dry.jiraCalls);
  // CANCEL — nothing is written.
  const cancel = dlg.locator("button").filter({ hasText: /^Cancel$/i }).first();
  await cancel.click();
  await page.waitForTimeout(2500);
  console.log("RESULT LINE AFTER CANCEL:", await frame.locator('[data-testid="capacity-backfill-result"]').count());
  const after: any = await getTestState("lz-ppm", { what: "flowBackfill", planId: PLAN_ID });
  console.log("HOOK DRY RUN AFTER CANCEL:", JSON.stringify(after));
  expect(m, `confirm text did not carry the cost sentence: ${dtext}`).toBeTruthy();
  expect(Number(m![2])).toBe(dry.jiraCalls);
  expect(Number(m![1].replace(/,/g, ""))).toBe(dry.candidates);
  expect(after.stamped).toBe(0);
});

test("C-Z no staged changes, no draft, bed intact", async ({ page }) => {
  const frame = await openCapacity(page);
  const body = await txt(frame.locator("body"));
  const staged = /Apply \d+ change|Save \(\d+\)|\d+ unsaved/i.test(body);
  console.log("STAGED_AFTER_CLEANUP=" + staged);
  const plan: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  console.log("meta.capacity FINAL =", JSON.stringify(plan.meta?.capacity ?? null));
  console.log("issueCount =", plan.meta?.issueCount, "| protectionEnabled =", plan.meta?.protectionEnabled);
  await page.screenshot({ path: `${OUT}/c7-final.png`, fullPage: true });
  expect(staged).toBe(false);
});
