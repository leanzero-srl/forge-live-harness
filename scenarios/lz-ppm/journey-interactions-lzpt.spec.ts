// PERSISTENT interaction journey — the core Gantt manipulations on LZPT:
//   EXPAND/COLLAPSE a parent (children hide/show), MOVE a bar (drag → reschedule),
//   RESIZE a bar (drag its right edge → duration changes). Each mutation is asserted
//   from real geometry/DOM then DISCARDED so LZPT is left clean. NEVER Applies.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 260_000 });
async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }
async function isStaged(frame: any) { const t = await bodyText(frame); return /Apply \d+ change/i.test(t) || /Save \(\d+\)/i.test(t); }

test("LZPT interactions: expand/collapse, move, resize — each asserted then discarded", async ({ page }) => {
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
  const epic1 = K("E1 · Linear Chain"), head = K("CROSS-A gate"), sink = K("DIAMOND-C sink");
  expect([epic1, head, sink].every(Boolean), "keys resolved").toBeTruthy();

  await page.waitForTimeout(1500);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  // Clean start.
  for (let i = 0; i < 3; i++) { if (!(await isStaged(frame))) break; await frame.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click().catch(() => {}); await page.waitForTimeout(1000); await frame.getByRole("button", { name: /Discard All/i }).first().click().catch(() => {}); await page.waitForTimeout(1800); }

  const rowCount = () => realFrame!.evaluate(() => document.querySelectorAll('[data-testid="gantt-row"]').length);
  const barBox = async (key: string) => {
    const b = await frame.locator(`[data-testid="gantt-bar"][data-key="${key}"]`).first().boundingBox().catch(() => null);
    return b;
  };
  const barGeo = (key: string) => realFrame!.evaluate((k) => { const el = document.querySelector(`[data-testid="gantt-bar"][data-key="${k}"]`) as HTMLElement | null; if (!el) return null; const r = el.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) }; }, key);

  // ---- 1. EXPAND / COLLAPSE the E1 epic (CHAIN-1..5 hide, then return) ----
  const rowsFull = await rowCount();
  await frame.locator(`[data-testid="gantt-expand-toggle"][data-key="${epic1}"]`).first().click();
  await page.waitForTimeout(1200);
  const rowsCollapsed = await rowCount();
  console.log("ROWS full:", rowsFull, " collapsed:", rowsCollapsed);
  expect(rowsFull - rowsCollapsed, "collapsing E1 hides its 5 chain children").toBe(5);
  // Its children's bars are gone.
  expect(await barGeo(K("CHAIN-3 test")), "CHAIN-3 bar hidden while E1 collapsed").toBeNull();
  await frame.locator(`[data-testid="gantt-expand-toggle"][data-key="${epic1}"]`).first().click();
  await page.waitForTimeout(1200);
  expect(await rowCount(), "expanding E1 restores all rows").toBe(rowsFull);
  expect(await isStaged(frame), "expand/collapse stages nothing (view-only)").toBeFalsy();

  // ---- 2. MOVE a bar: drag the free head CROSS-A to the right ----
  const preMove = await barGeo(head);
  const box = await barBox(head);
  if (!box) throw new Error("CROSS-A bar not in viewport");
  {
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2, dx = 110;
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (const f of [0.3, 0.6, 1]) await page.mouse.move(cx + dx * f, cy, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(2500);
  }
  const postMove = await barGeo(head);
  console.log("MOVE head left:", preMove?.left, "->", postMove?.left);
  expect(postMove!.left - preMove!.left, "dragging the bar moved it right").toBeGreaterThan(40);
  expect(await isStaged(frame), "the move staged a draft").toBeTruthy();
  // discard the move
  await frame.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await frame.getByRole("button", { name: /Discard All/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  expect(Math.abs((await barGeo(head))!.left - preMove!.left), "move discarded (bar back to origin)").toBeLessThanOrEqual(4);

  // ---- 3. RESIZE a terminal leaf: drag DIAMOND-C sink's RIGHT edge outward ----
  const preResize = await barGeo(sink);
  const sbox = await barBox(sink);
  if (!sbox) throw new Error("sink bar not in viewport");
  {
    // grab within a few px of the right edge → resize-right mode (widen the bar)
    const gx = sbox.x + sbox.width - 3, gy = sbox.y + sbox.height / 2, dx = 56;
    await page.mouse.move(gx, gy); await page.mouse.down();
    for (const f of [0.4, 0.7, 1]) await page.mouse.move(gx + dx * f, gy, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(2500);
  }
  const postResize = await barGeo(sink);
  console.log("RESIZE sink width:", preResize?.width, "->", postResize?.width, " left:", preResize?.left, "->", postResize?.left);
  expect(postResize!.width - preResize!.width, "resizing the right edge widened the bar (longer duration)").toBeGreaterThan(20);
  expect(Math.abs(postResize!.left - preResize!.left), "resize kept the START edge fixed (only due moved)").toBeLessThanOrEqual(4);
  expect(await isStaged(frame), "the resize staged a draft").toBeTruthy();
  // discard the resize
  await frame.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await frame.getByRole("button", { name: /Discard All/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  expect(Math.abs((await barGeo(sink))!.width - preResize!.width), "resize discarded (bar back to original width)").toBeLessThanOrEqual(4);
  expect(await isStaged(frame), "plan clean at the end (never Applied)").toBeFalsy();
});
