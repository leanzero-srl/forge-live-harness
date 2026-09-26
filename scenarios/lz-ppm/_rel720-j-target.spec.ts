// dev 7.20.0 release proof — the plan word WITH a plan-level target, on the tester's
// "[harness-test] rel720 target" plan: card word + room, header word + room on two tabs, hero. READ-ONLY.
// REL720_TAG names the evidence files (the tester moves the target between runs).
import { test, expect } from "../../fixtures/forge";
import { boot, openPlan, tab, shot, isStaged, log, OUT, header } from "./_rel720-lib";

test.describe.configure({ retries: 0, timeout: 600_000 });
const TAG = process.env.REL720_TAG || "t";
const NAME = "[harness-test] rel720 target";

test("rel720 J: target word, room, header, hero", async ({ page }) => {
  const { frame, real } = await boot(page);
  const card = frame.locator('[data-testid="plan-card"]').filter({ has: frame.locator('[data-testid="plan-card-name"]', { hasText: NAME }) }).first();
  await card.waitFor({ state: "visible", timeout: 90_000 });
  await card.scrollIntoViewIfNeeded();
  log(`J_${TAG}_CARD`, await card.evaluate((el: any) => { const q = (id: string) => el.querySelector(`[data-testid="${id}"]`); return { chip: q("plan-verdict-chip")?.textContent, chipBg: q("plan-verdict-chip") ? getComputedStyle(q("plan-verdict-chip")).backgroundColor : null, punch: q("plan-punchline")?.textContent, room: (q("plan-room")?.textContent || "").replace(/\s+/g, " "), roomLabel: q("plan-room-label")?.textContent, roomAmount: q("plan-room-amount")?.textContent, finish: q("plan-finish")?.textContent, tickets: q("plan-ticket-line")?.textContent ?? null }; }));
  await card.screenshot({ path: `${OUT}/j-${TAG}-card.png` });
  await openPlan(page, frame, NAME);
  for (const t of ["gantt", "dashboard"]) {
    await tab(page, frame, t); await page.waitForTimeout(3000);
    log(`J_${TAG}_HDR_${t}`, await header(real));
  }
  log(`J_${TAG}_HERO`, await real.evaluate(() => { const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as any; return { verdict: q("plan-health-verdict")?.textContent, punch: q("plan-health-punchline")?.textContent, commitment: q("plan-health-commitment")?.textContent ?? null, tickets: q("plan-health-tickets")?.textContent ?? null }; }));
  await shot(page, `j-${TAG}-dashboard`);
  log(`J_${TAG}_STAGED`, await isStaged(frame));
  expect(true).toBe(true);
});
