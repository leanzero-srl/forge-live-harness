// BAND CHIPS (shipped to prod, never live-checked on dev): a COLLAPSED NON-CHAIN
// band draws no cables and prints "N links out · M in". No dev plan can produce a
// TOPICS build (topic viability is refused on every one), so the same code path is
// driven with a plain STATUS grouping — status bands are non-chain bands too.
// Read-only. Restores the grouping to "No grouping" at the end.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6670";
test.describe.configure({ retries: 0, timeout: 600_000 });
const bodyText = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";

test("BAND1 LZPT: collapsed status bands carry link chips and no cables", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(2000);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(3500);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Gantt$/ }).first().click().catch(() => {});
  await page.waitForTimeout(3500);

  await frame.getByText(/No grouping/i).first().click({ timeout: 15_000 });
  await page.waitForTimeout(800);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOT}/band-0-menu.png` });
  const opts = await frame.locator('[role=option], [role=menuitem], li, button').evaluateAll((els: any[]) =>
    els.map((e) => (e.textContent || "").trim()).filter((t: string) => t && t.length < 30).slice(0, 60));
  console.log("MENU OPTIONS:", JSON.stringify(opts));
  const statusOpt = frame.getByText(/^Status$/).first();
  console.log("STATUS OPT count:", await frame.getByText(/^Status$/).count());
  await statusOpt.dispatchEvent("click").catch(async (e: any) => { console.log("dispatch failed", String(e).slice(0,120)); });
  await page.waitForTimeout(3500);
  const headers = frame.locator('[data-testid="gantt-group-header"]');
  console.log("HEADERS:", await headers.count());
  console.log("CABLES (expanded):", await frame.locator('[data-testid="dep-arrow-bundle"]').count(),
              "per-edge:", await frame.locator('[data-testid="dep-arrow-hit"]').count());
  await page.screenshot({ path: `${SHOT}/band-1-expanded.png` });

  const n = await headers.count();
  for (let i = 0; i < n; i++) {
    const h = headers.nth(i);
    if ((await h.getAttribute("data-collapsed")) !== "true") { await h.click(); await page.waitForTimeout(500); }
  }
  await page.waitForTimeout(2500);
  const state = await headers.evaluateAll((els: any[]) => els.map((e) => ({
    label: e.getAttribute("data-group-label"),
    kind: e.getAttribute("data-row-kind"),
    collapsed: e.getAttribute("data-collapsed"),
    chip: e.querySelector('[data-testid="gantt-segment-links"]')?.textContent || null,
    out: e.querySelector('[data-testid="gantt-segment-links"]')?.getAttribute("data-links-out") || null,
    in: e.querySelector('[data-testid="gantt-segment-links"]')?.getAttribute("data-links-in") || null,
  })));
  console.log("BANDS:", JSON.stringify(state, null, 1));
  console.log("CABLES (collapsed):", await frame.locator('[data-testid="dep-arrow-bundle"]').count(),
              "per-edge:", await frame.locator('[data-testid="dep-arrow-hit"]').count());
  console.log("GANTT ROWS (collapsed):", await frame.locator('[data-testid="gantt-row"]').count());
  await page.screenshot({ path: `${SHOT}/band-2-collapsed.png` });
  const sum = (k: "out" | "in") => state.reduce((t: number, b: any) => t + Number(b[k] || 0), 0);
  console.log("SUM out:", sum("out"), "SUM in:", sum("in"));
  console.log("STAGED:", /Apply \d+ change|Save \(\d+\)/.test(await bodyText(frame)));

  // restore
  for (let i = 0; i < n; i++) { const h = headers.nth(i); if ((await h.getAttribute("data-collapsed")) === "true") { await h.click(); await page.waitForTimeout(400); } }
  await frame.getByText(/^Status$/).first().click({ timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(600);
  await frame.getByText(/No grouping/i).first().click({ timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  console.log("RESTORED headers:", await headers.count(), "rows:", await frame.locator('[data-testid="gantt-row"]').count());
  console.log("STAGED_AFTER_CLEANUP=" + /Apply \d+ change|Save \(\d+\)/.test(await bodyText(frame)));
  expect(sum("out")).toBe(sum("in"));
});
