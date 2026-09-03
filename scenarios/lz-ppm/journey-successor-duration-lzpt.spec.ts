// REGRESSION GUARD for the cascade bug the Monte Carlo feature exposed (2026-09-02):
// the frontend engine read a cascaded successor's `_original.duration` BEFORE its
// current one, so resizing a successor and then dragging its predecessor silently
// REVERTED the resize — a staged, unapplied edit lost on every upstream drag. The
// backend always kept the current duration, and parity was blind to it (the reverted
// preview is itself a backend fixed point), so only a snapshot lock caught it.
//
// This drives the user's actual sequence on LZPT:
//   1. resize CHAIN-3 (a mid-chain successor) → its bar gets wider, staged
//   2. drag CROSS-A (the FREE head of that chain — CHAIN-1 is itself pinned by its
//      cross-epic predecessor CROSS-A, and the app refuses to free-drag a constrained
//      successor) to the right → the whole chain cascades
//   3. CHAIN-3 must MOVE but KEEP its edited width.
// Everything is discarded at the end; nothing is ever Applied.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 1, timeout: 300_000 });

async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }
async function isStaged(frame: any) { const t = await bodyText(frame); return /Apply \d+ change/i.test(t) || /Save \(\d+\)/i.test(t); }
async function discardAll(frame: any, page: any) {
  for (let i = 0; i < 3; i++) {
    if (!(await isStaged(frame))) break;
    await frame.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click().catch(() => {});
    await page.waitForTimeout(1200);
    await frame.getByRole("button", { name: /Discard All/i }).first().click().catch(() => {});
    await page.waitForTimeout(2200);
  }
}

test("LZPT: a cascaded successor keeps its EDITED duration when its predecessor moves", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();

  // Keys float across reseeds — resolve by summary from the TOP page (wolfaenpak origin).
  const keyMap: Record<string, string> = await page.evaluate(async () => {
    const res = await fetch("/rest/api/3/search/jql", {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" },
      credentials: "include", body: JSON.stringify({ jql: "project = LZPT", maxResults: 100, fields: ["summary"] }),
    });
    const d = await res.json(); const m: Record<string, string> = {};
    for (const i of d.issues || []) m[i.fields.summary] = i.key;
    return m;
  });
  const head = keyMap["CROSS-A gate"];         // no predecessor → the only freely draggable head
  const mid = keyMap["CHAIN-3 test"];          // successor of CHAIN-2 → cascaded, not draggable
  expect([head, mid].every(Boolean), "chain keys resolved").toBeTruthy();

  await page.waitForTimeout(1500);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  await discardAll(frame, page);

  const geo = (key: string) => realFrame!.evaluate((k) => {
    const el = document.querySelector(`[data-testid="gantt-bar"][data-key="${k}"]`) as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
  }, key);

  try {
    const midBefore = await geo(mid);
    const headBefore = await geo(head);
    expect(midBefore && headBefore, "both bars are on screen").toBeTruthy();

    // ---- 1. RESIZE the successor: grab its right edge and widen it ----
    const box = await frame.locator(`[data-testid="gantt-bar"][data-key="${mid}"]`).first().boundingBox();
    if (!box) throw new Error("CHAIN-3 bar not in viewport");
    const gx = box.x + box.width - 3, gy = box.y + box.height / 2, dx = 56;
    await page.mouse.move(gx, gy); await page.mouse.down();
    for (const f of [0.4, 0.7, 1]) await page.mouse.move(gx + dx * f, gy, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(2500);
    const midResized = await geo(mid);
    console.log("RESIZE", mid, midBefore!.width, "->", midResized!.width);
    expect(midResized!.width - midBefore!.width, "the successor got visibly longer").toBeGreaterThan(20);
    expect(await isStaged(frame), "the resize is staged and unapplied").toBeTruthy();

    // ---- 2. DRAG the chain HEAD right → the whole chain cascades ----
    const hbox = await frame.locator(`[data-testid="gantt-bar"][data-key="${head}"]`).first().boundingBox();
    if (!hbox) throw new Error("CROSS-A bar not in viewport");
    const hx = hbox.x + hbox.width / 2, hy = hbox.y + hbox.height / 2, hdx = 90;
    await page.mouse.move(hx, hy); await page.mouse.down();
    for (const f of [0.3, 0.6, 1]) await page.mouse.move(hx + hdx * f, hy, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(3000);

    // ---- 3. the successor moved, but kept the duration the user gave it ----
    const midAfter = await geo(mid);
    console.log("AFTER CASCADE", mid, "left", midResized!.left, "->", midAfter!.left, "| width", midResized!.width, "->", midAfter!.width);
    expect(midAfter!.left, "the successor was pushed later by the cascade").toBeGreaterThan(midResized!.left);
    expect(Math.abs(midAfter!.width - midResized!.width),
      "THE BUG: the cascade must not revert the successor to its committed duration").toBeLessThanOrEqual(4);
    expect(midAfter!.width - midBefore!.width, "still longer than the committed span").toBeGreaterThan(20);
    await page.screenshot({ path: "evidence/successor-duration-after-cascade.png" }).catch(() => {});
  } finally {
    // A resize + a drag stage a full recalc; the UI discard occasionally leaves the
    // persisted DRAFT behind, and a leftover draft contaminates every later journey
    // (it survives reloads and re-indexes by design). Belt and braces: discard in the
    // UI, then clear the plan's drafts through the hook and verify from a fresh load.
    await discardAll(frame, page);
    const plans = (await getTestState("lz-ppm", { what: "plans" })).plans as any[];
    const lzpt = plans.find((p) => p.name === PLAN);
    if (lzpt) await getTestState("lz-ppm", { what: "clearDrafts", planId: lzpt.id }).catch(() => {});
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(4000);
    const s2 = await enterForgeSurface(page, { surface: "custom" });
    const f2 = s2.kind === "custom" ? s2.frame : null;
    if (f2) {
      await f2.getByText(PLAN, { exact: false }).first().click().catch(() => {});
      await page.waitForTimeout(2500);
      await f2.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
      await page.waitForTimeout(3000);
      await discardAll(f2, page);
      console.log("STAGED_AFTER_CLEANUP=", await isStaged(f2));
      expect(await isStaged(f2), "LZPT left clean (never Applied)").toBeFalsy();
    }
  }
});
