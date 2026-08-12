// THE reported cascade bug, end to end on the deployed app.
//
//   "when we have such a dependency: LZPT-104 --> LZPT-105/LZPT-106 --> LZPT-107,
//    when you drag 104 the 105 and 106 are moving but 107 remains as it is"
//
// LZPT-107 is a JOIN node with two predecessors. getAffectedChain was a successor
// DFS with a shared visited set, so it emitted the join BEFORE its longer branch;
// the join settled against a stale predecessor and was never revisited — it was
// not even flagged as cascaded, so nothing flashed and nothing appeared in the
// impact banner. The frontend engine is authoritative on Apply, so the wrong date
// went to Jira.
//
// Asserts the property, not the pixels: after dragging the fork root, the join
// must start AFTER BOTH branches finish. Mutation is DISCARDED; never Applies.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 1, timeout: 300_000 });
const bodyText = async (f: any) => (await f.locator("body").textContent().catch(() => "")) || "";
const isStaged = async (f: any) => /Apply \d+ change|Save \(\d+\)/i.test(await bodyText(f));

test("dragging a diamond's fork root cascades the JOIN node too", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first()
    .waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();

  // Keys float across reseeds — resolve by the stable seeded summaries.
  const keyMap: Record<string, string> = await page.evaluate(async () => {
    const res = await fetch("/rest/api/3/search/jql", {
      method: "POST", credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" },
      body: JSON.stringify({ jql: "project = LZPT", maxResults: 100, fields: ["summary"] }),
    });
    const d = await res.json(); const m: Record<string, string> = {};
    for (const i of d.issues || []) m[i.fields.summary] = i.key;
    return m;
  });
  const A = keyMap["DIAMOND-A source"], B1 = keyMap["DIAMOND-B1 left"],
        B2 = keyMap["DIAMOND-B2 right (longer)"], C = keyMap["DIAMOND-C sink"];
  expect([A, B1, B2, C].every(Boolean), "diamond keys resolved").toBeTruthy();
  console.log(`diamond: ${A} -> {${B1}, ${B2}} -> ${C}`);

  await page.waitForTimeout(1500);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await frame.locator('[data-testid="gantt-bar"]').first().waitFor({ state: "visible", timeout: 90_000 });
  // The tab-switch overlay sits at zIndex 20 across the whole plan, so bars can be
  // VISIBLE while every pointer event still lands on the overlay. Waiting for the
  // bar alone silently produced a no-op drag.
  await frame.locator('[data-testid="tab-loading-overlay"]').waitFor({ state: "detached", timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(500);

  const discard = async () => {
    for (let i = 0; i < 3; i++) {
      if (!(await isStaged(frame))) return;
      await frame.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click().catch(() => {});
      await page.waitForTimeout(1000);
      await frame.getByRole("button", { name: /Discard All/i }).first().click().catch(() => {});
      await page.waitForTimeout(1800);
    }
  };
  await discard(); // clean start

  const geo = (key: string) => realFrame!.evaluate((k) => {
    const el = document.querySelector(`[data-testid="gantt-bar"][data-key="${k}"]`) as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right) };
  }, key);

  try {
    const before = { A: await geo(A), B1: await geo(B1), B2: await geo(B2), C: await geo(C) };
    console.log("BEFORE", JSON.stringify(before));
    expect(Object.values(before).every(Boolean), "all four diamond bars rendered").toBeTruthy();

    // Drag the FORK ROOT right. Editing a DIRECT predecessor of the join could not
    // expose this — the DFS only mis-orders when it reaches the join before the
    // other branch, which needs the fork.
    const box = await frame.locator(`[data-testid="gantt-bar"][data-key="${A}"]`).first().boundingBox();
    if (!box) throw new Error("fork-root bar not in viewport");
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2, dx = 140;
    // Guard against a silent no-op drag: prove the press point actually lands on
    // the bar. It did NOT the first time this ran — a full-surface overlay was
    // swallowing every pointer event while the bars underneath were "visible".
    const inFrame = await realFrame!.evaluate((k) => {
      const r = (document.querySelector(`[data-testid="gantt-bar"][data-key="${k}"]`) as HTMLElement).getBoundingClientRect();
      return { left: r.left, top: r.top };
    }, A);
    const hitKey = await realFrame!.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      return (el?.closest('[data-testid="gantt-bar"]') as HTMLElement | null)?.dataset.key || null;
    }, { x: cx - (box.x - inFrame.left), y: cy - (box.y - inFrame.top) });
    expect(hitKey, `the press point must hit ${A}, not an overlay`).toBe(A);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (const f of [0.3, 0.6, 1]) await page.mouse.move(cx + dx * f, cy, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(3000);

    const after = { A: await geo(A), B1: await geo(B1), B2: await geo(B2), C: await geo(C) };
    console.log("AFTER ", JSON.stringify(after));

    const moved = (k: keyof typeof before) => after[k]!.left - before[k]!.left;
    console.log(`moved: A=${moved("A")} B1=${moved("B1")} B2=${moved("B2")} C=${moved("C")}`);

    expect(moved("A"), "the dragged fork root moved").toBeGreaterThan(40);
    expect(moved("B1"), "branch 1 cascaded").toBeGreaterThan(0);
    expect(moved("B2"), "branch 2 cascaded").toBeGreaterThan(0);
    // THE regression guard. This was 0 before the fix.
    expect(moved("C"), "the JOIN node cascaded — this is the reported bug").toBeGreaterThan(0);

    // And it must land after BOTH branches, not just whichever the traversal saw
    // last. B2 is the longer branch, so it is the binding one.
    expect(after.C!.left, "join starts after the LATER branch finishes").toBeGreaterThanOrEqual(after.B2!.right - 2);
    expect(after.C!.left, "join starts after the shorter branch too").toBeGreaterThanOrEqual(after.B1!.right - 2);

    // The impact banner must name it as well — it used to be missing from
    // cascadedKeys entirely, so it never appeared here either.
    const banner = await bodyText(frame);
    expect(banner, `the cascade impact should mention the join ${C}`).toContain(C);
  } finally {
    await discard();
    expect(await isStaged(frame), "LZPT left clean").toBeFalsy();
  }
});
