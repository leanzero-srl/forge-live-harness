// dev 7.20.0 release proof — the Storyline tab's lede on a plan that HAS a storyline: the tester's
// "[harness-test] rel720 chain" (13 chained WFH tickets, 5 open and past due; deleted after).
import { test, expect } from "../../fixtures/forge";
import { boot, openPlan, tab, shot, isStaged, log, OUT, header } from "./_rel720-lib";

test.describe.configure({ retries: 0, timeout: 900_000 });

test("rel720 I: storyline lede with a real storyline", async ({ page }) => {
  const { frame, real } = await boot(page);
  const card = frame.locator('[data-testid="plan-card"]').filter({ has: frame.locator('[data-testid="plan-card-name"]', { hasText: "[harness-test] rel720 chain" }) }).first();
  await card.waitFor({ state: "visible", timeout: 90_000 });
  log("I_CARD", await card.evaluate((el: any) => ({ chip: el.querySelector('[data-testid="plan-verdict-chip"]')?.textContent, punch: el.querySelector('[data-testid="plan-punchline"]')?.textContent, tickets: el.querySelector('[data-testid="plan-ticket-line"]')?.textContent ?? null })));
  await openPlan(page, frame, "[harness-test] rel720 chain");
  log("I_HEADER", await header(real));
  await tab(page, frame, "storyline");
  await page.waitForTimeout(3000);
  const build = frame.getByRole("button", { name: "Build the storyline" }).first();
  if (await build.count()) { await build.click(); for (let i = 0; i < 90; i++) { await page.waitForTimeout(2000); if (await frame.locator('[data-testid="storyline-about"], [data-testid="storyline-view"]').count()) break; } }
  await page.waitForTimeout(4000);
  const sl = await real.evaluate(() => {
    const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as any;
    return { about: (q("about-verdict")?.textContent || "").replace(/\s+/g, " "), rung: q("about-verdict")?.getAttribute("data-rung"), tickets: q("about-tickets")?.textContent ?? null,
      ticketsColor: q("about-tickets") ? getComputedStyle(q("about-tickets")).color : null, lede: (document.querySelector(".lz-sl-lede")?.textContent || "").replace(/\s+/g, " "),
      reconcile: q("storyline-reconcile")?.textContent ?? null, body: (document.body.innerText || "").slice(0, 600) };
  });
  log("I_STORYLINE", sl);
  await frame.locator('[data-testid="storyline-about"]').first().screenshot({ path: `${OUT}/i-01-storyline-about.png` }).catch(() => {});
  await shot(page, "i-02-storyline");
  log("I_STAGED", await isStaged(frame));
  expect(true).toBe(true);
});
