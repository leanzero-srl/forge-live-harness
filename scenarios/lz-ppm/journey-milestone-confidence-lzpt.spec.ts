// SCHEDULE CONFIDENCE — the MILESTONE half, live for the first time.
//
// The Monte Carlo card reports "chance of hitting each named milestone", but plan
// milestones live in plan META and are only ever set by the CREATE wizard, so no
// existing plan on the dev site has any: every live run so far reported
// `sc-milestone` count 0 and the whole feature half went unexercised (the visual
// suite covers only its RENDERING, against a mock plan).
//
// This creates a throwaway plan over the LZPT bed with two milestones chosen to sit
// on opposite sides of the simulated finish distribution, and asserts the
// probabilities are not just present but CORRECT:
//   - "Gate A"  2026-10-05 — before every simulated finish  → ~0%
//   - "Go-live" 2026-11-30 — after every simulated finish   → 100%
//   - monotone: a later date can never be less likely than an earlier one
//   - consistent with the card's own percentiles: a milestone on/after P90 is ≥90%.
// Then it deletes the plan (Delete is gated to the Gantt/Table views).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const NAME = `MS confidence ${Date.now().toString(36)}`;
const EARLY = { name: "Gate A", year: 2026, month: "October", day: 5, iso: "2026-10-05" };
const LATE = { name: "Go-live", year: 2026, month: "November", day: 30, iso: "2026-11-30" };

test.describe.configure({ retries: 0, timeout: 900_000 });
async function bodyText(f: any) { return (await f.locator("body").textContent().catch(() => "")) || ""; }

test("LZPT: milestone hit probabilities are computed, ordered and consistent", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  await page.waitForTimeout(1500);

  let createdId: string | null = null;
  const idsBefore = new Set(((await getTestState("lz-ppm", { what: "plans" })).plans as any[]).map((p) => p.id));

  // Drive the custom DatePicker: open it, walk months by title, click the day.
  const pickDate = async (rowIndex: number, want: { year: number; month: string; day: number }) => {
    // The milestone row has no testid; its date control is the custom DatePicker,
    // whose unset trigger reads "Select date...".
    const triggers = frame.locator('div').filter({ hasText: /^Select date\.\.\.$/ });
    await triggers.nth(rowIndex).click();
    const cal = frame.locator('.lz-datepicker').first();
    await cal.waitFor({ state: "visible", timeout: 10_000 });
    for (let i = 0; i < 24; i++) {
      const title = ((await cal.locator('span').first().textContent()) || "").trim();
      if (title === `${want.month} ${want.year}`) break;
      await cal.getByRole("button", { name: "›" }).click().catch(async () => {
        await cal.locator('button').nth(1).click();
      });
      await page.waitForTimeout(150);
    }
    const title = ((await cal.locator('span').first().textContent()) || "").trim();
    expect(title, "the calendar reached the target month").toBe(`${want.month} ${want.year}`);
    await cal.locator('div').filter({ hasText: new RegExp(`^${want.day}$`) }).last().click();
    await page.waitForTimeout(400);
  };

  try {
    // ---------- CREATE the plan, with two milestones ----------
    await frame.getByRole("button", { name: /New plan/i }).first().click().catch(async () => {
      await frame.getByText(/New plan/i).first().click().catch(() => {});
    });
    await page.waitForTimeout(1500);
    await frame.getByPlaceholder(/Q2 Release Plan/i).first().fill(NAME);
    const cont = () => frame.getByRole("button", { name: /Continue/i }).first();
    await cont().click();
    await page.waitForTimeout(1000);
    await frame.getByPlaceholder(/project = PROJ/i).first().fill("project = LZPT");
    await frame.getByText(/✓ Valid/i).first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
    await cont().click(); await page.waitForTimeout(900);   // -> Schedule
    await cont().click(); await page.waitForTimeout(900);   // -> Milestones

    await frame.getByRole("button", { name: /Add milestone/i }).first().click();
    await page.waitForTimeout(400);
    await frame.getByPlaceholder(/Milestone name/i).nth(0).fill(EARLY.name);
    await pickDate(0, EARLY);
    await frame.getByRole("button", { name: /Add milestone/i }).first().click();
    await page.waitForTimeout(400);
    await frame.getByPlaceholder(/Milestone name/i).nth(1).fill(LATE.name);
    await pickDate(0, LATE); // the first remaining "Select date..." is row 2's
    // The names live in input VALUES (not text nodes), so read them back explicitly.
    const names = await frame.getByPlaceholder(/Milestone name/i).evaluateAll((els: any[]) => els.map((e) => e.value));
    console.log("MILESTONE STEP names =", JSON.stringify(names));
    expect(names).toEqual([EARLY.name, LATE.name]);

    await cont().click(); await page.waitForTimeout(900);   // -> Review
    await frame.getByRole("button", { name: /Create & Index/i }).first().click();

    let opened = false;
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(3000);
      const b = await bodyText(frame);
      if (/Gantt|Table|Dashboard/i.test(b) && !/Indexing|Creating/i.test(b)) { opened = true; break; }
    }
    expect(opened, "the new plan opened").toBe(true);
    const plans = (await getTestState("lz-ppm", { what: "plans" })).plans as any[];
    createdId = (plans.find((p) => !idsBefore.has(p.id)) || {}).id || null;
    expect(createdId, "the plan exists in KVS").toBeTruthy();
    const meta = (await getTestState("lz-ppm", { what: "plan", planId: createdId! })).meta || {};
    console.log("PLAN META milestones =", JSON.stringify(meta.milestones), "issues =", meta.issueCount);
    expect((meta.milestones || []).length, "both milestones were stored on the plan").toBe(2);
    expect((meta.milestones || []).map((m: any) => m.date).sort()).toEqual([EARLY.iso, LATE.iso]);

    // ---------- the card ----------
    await frame.getByRole("button", { name: /^Dashboard/i }).first().click();
    const card = frame.locator('[data-testid="schedule-confidence"]').first();
    await card.waitFor({ state: "visible", timeout: 90_000 });
    for (let i = 0; i < 240; i++) {
      if (await card.getAttribute("data-p90")) break;
      await page.waitForTimeout(500);
    }
    const p50 = await card.getAttribute("data-p50");
    const p90 = await card.getAttribute("data-p90");
    const rows = card.locator('[data-testid="sc-milestone"]');
    const n = await rows.count();
    const read: { name: string; prob: number }[] = [];
    for (let i = 0; i < n; i++) {
      const txt = ((await rows.nth(i).textContent()) || "").replace(/\s+/g, " ").trim();
      read.push({ name: txt, prob: Number(await rows.nth(i).getAttribute("data-probability")) });
    }
    console.log("CARD p50=", p50, "p90=", p90, "milestones=", JSON.stringify(read));
    await card.screenshot({ path: "evidence/milestone-confidence.png" }).catch(() => {});

    expect(n, "both milestones are listed on the card").toBe(2);
    const early = read.find((r) => r.name.includes(EARLY.name))!;
    const late = read.find((r) => r.name.includes(LATE.name))!;
    expect(early && late, "both rows are identifiable by name").toBeTruthy();
    for (const r of read) expect(r.prob >= 0 && r.prob <= 1, `${r.name} probability in [0,1]`).toBe(true);
    expect(late.prob >= early.prob, "a later milestone can never be less likely").toBe(true);
    expect(early.prob, `${EARLY.iso} is before every simulated finish`).toBeLessThanOrEqual(0.1);
    expect(late.prob, `${LATE.iso} is after every simulated finish`).toBeGreaterThanOrEqual(0.9);
    // Consistency with the card's own percentiles: P(finish <= P90) is >= 0.9 by
    // definition, so any milestone on or after P90 must also be >= 0.9.
    if (p90 && LATE.iso >= p90) expect(late.prob).toBeGreaterThanOrEqual(0.9);
  } finally {
    if (createdId) {
      await getTestState("lz-ppm", { what: "clearDrafts", planId: createdId }).catch(() => {});
      await getTestState("lz-ppm", { what: "deleteFixture", planId: createdId }).catch(() => {});
      const still = ((await getTestState("lz-ppm", { what: "plans" })).plans as any[]).some((p) => p.id === createdId);
      console.log("CREATED_PLAN_STILL_EXISTS=", still);
      expect(still, "the throwaway plan is cleaned up").toBe(false);
    }
  }
});
