// LIVE CHECK dev 6.84.0 — ITEM 6: Explain's movers compare against the BASELINE (1b9d6043),
// and ITEM 2/5 surfaces: the card punchline == the Dashboard health line, the Storyline page.
// Baseline on "LC683 Lag Bed R" was set by REST: WFH-3513 = 2026-10-26..2026-10-30 (settled).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
// @ts-ignore
import { loadEnv } from "../../data/env.mjs";
import * as fs from "fs";

loadEnv();
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/shots684";
const NAME = "LC683 Lag Bed";
test.describe.configure({ retries: 1, timeout: 2_400_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";

test("item 6 — explain movers come from the baseline", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.frame;
  const realFrame = async () => (await (await frame.locator(":root").elementHandle())!.ownerFrame())!;
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 180_000 });
  await page.waitForTimeout(3000);
  const R: any = {};
  const card = () => frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first();
  R.card = {
    verdict: await txt(card().locator('[data-testid="plan-verdict-chip"]')),
    punchline: await txt(card().locator('[data-testid="plan-punchline"]')),
    finish: (await txt(card().locator('[data-testid="plan-finish"]'))).replace(/\n/g, " "),
    room: (await txt(card().locator('[data-testid="plan-room"]'))).replace(/\n/g, " "),
  };
  console.log("CARD", JSON.stringify(R.card));
  await page.screenshot({ path: `${OUT}/c-card.png` });
  await card().click();
  await page.waitForTimeout(18000);

  // Dashboard health line must be byte-identical to the card punchline.
  await frame.getByRole("button", { name: /^Dashboard$/i }).first().click().catch(() => {});
  await page.waitForTimeout(9000);
  R.dash = {
    verdict: await txt(frame.locator('[data-testid="plan-health-verdict"]')),
    punchline: await txt(frame.locator('[data-testid="plan-health-punchline"]')),
  };
  R.dashMatchesCard = R.dash.punchline.trim() === R.card.punchline.trim();
  R.variance = (await txt(frame.locator('[data-testid="baseline-variance"]'))).replace(/\s+/g, " ").slice(0, 900);
  if (R.variance === "(none)") {
    const body = (await txt(frame.locator("body"))).replace(/\s+/g, " ");
    const i = body.search(/[Bb]aseline/);
    R.variance = i >= 0 ? body.slice(Math.max(0, i - 200), i + 700) : "(no baseline text)";
  }
  console.log("DASH", JSON.stringify(R.dash), "| match:", R.dashMatchesCard);
  await page.screenshot({ path: `${OUT}/c-dashboard.png`, fullPage: true });

  // Gantt: capture what the client sends to explainPlan.
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  const rf = await realFrame();
  await rf.evaluate(() => {
    const w: any = window as any;
    if (w.__lzCaps) return;
    w.__lzCaps = [];
    const of = w.fetch;
    w.fetch = async function (...args: any[]) {
      try {
        const body = args[1] && args[1].body ? String(args[1].body) : "";
        if (body && /movers|explainPlan|facts/.test(body)) w.__lzCaps.push(body.slice(0, 20000));
      } catch (e) { /* ignore */ }
      return of.apply(this, args as any);
    };
  });

  // Move one row: drag WFH-3511 later so the chain cascades.
  const bar = (k: string) => frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first();
  await bar("WFH-3511").scrollIntoViewIfNeeded();
  const box = await bar("WFH-3511").boundingBox();
  if (box) {
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (const f of [0.3, 0.6, 1]) await page.mouse.move(cx + 200 * f, cy, { steps: 6 });
    await page.mouse.up();
  }
  await page.waitForTimeout(5000);
  R.afterMove = await frame.locator('[data-testid="gantt-bar"]').evaluateAll((els: any[]) =>
    els.map((e) => ({ key: e.getAttribute("data-key"), left: e.style.left })));
  R.stagedAfterMove = ((await frame.locator("body").textContent().catch(() => "")) || "").match(/Apply \d+ change\w*/)?.[0] || null;
  await page.screenshot({ path: `${OUT}/c-after-move.png` });

  await frame.getByRole("button", { name: /Explain/i }).first().click().catch(() => {});
  await page.waitForTimeout(12000);
  R.modalOpen = await frame.locator('[data-testid="cascade-explain-modal"]').count();
  R.modalText = (await txt(frame.locator('[data-testid="cascade-explain-modal"]'))).replace(/\s+/g, " ").slice(0, 1800);
  await page.screenshot({ path: `${OUT}/c-explain.png`, fullPage: true });
  R.caps = await rf.evaluate(() => ((window as any).__lzCaps || []).slice(0, 6));
  const joined = (R.caps || []).join("\n");
  const m = joined.match(/"movers"\s*:\s*\{[^}]*"source"\s*:\s*"([a-z_]+)"/);
  R.moversSource = m ? m[1] : null;
  const rowsM = joined.match(/"movers"[\s\S]{0,2000}?\]/);
  R.moversRaw = rowsM ? rowsM[0].slice(0, 1500) : null;
  console.log("MOVERS SOURCE =", R.moversSource);
  console.log("MOVERS RAW =", R.moversRaw);

  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(1500);
  const disc = frame.locator("button").filter({ hasText: /Discard All|Discard all/ }).first();
  await disc.dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(1500);
  await frame.locator("button").filter({ hasText: /^(Discard|Discard changes|Yes|Confirm)$/ }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(7000);
  R.stagedAtExit = ((await frame.locator("body").textContent().catch(() => "")) || "").match(/Apply \d+ change\w*/)?.[0] || null;
  console.log("STAGED_AFTER_CLEANUP =", !!R.stagedAtExit);
  await page.screenshot({ path: `${OUT}/c-final.png` });
  fs.writeFileSync(`${OUT}/c-results.json`, JSON.stringify(R, null, 2));
  expect(R.card.punchline).not.toBe("(none)");
});
