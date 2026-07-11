// PERSISTENT interaction journey — DEPENDENCY editing on LZPT: DELETE an existing
// link (via the bar detail popup's remove-×) and DRAW a new link (drag from a bar's
// connector dot to a target). Each asserted from the rendered arrows, then DISCARDED.
// NEVER Applies. Keys float → mapped by summary.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 260_000 });
async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }
async function isStaged(frame: any) { const t = await bodyText(frame); return /Apply \d+ change/i.test(t) || /Save \(\d+\)/i.test(t); }

test("LZPT dependency edit: delete a link + draw a link, each asserted then discarded", async ({ page }) => {
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
  const K = (x: string) => keyMap[x];
  const c1 = K("CHAIN-1 kickoff"), c2 = K("CHAIN-2 build");
  const f1 = K("FANOUT-1"), f2 = K("FANOUT-2");
  expect([c1, c2, f1, f2].every(Boolean), "keys resolved").toBeTruthy();

  await page.waitForTimeout(1500);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  for (let i = 0; i < 3; i++) { if (!(await isStaged(frame))) break; await frame.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click().catch(() => {}); await page.waitForTimeout(1000); await frame.getByRole("button", { name: /Discard All/i }).first().click().catch(() => {}); await page.waitForTimeout(1800); }

  const arrowExists = (from: string, to: string) => realFrame!.evaluate(({ f, t }) => !!document.querySelector(`[data-testid="dep-arrow-hit"][data-link="${f}-${t}"]`), { f: from, t: to });
  const barBox = async (key: string) => await frame.locator(`[data-testid="gantt-bar"][data-key="${key}"]`).first().boundingBox().catch(() => null);
  const discardAll = async () => {
    await frame.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click().catch(() => {});
    await page.waitForTimeout(1200);
    await frame.getByRole("button", { name: /Discard All/i }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
  };

  // ---- 1. DELETE the CHAIN-1 → CHAIN-2 link via CHAIN-2's detail popup ----
  expect(await arrowExists(c1, c2), "CHAIN-1→CHAIN-2 link exists to start").toBeTruthy();
  await frame.locator(`[data-testid="gantt-bar"][data-key="${c2}"]`).first().click();
  await page.waitForTimeout(1000);
  // The DateEditor is position:fixed in a tall Forge iframe → dispatchEvent.
  await frame.locator(`[aria-label="Remove dependency ${c1}"]`).first().dispatchEvent("click");
  await page.waitForTimeout(700);
  // Confirm dialog ("Remove: A blocks B?") → confirm.
  await frame.getByRole("button", { name: /^Remove$/i }).first().click().catch(async () => {
    await frame.getByRole("button", { name: /^Remove$/i }).first().dispatchEvent("click").catch(() => {});
  });
  await page.waitForTimeout(1800);
  console.log("AFTER_DELETE arrow exists:", await arrowExists(c1, c2), " staged:", await isStaged(frame));
  expect(await arrowExists(c1, c2), "CHAIN-1→CHAIN-2 arrow is GONE after remove").toBeFalsy();
  expect(await isStaged(frame), "removing the link staged a draft").toBeTruthy();
  await discardAll();
  expect(await arrowExists(c1, c2), "link RESTORED after discard").toBeTruthy();

  // ---- 2. DRAW a new FANOUT-1 → FANOUT-2 link by dragging from the connector dot ----
  expect(await arrowExists(f1, f2), "FANOUT-1→FANOUT-2 does NOT exist yet").toBeFalsy();
  const srcBox = await barBox(f1), dstBox = await barBox(f2);
  if (!srcBox || !dstBox) throw new Error("fanout bars not in viewport");
  // Reveal the right connector dot (hover), then drag it onto the target bar.
  await page.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2);
  await page.waitForTimeout(400);
  const dotX = srcBox.x + srcBox.width + 4, dotY = srcBox.y + srcBox.height / 2;
  await page.mouse.move(dotX, dotY);
  await page.mouse.down();
  const tx = dstBox.x + dstBox.width / 2, ty = dstBox.y + dstBox.height / 2;
  for (const f of [0.3, 0.6, 0.9, 1]) await page.mouse.move(dotX + (tx - dotX) * f, dotY + (ty - dotY) * f, { steps: 5 });
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(2000);
  console.log("AFTER_DRAW arrow exists:", await arrowExists(f1, f2), " staged:", await isStaged(frame));
  expect(await arrowExists(f1, f2), "a NEW FANOUT-1→FANOUT-2 arrow was drawn").toBeTruthy();
  expect(await isStaged(frame), "drawing the link staged a draft").toBeTruthy();

  // CLEANUP — a drawn link goes into the persisted DRAFT, so "Discard All" (which
  // reverts Jira-staged changes) won't undo it; REMOVE it explicitly via FANOUT-2's
  // editor, then discard + persist the cleared draft so LZPT is left truly clean.
  await frame.locator(`[data-testid="gantt-bar"][data-key="${f2}"]`).first().click();
  await page.waitForTimeout(1000);
  await frame.locator(`[aria-label="Remove dependency ${f1}"]`).first().dispatchEvent("click");
  await page.waitForTimeout(700);
  await frame.getByRole("button", { name: /^Remove$/i }).first().click().catch(async () => { await frame.getByRole("button", { name: /^Remove$/i }).first().dispatchEvent("click").catch(() => {}); });
  await page.waitForTimeout(1500);
  console.log("AFTER_REMOVE_DRAWN arrow exists:", await arrowExists(f1, f2));
  expect(await arrowExists(f1, f2), "the drawn link is REMOVED again").toBeFalsy();
  // Discard the remaining draft (date-cascade residue). Do NOT Save — saving would
  // persist that residue onto the bed. A couple of discard passes clears it.
  await discardAll();
  await discardAll();

  // Reload — confirm LZPT is clean and the drawn link did NOT persist.
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
  const rf2 = await (await frame2.locator(":root").elementHandle())!.ownerFrame();
  const stillExists = await rf2!.evaluate(({ f, t }) => !!document.querySelector(`[data-testid="dep-arrow-hit"][data-link="${f}-${t}"]`), { f: f1, t: f2 });
  console.log("AFTER_RELOAD drawn link exists:", stillExists);
  expect(stillExists, "drawn link did NOT persist — LZPT restored clean").toBeFalsy();
  // A dep edit triggers a full recalc that stages every leaf as a draft (SAVE_NAG);
  // discard it post-reload so the bed is left truly clean for the next journey.
  for (let i = 0; i < 4; i++) {
    if (!(await isStaged(frame2))) break;
    await frame2.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click().catch(() => {});
    await page.waitForTimeout(1200);
    await frame2.getByRole("button", { name: /Discard All/i }).first().click().catch(() => {});
    await page.waitForTimeout(2000);
  }
  console.log("FINAL staged:", await isStaged(frame2));
  expect(await isStaged(frame2), "LZPT left clean (no lingering draft)").toBeFalsy();
});
