# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/journey-milestone-confidence-lzpt.spec.ts >> LZPT: milestone hit probabilities are computed, ordered and consistent
- Location: scenarios/lz-ppm/journey-milestone-confidence-lzpt.spec.ts:33:1

# Error details

```
TimeoutError: locator.click: Timeout 20000ms exceeded.
Call log:
  - waiting for locator('iframe[data-testid="hosted-resources-iframe"]').first().contentFrame().locator('div').filter({ hasText: /^Select date\.\.\.$/ }).first()

```

# Test source

```ts
  1   | // SCHEDULE CONFIDENCE — the MILESTONE half, live for the first time.
  2   | //
  3   | // The Monte Carlo card reports "chance of hitting each named milestone", but plan
  4   | // milestones live in plan META and are only ever set by the CREATE wizard, so no
  5   | // existing plan on the dev site has any: every live run so far reported
  6   | // `sc-milestone` count 0 and the whole feature half went unexercised (the visual
  7   | // suite covers only its RENDERING, against a mock plan).
  8   | //
  9   | // This creates a throwaway plan over three valid LZPT leaves (the persistent
  10  | // bed intentionally has invalid/missing dates, which now blocks forecasts) with two milestones chosen to sit
  11  | // on opposite sides of the simulated finish distribution, and asserts the
  12  | // probabilities are not just present but CORRECT:
  13  | //   - "Gate A"  2026-10-05 — before every simulated finish  → ~0%
  14  | //   - "Go-live" 2026-11-30 — after every simulated finish   → 100%
  15  | //   - monotone: a later date can never be less likely than an earlier one
  16  | //   - consistent with the card's own percentiles: a milestone on/after P90 is ≥90%.
  17  | // Then it deletes the plan (Delete is gated to the Gantt/Table views).
  18  | import { test, expect } from "../../fixtures/forge";
  19  | import { getTarget } from "../../config/targets";
  20  | import { assertLoggedIn } from "../../forge/browser";
  21  | import { enterForgeSurface } from "../../forge/frame";
  22  | import { getTestState } from "../../testhook/client";
  23  | import { FORECAST_JQL, FORECAST_KEYS } from "./forecast-fixture";
  24  | 
  25  | const T = getTarget("lz-ppm-dashboard");
  26  | const NAME = `[harness-test] MS confidence ${Date.now().toString(36)}`;
  27  | const EARLY = { name: "Gate A", year: 2026, month: "October", day: 5, iso: "2026-10-05" };
  28  | const LATE = { name: "Go-live", year: 2026, month: "November", day: 30, iso: "2026-11-30" };
  29  | 
  30  | test.describe.configure({ retries: 0, timeout: 900_000 });
  31  | async function bodyText(f: any) { return (await f.locator("body").textContent().catch(() => "")) || ""; }
  32  | 
  33  | test("LZPT: milestone hit probabilities are computed, ordered and consistent", async ({ page }) => {
  34  |   await page.setViewportSize({ width: 1600, height: 1100 });
  35  |   await assertLoggedIn(page);
  36  |   await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  37  |   await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  38  |   const s = await enterForgeSurface(page, { surface: "custom" });
  39  |   const frame = s.kind === "custom" ? s.frame : null;
  40  |   if (!frame) throw new Error("no frame");
  41  |   await page.waitForTimeout(1500);
  42  | 
  43  |   let createdId: string | null = null;
  44  |   const idsBefore = new Set(((await getTestState("lz-ppm", { what: "plans" })).plans as any[]).map((p) => p.id));
  45  | 
  46  |   // Drive the custom DatePicker: open it, walk months by title, click the day.
  47  |   const pickDate = async (rowIndex: number, want: { year: number; month: string; day: number }) => {
  48  |     // The milestone row has no testid; its date control is the custom DatePicker,
  49  |     // whose unset trigger reads "Select date...".
  50  |     const triggers = frame.locator('div').filter({ hasText: /^Select date\.\.\.$/ });
> 51  |     await triggers.nth(rowIndex).click();
      |                                  ^ TimeoutError: locator.click: Timeout 20000ms exceeded.
  52  |     const cal = frame.locator('.lz-datepicker').first();
  53  |     await cal.waitFor({ state: "visible", timeout: 10_000 });
  54  |     for (let i = 0; i < 24; i++) {
  55  |       const title = ((await cal.locator('span').first().textContent()) || "").trim();
  56  |       if (title === `${want.month} ${want.year}`) break;
  57  |       await cal.getByRole("button", { name: "›" }).click().catch(async () => {
  58  |         await cal.locator('button').nth(1).click();
  59  |       });
  60  |       await page.waitForTimeout(150);
  61  |     }
  62  |     const title = ((await cal.locator('span').first().textContent()) || "").trim();
  63  |     expect(title, "the calendar reached the target month").toBe(`${want.month} ${want.year}`);
  64  |     await cal.locator('div').filter({ hasText: new RegExp(`^${want.day}$`) }).last().click();
  65  |     await page.waitForTimeout(400);
  66  |   };
  67  | 
  68  |   try {
  69  |     // ---------- CREATE the plan, with two milestones ----------
  70  |     await frame.getByRole("button", { name: /New plan/i }).first().click().catch(async () => {
  71  |       await frame.getByText(/New plan/i).first().click().catch(() => {});
  72  |     });
  73  |     await page.waitForTimeout(1500);
  74  |     await frame.getByPlaceholder(/Q2 Release Plan/i).first().fill(NAME);
  75  |     const cont = () => frame.getByRole("button", { name: /Continue/i }).first();
  76  |     await cont().click();
  77  |     await page.waitForTimeout(1000);
  78  |     await frame.getByPlaceholder(/project = PROJ/i).first().fill(FORECAST_JQL);
  79  |     await frame.getByText(/✓ Valid/i).first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
  80  |     await cont().click(); await page.waitForTimeout(900);   // -> Schedule
  81  |     await cont().click(); await page.waitForTimeout(900);   // -> Milestones
  82  | 
  83  |     await frame.getByRole("button", { name: /Add milestone/i }).first().click();
  84  |     await page.waitForTimeout(400);
  85  |     await frame.getByPlaceholder(/Milestone name/i).nth(0).fill(EARLY.name);
  86  |     await pickDate(0, EARLY);
  87  |     await frame.getByRole("button", { name: /Add milestone/i }).first().click();
  88  |     await page.waitForTimeout(400);
  89  |     await frame.getByPlaceholder(/Milestone name/i).nth(1).fill(LATE.name);
  90  |     await pickDate(0, LATE); // the first remaining "Select date..." is row 2's
  91  |     // The names live in input VALUES (not text nodes), so read them back explicitly.
  92  |     const names = await frame.getByPlaceholder(/Milestone name/i).evaluateAll((els: any[]) => els.map((e) => e.value));
  93  |     console.log("MILESTONE STEP names =", JSON.stringify(names));
  94  |     expect(names).toEqual([EARLY.name, LATE.name]);
  95  | 
  96  |     await cont().click(); await page.waitForTimeout(900);   // -> Review
  97  |     await frame.getByRole("button", { name: /Create & Index/i }).first().click();
  98  | 
  99  |     let opened = false;
  100 |     for (let i = 0; i < 60; i++) {
  101 |       await page.waitForTimeout(3000);
  102 |       const b = await bodyText(frame);
  103 |       if (/Gantt|Table|Dashboard/i.test(b) && !/Indexing|Creating/i.test(b)) { opened = true; break; }
  104 |     }
  105 |     expect(opened, "the new plan opened").toBe(true);
  106 |     const plans = (await getTestState("lz-ppm", { what: "plans" })).plans as any[];
  107 |     createdId = (plans.find((p) => p.name === NAME && !idsBefore.has(p.id)) || {}).id || null;
  108 |     expect(createdId, "the plan exists in KVS").toBeTruthy();
  109 |     const detail = await getTestState("lz-ppm", { what: "plan", planId: createdId! });
  110 |     const meta = detail.meta || {};
  111 |     const parents = new Set(detail.issues.map((i: any) => i.parentKey).filter(Boolean));
  112 |     expect(detail.issues.filter((i: any) => !parents.has(i.key)).map((i: any) => i.key).sort(), "only valid forecast leaves were indexed")
  113 |       .toEqual([...FORECAST_KEYS].sort());
  114 |     console.log("PLAN META milestones =", JSON.stringify(meta.milestones), "issues =", meta.issueCount);
  115 |     expect((meta.milestones || []).length, "both milestones were stored on the plan").toBe(2);
  116 |     expect((meta.milestones || []).map((m: any) => m.date).sort()).toEqual([EARLY.iso, LATE.iso]);
  117 | 
  118 |     // ---------- the card ----------
  119 |     await frame.getByRole("button", { name: /^Dashboard/i }).first().click();
  120 |     const card = frame.locator('[data-testid="schedule-confidence"]').first();
  121 |     await card.waitFor({ state: "visible", timeout: 90_000 });
  122 |     for (let i = 0; i < 240; i++) {
  123 |       if (await card.getAttribute("data-p90")) break;
  124 |       await page.waitForTimeout(500);
  125 |     }
  126 |     const p50 = await card.getAttribute("data-p50");
  127 |     const p90 = await card.getAttribute("data-p90");
  128 |     const rows = card.locator('[data-testid="sc-milestone"]');
  129 |     const n = await rows.count();
  130 |     const read: { name: string; prob: number }[] = [];
  131 |     for (let i = 0; i < n; i++) {
  132 |       const txt = ((await rows.nth(i).textContent()) || "").replace(/\s+/g, " ").trim();
  133 |       read.push({ name: txt, prob: Number(await rows.nth(i).getAttribute("data-probability")) });
  134 |     }
  135 |     console.log("CARD p50=", p50, "p90=", p90, "milestones=", JSON.stringify(read));
  136 |     await card.screenshot({ animations: 'disabled', path: "evidence/milestone-confidence.png" }).catch(() => {});
  137 | 
  138 |     expect(n, "both milestones are listed on the card").toBe(2);
  139 |     const early = read.find((r) => r.name.includes(EARLY.name))!;
  140 |     const late = read.find((r) => r.name.includes(LATE.name))!;
  141 |     expect(early && late, "both rows are identifiable by name").toBeTruthy();
  142 |     for (const r of read) expect(r.prob >= 0 && r.prob <= 1, `${r.name} probability in [0,1]`).toBe(true);
  143 |     expect(late.prob >= early.prob, "a later milestone can never be less likely").toBe(true);
  144 |     expect(early.prob, `${EARLY.iso} is before every simulated finish`).toBeLessThanOrEqual(0.1);
  145 |     expect(late.prob, `${LATE.iso} is after every simulated finish`).toBeGreaterThanOrEqual(0.9);
  146 |     // Consistency with the card's own percentiles: P(finish <= P90) is >= 0.9 by
  147 |     // definition, so any milestone on or after P90 must also be >= 0.9.
  148 |     if (p90 && LATE.iso >= p90) expect(late.prob).toBeGreaterThanOrEqual(0.9);
  149 |   } finally {
  150 |     await page.goto("about:blank"); // stop autosave before deleting this test's plan
  151 |     if (!createdId) {
```