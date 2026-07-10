// LIVE connector VISUAL audit — read-only. Opens the REAL default plan (Mobile
// Launch) + LZPT and, for every dependency path, checks the geometry the owner
// flagged from screenshots: (1) wrong-side arrows (arrow entering the target from
// the RIGHT — c2x >= x2), (2) backward arrows, (3) steep near-vertical segments
// slicing the chart, (4) horizontal bulge. Emits worst offenders WITH link ids so
// the exact bug region (e.g. WFH-166) can be inspected, plus hi-DPI screenshots.
// NEVER Applies / writes anything.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/848bc036-f0f1-4281-b0cf-12ff9cf45fd9/scratchpad";
test.describe.configure({ retries: 0, timeout: 240_000 });

async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

async function openGantt(page: any, frame: any, plan: string | null) {
  if (plan) {
    await frame.getByText(plan, { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
    if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  } else {
    await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  }
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(3500);
}

async function measure(frame: any) {
  const rootHandle = await frame.locator(":root").elementHandle();
  const realFrame = await rootHandle!.ownerFrame();
  return realFrame!.evaluate(() => {
    const num = (s: string) => (s.match(/-?\d+(\.\d+)?/g) || []).map(Number);
    // sample a cubic to find the steepest |dy/dx| segment (a near-vertical slice)
    const cub = (t: number, a: number, b: number, c: number, d: number) => {
      const mt = 1 - t; return mt*mt*mt*a + 3*mt*mt*t*b + 3*mt*t*t*c + t*t*t*d;
    };
    const groups = Array.from(document.querySelectorAll(".dep-arrow-group"));
    const conns: any[] = [];
    for (const g of groups) {
      const line = g.querySelector(".dep-arrow-line") as SVGPathElement | null;
      const hit = g.querySelector('[data-testid="dep-arrow-hit"]');
      if (!line) continue;
      const n = num(line.getAttribute("d") || "");
      if (n.length < 8) continue;
      const [x1, y1, c1x, c1y, c2x, c2y, x2, y2] = n;
      // steepest slope across 20 samples (dy per px of dx); Infinity-guarded
      let steep = 0;
      let px = x1, py = y1;
      for (let s = 1; s <= 20; s++) {
        const t = s / 20;
        const qx = cub(t, x1, c1x, c2x, x2), qy = cub(t, y1, c1y, c2y, y2);
        const ddx = Math.abs(qx - px), ddy = Math.abs(qy - py);
        if (ddy > 2) steep = Math.max(steep, ddy / Math.max(ddx, 0.25));
        px = qx; py = qy;
      }
      let len = 0, bboxW = 0;
      try { len = line.getTotalLength(); } catch {}
      try { bboxW = line.getBBox().width; } catch {}
      conns.push({
        link: hit?.getAttribute("data-link") || "?",
        wrongSide: c2x >= x2 - 0.5,      // arrow enters target from the RIGHT (the bug)
        backward: y2 < y1 - 1,
        spanY: Math.round(Math.abs(y2 - y1)),
        steep: Math.round(steep * 10) / 10,
        len: Math.round(len),
        bulge: Math.round(bboxW - (Math.abs(x2 - x1) || 1)),
      });
    }
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
    return {
      total: conns.length,
      wrongSideCount: conns.filter((c) => c.wrongSide).length,
      wrongSideLinks: conns.filter((c) => c.wrongSide).map((c) => c.link).slice(0, 10),
      backwardCount: conns.filter((c) => c.backward).length,
      backwardLinks: conns.filter((c) => c.backward).map((c) => c.link).slice(0, 10),
      steepCount: conns.filter((c) => c.steep > 6).length,          // >6:1 slope ~ near-vertical
      worstSteep: conns.slice().sort((a, b) => b.steep - a.steep).slice(0, 6).map((c) => `${c.link}:${c.steep}`),
      totalLen: sum(conns.map((c) => c.len)),
      totalBulge: sum(conns.map((c) => Math.max(0, c.bulge))),
      worstBulge: conns.slice().sort((a, b) => b.bulge - a.bulge).slice(0, 6).map((c) => `${c.link}:${c.bulge}`),
    };
  });
}

for (const scn of [{ name: "mobile", plan: null as string | null }, { name: "lzpt", plan: "LZPT Scenarios" }]) {
  test(`connector visual audit — ${scn.name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1680, height: 1050 });
    await assertLoggedIn(page);
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
    const s = await enterForgeSurface(page, { surface: "custom" });
    const frame = s.kind === "custom" ? s.frame : null;
    if (!frame) throw new Error("no frame");
    await page.waitForTimeout(2000);
    await openGantt(page, frame, scn.plan);

    for (const zoom of ["Week", "Day"]) {
      await frame.getByRole("button", { name: new RegExp(`^${zoom}$`, "i") }).first().click().catch(() => {});
      await page.waitForTimeout(2500);
      const m = await measure(frame);
      console.log(`AUDIT ${scn.name} ${zoom}:`, JSON.stringify(m));
      await page.screenshot({ path: `${SHOT}/audit-${scn.name}-${zoom.toLowerCase()}.png`, fullPage: false });
    }
    // restore default zoom
    await frame.getByRole("button", { name: /^Week$/i }).first().click().catch(() => {});
  });
}
