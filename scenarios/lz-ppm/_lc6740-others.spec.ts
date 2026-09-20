// The Storyline tab on plans that have NO storyline (the dev site's own plans).
// READ-ONLY: it never clicks a build, so it costs no model call and writes nothing.
// Kept as a standing journey because "no storyline" must still be a PAGE — the
// defect class it guards is the tab rendering NEITHER the view nor the empty state
// (a blank panel), which no r2 spec can see: the r2 bed always has storylines.
// Plans are named by LC_PLANS (default "LZPT Scenarios|test").
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lc6740";
const NAMES = (process.env.LC_PLANS || "LZPT Scenarios|test").split("|");
test.describe.configure({ retries: 0, timeout: 1_800_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";
const body = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";

test("storyline tab on plans with no storyline", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1200 });
  await assertLoggedIn(page);
  const out: any[] = [];
  for (const name of NAMES) {
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
    const s = await enterForgeSurface(page, { surface: "custom" });
    if (s.kind !== "custom") throw new Error("no custom frame");
    const frame = s.frame;
    await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 120_000 });
    await page.waitForTimeout(3000);
    const card = frame.locator('[data-testid="plan-card"]').filter({ hasText: name }).first();
    const chip = await txt(card.locator('[data-testid="plan-verdict-chip"]'));
    await card.click();
    await page.waitForTimeout(9000);
    if (!/Gantt/i.test(await body(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
    await page.waitForTimeout(8000);
    await frame.locator('[data-testid="view-tab-storyline"]').first().click();
    await page.waitForTimeout(9000);
    const hasView = await frame.locator('[data-testid="storyline-view"]').count();
    const hasEmpty = await frame.locator('[data-testid="storyline-empty"]').count();
    const about = frame.locator('[data-testid="about-verdict"]');
    const aboutN = await about.count();
    const word = aboutN ? await txt(about.first().locator("b").first()) : null;
    const rung = aboutN ? await about.first().getAttribute("data-rung") : null;
    const pageText = hasEmpty ? await txt(frame.locator('[data-testid="storyline-empty"]')) : (hasView ? await txt(frame.locator('[data-testid="storyline-view"]')) : "(neither)");
    console.log(`PLAN ${name}: cardChip=${JSON.stringify(chip)} view=${hasView} empty=${hasEmpty} word=${JSON.stringify(word)} rung=${rung}`);
    console.log("PAGE:", pageText.replace(/\n/g, " | ").slice(0, 600));
    out.push({ name, chip, hasView, hasEmpty, word, rung, pageText });
    const safe = name.replace(/[^a-z0-9]+/gi, "-");
    await page.screenshot({ path: `${OUT}/other-${safe}.png`, fullPage: true });
  }
  fs.writeFileSync(`${OUT}/others.json`, JSON.stringify(out, null, 1));
  expect(out.length).toBe(NAMES.length);
  for (const r of out) {
    // EXACTLY ONE of the two states, never both and never neither.
    expect(!!r.hasView !== !!r.hasEmpty, `${r.name}: view=${r.hasView} empty=${r.hasEmpty}`).toBe(true);
    // The empty state is a SENTENCE, not a blank box, and it never leaks an id.
    if (r.hasEmpty) {
      expect(r.pageText.trim().length, `${r.name}: empty state must say why`).toBeGreaterThan(40);
      expect(r.pageText).not.toMatch(/\b(?:ch|bt|sg):[0-9a-f]{4,}/);
    }
    // A plan word, where there is one, always carries its rung.
    if (r.word && r.word !== "(none)") expect(r.rung, `${r.name}: word without a rung`).toBeTruthy();
  }
});
