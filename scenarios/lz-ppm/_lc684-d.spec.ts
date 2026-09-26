// LIVE CHECK dev 6.84.0 — ITEM 6 (movers.source, captured off the bridge), the REAL
// Discard All (inside Review Changes), and the Storyline page on the 18-chain (items 4/5).
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
const NAME2 = "LC683 Chain18";
test.describe.configure({ retries: 0, timeout: 2_400_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";

test("item 6 + discard + storyline page", async ({ page }) => {
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
  const staged = async () => {
    const t = (await frame.locator("body").textContent().catch(() => "")) || "";
    return t.match(/Apply \d+ change\w*/)?.[0] || null;
  };

  await frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first().click();
  await page.waitForTimeout(18000);
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  R.stagedAtOpen = await staged();

  // Capture anything the app hands to the Forge bridge.
  const rf = await realFrame();
  await rf.evaluate(() => {
    const w: any = window as any;
    if (w.__lzCap2) return;
    w.__lzCap2 = [];
    const keep = (v: any) => {
      try {
        const str = typeof v === "string" ? v : JSON.stringify(v);
        if (str && /movers/.test(str)) w.__lzCap2.push(str.slice(0, 30000));
      } catch (e) { /* ignore */ }
    };
    const mp = (window as any).MessagePort?.prototype;
    if (mp && !mp.__lzPatched) {
      const orig = mp.postMessage; mp.postMessage = function (...a: any[]) { keep(a[0]); return orig.apply(this, a as any); };
      mp.__lzPatched = true;
    }
    const wp = window.postMessage.bind(window);
    (window as any).postMessage = (...a: any[]) => { keep(a[0]); return (wp as any)(...a); };
    const of = w.fetch;
    w.fetch = async function (...a: any[]) { try { keep(a[1]?.body); } catch (e) {} return of.apply(this, a as any); };
    const xs = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (b: any) { keep(b); return xs.apply(this, [b] as any); };
  });

  // Stage one move so there is something for the movers list.
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
  R.stagedAfterMove = await staged();
  R.barsAfterMove = await frame.locator('[data-testid="gantt-bar"]').evaluateAll((els: any[]) =>
    els.map((e) => ({ key: e.getAttribute("data-key"), left: e.style.left })));

  await frame.locator("button").filter({ hasText: /Explain this plan/ }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(30000);
  R.explainText = (await txt(frame.locator("body"))).replace(/\s+/g, " ").slice(0, 2500);
  await page.screenshot({ path: `${OUT}/d-explain.png`, fullPage: true });
  R.caps = await rf.evaluate(() => ((window as any).__lzCap2 || []).slice(0, 4));
  const joined = (R.caps || []).join("\n");
  R.moversSource = joined.match(/"source"\s*:\s*"(baseline|jira|_original)"/)?.[1] || null;
  R.moversBlob = joined.match(/"movers"[\s\S]{0,900}/)?.[0] || null;
  console.log("MOVERS SOURCE =", R.moversSource);
  console.log("MOVERS BLOB =", R.moversBlob);
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(2000);

  // The REAL Discard All: inside Review Changes.
  const applyBtn = frame.locator("button").filter({ hasText: /Apply \d+ change/ }).first();
  await applyBtn.dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/d-review.png`, fullPage: true });
  const discard = frame.locator("button").filter({ hasText: /^Discard All$/ }).first();
  R.discardVisible = await discard.count();
  await discard.dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/d-discard-confirm.png`, fullPage: true });
  const conf = frame.locator("button").filter({ hasText: /^(Discard All|Discard|Discard changes|Yes, discard|Confirm)$/ }).last();
  await conf.dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(8000);
  R.stagedAfterDiscard = await staged();
  R.arrowsAfterDiscard = await frame.locator('[data-testid="dep-arrow-hit"]').count();
  R.barsAfterDiscard = await frame.locator('[data-testid="gantt-bar"]').evaluateAll((els: any[]) =>
    els.map((e) => ({ key: e.getAttribute("data-key"), left: e.style.left, derived: e.getAttribute("data-derived") })));
  await page.screenshot({ path: `${OUT}/d-after-discard.png` });
  console.log("STAGED AFTER DISCARD =", R.stagedAfterDiscard, "arrows", R.arrowsAfterDiscard);

  // ── the Storyline page on the 18-chain ──
  await frame.locator(".lz-appbar-nav-item").filter({ hasText: /^Plans$/ }).first().dispatchEvent("click");
  await page.waitForTimeout(9000);
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME2 }).first().click();
  await page.waitForTimeout(18000);
  await frame.locator('[data-testid="view-tab-storyline"]').first().click().catch(async () => {
    await frame.getByRole("button", { name: /^Storyline$/i }).first().click().catch(() => {});
  });
  await page.waitForTimeout(12000);
  R.storyline = {
    buildBar: await txt(frame.locator('[data-testid="storyline-build"]')),
    blocks: await frame.locator('[data-testid="storyline-block"]').count(),
    beats: await frame.locator('[data-testid="beat-card"]').count(),
    text: (await txt(frame.locator("body"))).replace(/\s+/g, " ").slice(0, 2000),
  };
  await page.screenshot({ path: `${OUT}/d-storyline.png`, fullPage: true });
  console.log("STORYLINE blocks", R.storyline.blocks, "beats", R.storyline.beats);
  fs.writeFileSync(`${OUT}/d-results.json`, JSON.stringify(R, null, 2));
  expect(R.barsAfterMove.length).toBe(4);
});
