import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-wave";
const WANT = process.env.WANT_STRATEGY || "recommended";
test.describe.configure({ retries: 0, timeout: 600_000 });
test("harvest the structure on a chosen strategy", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = (s as any).frame;
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  await page.waitForTimeout(2000);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(3500);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="gantt-group-select"]').first().click({ timeout: 15_000 });
  await page.waitForTimeout(700);
  await frame.getByText(/AI structure/i).first().click({ timeout: 15_000 });
  await page.waitForTimeout(5000);
  await frame.locator('[data-testid="ai-strategy-trigger"]').first().click({ timeout: 15_000 });
  await page.waitForTimeout(700);
  await realFrame!.evaluate((v) => {
    const el = Array.from(document.querySelectorAll('[data-testid="ai-strategy-option"]')).find((o) => o.getAttribute("data-value") === v) as HTMLElement;
    el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }, WANT);
  await page.waitForTimeout(3000);
  await expect.poll(async () => realFrame!.evaluate(() => document.querySelector('[data-testid="ai-structure-status"]')?.getAttribute("data-state") || "none"),
    { timeout: 420_000, intervals: [3000] }).not.toBe("building");
  await page.waitForTimeout(5000);
  if (await frame.locator('[data-testid="gantt-depth-issues"]').count()) { await frame.locator('[data-testid="gantt-depth-issues"]').first().click(); await page.waitForTimeout(2500); }
  const h = await realFrame!.evaluate(() => {
    const segs: any[] = []; let cur: any = null;
    for (const el of Array.from(document.querySelectorAll('[data-testid="gantt-group-header"],[data-testid="gantt-row"]'))) {
      if (el.getAttribute("data-testid") === "gantt-group-header") {
        cur = { label: (el.querySelector('[data-testid="gantt-group-header-label"]')?.textContent || "").trim(),
          span: (el.querySelector('[data-testid="gantt-group-span"]')?.textContent || "").trim(),
          spanPresent: !!el.querySelector('[data-testid="gantt-group-span"]'),
          headerText: (el as HTMLElement).innerText.replace(/\n+/g, " | ").trim(),
          det: el.querySelector('[data-testid="gantt-segment-menu-button"]')?.getAttribute("data-segment") || null, keys: [] as string[] };
        segs.push(cur);
      } else if (cur) cur.keys.push(el.getAttribute("data-row-key"));
    }
    const st = document.querySelector('[data-testid="ai-structure-status"]');
    return { segs, state: st?.getAttribute("data-state"), statusText: (st?.textContent||"").trim(),
      strategy: document.querySelector('[data-testid="ai-strategy-trigger"]')?.getAttribute("data-strategy"),
      note: (document.querySelector('[data-testid="gantt-strategy-note"]')?.textContent || "").trim() || null,
      strips: document.querySelectorAll('[data-testid="gantt-segment-strip"]').length,
      spanNodes: document.querySelectorAll('[data-testid="gantt-group-span"]').length };
  });
  console.log("STRATEGY=" + h.strategy + " state=" + h.state + " note=" + JSON.stringify(h.note) + " status=" + JSON.stringify(h.statusText) + " spanNodes=" + h.spanNodes + " strips=" + h.strips);
  const total = h.segs.reduce((n: number, x: any) => n + x.keys.length, 0);
  for (const x of h.segs) console.log(`SEG ${JSON.stringify(x.label)} det=${x.det} n=${x.keys.length} spanPresent=${x.spanPresent} span=${JSON.stringify(x.span)} header=${JSON.stringify(x.headerText)} keys=${JSON.stringify(x.keys)}`);
  const other = h.segs.find((x: any) => /other work/i.test(x.label));
  console.log(`TOTAL=${total} SEGS=${h.segs.length} OTHER=${other ? other.keys.length : 0} SHARE=${other ? (100*other.keys.length/total).toFixed(1) : 0}%`);
  await page.screenshot({ path: `${SHOT}/90-structure-${WANT}.png` });
});
