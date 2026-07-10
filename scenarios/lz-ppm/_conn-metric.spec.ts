// Connector-quality metric on the LZPT Scenarios plan — "how graceful are the
// dependency lines?" Objective, deterministic (LZPT is seeded). Measures backward
// arrows, long spans, total path length, and horizontal bulge from the real SVG.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/848bc036-f0f1-4281-b0cf-12ff9cf45fd9/scratchpad";
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 200_000 });

test("connector quality metric (LZPT)", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  await page.waitForTimeout(2500);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt/i.test((await frame.locator("body").textContent().catch(() => "")) || "")) {
    await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  }
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  // Re-index so a fresh reseed (new keys) is picked up, then wait for it to settle.
  await frame.getByRole("button", { name: /Re-index/i }).first().click().catch(() => {});
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(3000);
    const body = (await frame.locator("body").textContent().catch(() => "")) || "";
    if (/Showing \d+ of \d+/i.test(body) && !/indexing|Fetching|Building/i.test(body)) break;
  }
  await page.waitForTimeout(3500);

  const rootHandle = await frame.locator(":root").elementHandle();
  const realFrame = await rootHandle!.ownerFrame();
  const metric = await realFrame!.evaluate(() => {
    const num = (s: string) => (s.match(/-?\d+(\.\d+)?/g) || []).map(Number);
    const groups = Array.from(document.querySelectorAll(".dep-arrow-group"));
    const conns: any[] = [];
    for (const g of groups) {
      const line = g.querySelector(".dep-arrow-line") as SVGPathElement | null;
      const hit = g.querySelector('[data-testid="dep-arrow-hit"]');
      if (!line) continue;
      const d = line.getAttribute("d") || "";
      // M x1 y1 C c1x c1y, c2x c2y, x2 y2
      const n = num(d);
      const [x1, y1, , , , , x2, y2] = n.length >= 8 ? n : [0, 0, 0, 0, 0, 0, 0, 0];
      let len = 0, bboxW = 0;
      try { len = line.getTotalLength(); } catch {}
      try { const b = line.getBBox(); bboxW = b.width; } catch {}
      const dxAbs = Math.abs(x2 - x1) || 1;
      conns.push({
        link: hit?.getAttribute("data-link") || "?",
        backward: y2 < y1 - 1,
        spanY: Math.abs(y2 - y1),
        len: Math.round(len),
        bulge: Math.round(bboxW - dxAbs), // horizontal overshoot beyond the endpoints' x-gap
      });
    }
    // Row height proxy from bar spacing.
    const bars = Array.from(document.querySelectorAll('[data-testid="gantt-bar"]')).map((b) => (b as HTMLElement).getBoundingClientRect().top).sort((a, b) => a - b);
    let rowH = 40; for (let i = 1; i < bars.length; i++) { const d = bars[i] - bars[i - 1]; if (d > 5) { rowH = d; break; } }
    const backward = conns.filter((c) => c.backward);
    const longC = conns.filter((c) => c.spanY > rowH * 4);
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
    return {
      total: conns.length,
      backwardCount: backward.length,
      backwardLinks: backward.map((c) => c.link),
      longCount: longC.length,
      totalLen: sum(conns.map((c) => c.len)),
      totalBulge: sum(conns.map((c) => Math.max(0, c.bulge))),
      worstLen: conns.slice().sort((a, b) => b.len - a.len).slice(0, 5).map((c) => `${c.link}:${c.len}`),
      worstBulge: conns.slice().sort((a, b) => b.bulge - a.bulge).slice(0, 5).map((c) => `${c.link}:${c.bulge}`),
    };
  });
  console.log("CONN_METRIC:", JSON.stringify(metric, null, 0));
  await page.screenshot({ path: `${SHOT}/conn-metric.png` });
});
