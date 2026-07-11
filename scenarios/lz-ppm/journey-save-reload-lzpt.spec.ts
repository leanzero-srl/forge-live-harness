// PERSISTENT feature journey — SAVE→RELOAD persistence on LZPT. Make a small edit
// (resize a terminal leaf), SAVE it to KVS, RELOAD the whole page, and assert the
// edit SURVIVES the reload AND stays PENDING vs Jira (the Apply badge is still there
// — Save persists the draft, it does NOT push to Jira). Then Discard + reload +
// _cleanup so LZPT is clean. NEVER Applies to Jira. Keys by summary.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 260_000 });
async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }
async function hasApply(frame: any) { return /Apply \d+ change/i.test(await bodyText(frame)); }
async function isStaged(frame: any) { const t = await bodyText(frame); return /Apply \d+ change/i.test(t) || /Save \(\d+\)/i.test(t); }

test("LZPT Save→reload: a saved edit survives the reload + stays pending vs Jira", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  let s = await enterForgeSurface(page, { surface: "custom" });
  let frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");

  const keyMap: Record<string, string> = await page.evaluate(async () => {
    const res = await fetch("/rest/api/3/search/jql", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" }, credentials: "include", body: JSON.stringify({ jql: "project = LZPT", maxResults: 100, fields: ["summary"] }) });
    const d = await res.json(); const m: Record<string, string> = {}; for (const i of d.issues || []) m[i.fields.summary] = i.key; return m;
  });
  const sink = keyMap["DIAMOND-C sink"];
  expect(sink, "sink key resolved").toBeTruthy();

  const reenter = async () => {
    await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
    const ss = await enterForgeSurface(page, { surface: "custom" }); const f = ss.kind === "custom" ? ss.frame : null; if (!f) throw new Error("no frame"); return f;
  };
  const openGantt = async (fr: any) => {
    await fr.getByText(PLAN, { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
    if (!/Gantt/i.test(await bodyText(fr))) await fr.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
    await page.waitForTimeout(2000);
    await fr.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
    await page.waitForTimeout(3500);
  };
  const sinkW = async (fr: any) => { const rf = await (await fr.locator(":root").elementHandle())!.ownerFrame(); return rf!.evaluate((k: string) => { const el = document.querySelector(`[data-testid="gantt-bar"][data-key="${k}"]`) as HTMLElement | null; return el ? Math.round(el.getBoundingClientRect().width) : null; }, sink); };
  const discardLoop = async (fr: any) => { for (let i = 0; i < 4; i++) { if (!(await hasApply(fr))) break; await fr.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click().catch(() => {}); await page.waitForTimeout(1200); await fr.getByRole("button", { name: /Discard All/i }).first().click().catch(() => {}); await page.waitForTimeout(2000); } };

  await page.waitForTimeout(1500);
  await openGantt(frame);
  await discardLoop(frame);
  const baseW = await sinkW(frame);
  console.log("BASE sink width:", baseW);
  expect(baseW, "sink bar present").not.toBeNull();

  // --- Resize the sink's right edge (widen it) ---
  const box = await frame.locator(`[data-testid="gantt-bar"][data-key="${sink}"]`).first().boundingBox();
  if (!box) throw new Error("sink bar not in viewport");
  const gx = box.x + box.width - 3, gy = box.y + box.height / 2, dx = 56;
  await page.mouse.move(gx, gy); await page.mouse.down();
  for (const f of [0.4, 0.7, 1]) await page.mouse.move(gx + dx * f, gy, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(2500);
  const editedW = await sinkW(frame);
  console.log("EDITED sink width:", editedW);
  expect(editedW! - baseW!, "resize widened the bar").toBeGreaterThan(20);
  expect(await hasApply(frame), "edit is staged (pending vs Jira)").toBeTruthy();

  // --- SAVE to KVS ---
  await frame.locator('[data-testid="plan-save-btn"]').first().click().catch(() => {});
  await page.waitForTimeout(3000);
  console.log("AFTER_SAVE save-has-changes:", await frame.locator('[data-testid="plan-save-btn"]').first().getAttribute("data-has-changes").catch(() => "?"));

  // --- RELOAD the whole page ---
  await page.reload({ waitUntil: "domcontentloaded" });
  frame = await reenter();
  await page.waitForTimeout(1500);
  await openGantt(frame);
  const afterReloadW = await sinkW(frame);
  const pendingAfterReload = await hasApply(frame);
  console.log("AFTER_RELOAD sink width:", afterReloadW, " pending(Apply):", pendingAfterReload);
  // The saved edit SURVIVED the reload...
  expect(Math.abs(afterReloadW! - editedW!), "saved edit survives the reload").toBeLessThanOrEqual(6);
  // ...and is still PENDING vs Jira (Save persisted the draft; it did NOT Apply).
  expect(pendingAfterReload, "saved edit stays pending vs Jira (NOT applied)").toBeTruthy();

  // --- RESTORE: discard the pending edit, then persist the now-clean state so the
  //     lingering "Save (N)" nag can't resurrect the draft on the next open ---
  await discardLoop(frame);
  const restoredW = await sinkW(frame);
  expect(Math.abs(restoredW! - baseW!), "discard restored the sink to its original width").toBeLessThanOrEqual(6);
  // Clear the Save-nag: with the edit discarded, Save persists the clean baseline (0 diff).
  for (let i = 0; i < 3; i++) {
    if (!(await isStaged(frame))) break;
    if (/Save \(\d+\)/i.test(await bodyText(frame))) { await frame.locator('[data-testid="plan-save-btn"]').first().click().catch(() => {}); await page.waitForTimeout(2500); }
    await discardLoop(frame);
  }
  // Reload — confirm LZPT is genuinely clean (no Apply AND no Save nag).
  await page.reload({ waitUntil: "domcontentloaded" });
  frame = await reenter();
  await page.waitForTimeout(1500);
  await openGantt(frame);
  await discardLoop(frame);
  console.log("FINAL sink width:", await sinkW(frame), " staged:", await isStaged(frame));
  expect(await isStaged(frame), "LZPT left clean (no pending Apply AND no Save nag)").toBeFalsy();
});
