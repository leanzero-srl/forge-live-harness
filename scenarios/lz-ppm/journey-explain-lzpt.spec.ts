// PERSISTENT feature journey — EXPLAIN-CASCADE ACCURACY on LZPT. Drag the free head
// CROSS-A; the "This change moved N issues" banner must tell the TRUTH: its moved
// count == the number of bars that ACTUALLY shifted, its Details list == exactly the
// shifted issues, and the finish-slip is positive (dragged later). Then discard +
// robust cleanup (a drag stages a full recalc / SAVE_NAG). NEVER Applies.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/848bc036-f0f1-4281-b0cf-12ff9cf45fd9/scratchpad";
test.describe.configure({ retries: 0, timeout: 260_000 });
async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }
async function isStaged(frame: any) { const t = await bodyText(frame); return /Apply \d+ change/i.test(t) || /Save \(\d+\)/i.test(t); }

test("LZPT Explain: the cascade banner's moved-count + list match the ACTUAL bar shifts", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();

  const keyMap: Record<string, string> = await page.evaluate(async () => {
    const res = await fetch("/rest/api/3/search/jql", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" }, credentials: "include", body: JSON.stringify({ jql: "project = LZPT", maxResults: 100, fields: ["summary"] }) });
    const d = await res.json(); const m: Record<string, string> = {}; for (const i of d.issues || []) m[i.fields.summary] = i.key; return m;
  });
  const head = keyMap["CROSS-A gate"];
  expect(head, "head key resolved").toBeTruthy();

  await page.waitForTimeout(1500);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  for (let i = 0; i < 3; i++) { if (!(await isStaged(frame))) break; await frame.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click().catch(() => {}); await page.waitForTimeout(1000); await frame.getByRole("button", { name: /Discard All/i }).first().click().catch(() => {}); await page.waitForTimeout(1800); }

  // Snapshot every LEAF bar's x (parents roll up separately — exclude them).
  const barXs = () => realFrame!.evaluate(() => {
    const o: Record<string, number> = {};
    for (const el of Array.from(document.querySelectorAll('[data-testid="gantt-bar"]'))) {
      if ((el as HTMLElement).getAttribute("data-parent") === "true") continue;
      const k = (el as HTMLElement).getAttribute("data-key"); if (!k) continue;
      o[k] = Math.round((el as HTMLElement).getBoundingClientRect().left);
    }
    return o;
  });

  const before = await barXs();
  // Drag the free head right.
  const box = await frame.locator(`[data-testid="gantt-bar"][data-key="${head}"]`).first().boundingBox();
  if (!box) throw new Error("head bar not in viewport");
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2, dx = 120;
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (const f of [0.25, 0.5, 0.75, 1]) await page.mouse.move(cx + dx * f, cy, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SHOT}/explain-cascade.png` });

  const after = await barXs();
  // Which LEAF bars actually shifted (> 6px)?
  const shifted = Object.keys(after).filter((k) => before[k] != null && Math.abs(after[k] - before[k]) > 6);
  console.log("SHIFTED_LEAVES:", shifted.length, JSON.stringify(shifted));

  // Read the cascade-impact banner.
  const banner = await realFrame!.evaluate(() => {
    const el = document.querySelector('[data-testid="cascade-impact"]');
    return el ? { movedCount: Number(el.getAttribute("data-moved-count")), finishSlip: Number(el.getAttribute("data-finish-slip")) } : null;
  });
  console.log("BANNER:", JSON.stringify(banner));
  expect(banner, "cascade-impact banner appeared after the drag").not.toBeNull();

  // Expand Details and read the listed moved items.
  await frame.getByRole("button", { name: /^Details$/i }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  const items = await realFrame!.evaluate(() => Array.from(document.querySelectorAll('[data-testid="cascade-moved-item"]')).map((el) => ({ key: el.getAttribute("data-key"), slip: Number(el.getAttribute("data-slip")) })));
  console.log("MOVED_ITEMS:", JSON.stringify(items));

  // --- ACCURACY assertions ---
  // Self-consistency: the "moved N" count == the number of items the Explain lists.
  expect(items.length, "moved-count == the number of listed items").toBe(banner!.movedCount);
  // finishSlip is legitimately >=0 here (can be 0): the PROJECT finish is owned by
  // the standalone "EDGE long-run" (06-30), which the chain drag doesn't move — so
  // the plan still finishes the same day even though the chain slipped later.
  expect(banner!.finishSlip, "finish slip >= 0").toBeGreaterThanOrEqual(0);
  // TRUTHFULNESS: the listed LEAVES == EXACTLY the leaves that cascaded (the actually
  // shifted leaves MINUS the dragged head — the edit is the cause, not a 'moved'
  // downstream item). No phantom entries, none missing.
  const cascadedLeaves = new Set(shifted.filter((k) => k !== head));
  const listedLeaves = new Set(items.filter((it) => before[it.key!] !== undefined).map((it) => it.key!));
  console.log("CASCADED_LEAVES:", JSON.stringify([...cascadedLeaves]), " LISTED_LEAVES:", JSON.stringify([...listedLeaves]));
  expect(listedLeaves, "Explain lists EXACTLY the leaves that cascaded").toEqual(cascadedLeaves);
  expect(cascadedLeaves.size, "several leaves cascaded (the chain)").toBeGreaterThanOrEqual(5);
  // Each cascaded leaf slipped LATER (positive slip — the head was dragged forward).
  for (const it of items) if (before[it.key!] !== undefined) expect(it.slip, `${it.key} slipped later (+)`).toBeGreaterThan(0);

  // --- RESTORE — discard + robust post-reload cleanup (drag stages a 37-leaf recalc) ---
  const discardAll = async (fr: any) => { await fr.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click().catch(() => {}); await page.waitForTimeout(1200); await fr.getByRole("button", { name: /Discard All/i }).first().click().catch(() => {}); await page.waitForTimeout(2200); };
  await discardAll(frame);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s2 = await enterForgeSurface(page, { surface: "custom" });
  const frame2 = s2.kind === "custom" ? s2.frame : null;
  if (!frame2) throw new Error("no frame after reload");
  await page.waitForTimeout(2000);
  await frame2.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt/i.test(await bodyText(frame2))) await frame2.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame2.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(3500);
  for (let i = 0; i < 4; i++) { if (!(await isStaged(frame2))) break; await discardAll(frame2); }
  console.log("FINAL staged:", await isStaged(frame2));
  expect(await isStaged(frame2), "LZPT left clean (drag discarded)").toBeFalsy();
});
