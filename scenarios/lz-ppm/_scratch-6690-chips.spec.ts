// SCRATCH 6.69.0 — item 4 chip probe. Adds ONE cross-chain dependency so the AI
// structure has edges CROSSING a segment boundary, rebuilds, then reads the
// "N links out · M in" chips at Segments depth. Same seeded WFH plan.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { linkBlocks } from "../../data/jira-build.mjs";
import { getTestState } from "../../testhook/client";
import * as fs from "fs";
const T = getTarget("lz-ppm-dashboard");
const SHOT = "/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6690";
const STATE = `${SHOT}/naming-state.json`;
test.describe.configure({ retries: 0, timeout: 900_000, mode: "serial" });
const bodyText = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";

test("CHIPS: cross-chain link, rebuild, read the link chips at Segments depth", async ({ page }) => {
  const st = JSON.parse(fs.readFileSync(STATE, "utf8"));
  // A[7] -> C[0]: a fan-out in the middle of the 16 chain into the 4 chain.
  await linkBlocks(st.A[7], st.C[0]).catch((e: any) => console.log("link err", String(e).slice(0, 200)));
  console.log("LINKED", st.A[7], "->", st.C[0]);
  await new Promise((r) => setTimeout(r, 8000));
  const rf: any = await getTestState("lz-ppm", { what: "refreshPlan", planId: st.planId });
  console.log("REFRESH:", JSON.stringify(rf));
  const built: any = await getTestState("lz-ppm", { what: "aiGroup", planId: st.planId, strategy: "chains" });
  console.log("REBUILD:", JSON.stringify({ strategy: built.strategy?.chosen, refused: built.refused, segments: built.segments, repaired: built.repaired }, null, 1));

  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  await page.waitForTimeout(2000);
  await frame.getByText(st.planName, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  // grouping/depth persisted from the previous run; force them anyway
  const cur = await realFrame!.evaluate(() => (document.querySelector('[data-testid="gantt-group-select"]') as HTMLElement | null)?.innerText || null);
  console.log("GROUP ON ENTRY:", cur);
  if (!/AI structure/i.test(cur || "")) {
    await frame.getByText(/No grouping/i).first().click({ timeout: 15_000 });
    await page.waitForTimeout(800);
    await frame.getByText(/AI structure/i).first().click({ timeout: 15_000 });
    await page.waitForTimeout(7000);
  }
  await realFrame!.evaluate(() => (document.querySelector('[data-testid="gantt-depth-segments"]') as HTMLElement | null)?.click());
  await page.waitForTimeout(3000);
  const probe = await realFrame!.evaluate(() => ({
    depth: document.querySelector('[data-testid="gantt-depth-control"]')?.getAttribute("data-depth"),
    cables: document.querySelectorAll('[data-testid="dep-arrow-bundle"]').length,
    headers: [...document.querySelectorAll('[data-testid="gantt-group-header"]')].map((el) => {
      const c = el.querySelector('[data-testid="gantt-segment-links"]');
      const tipHost = c?.closest("[title]") as HTMLElement | null;
      return {
        label: el.getAttribute("data-group-label"), count: Number(el.getAttribute("data-group-count")),
        chip: c ? { out: c.getAttribute("data-links-out"), in: c.getAttribute("data-links-in"), text: (c as HTMLElement).innerText } : null,
        tip: tipHost?.getAttribute("title") || null,
      };
    }),
  }));
  console.log("SEGMENTS_PROBE:", JSON.stringify(probe, null, 1));
  await page.screenshot({ path: `${SHOT}/i4-3-chips.png` });
  // hover the first chip for its tooltip
  const chip = frame.locator('[data-testid="gantt-segment-links"]').first();
  if (await chip.count()) {
    const box = await chip.boundingBox();
    if (box) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(1200); }
    console.log("CHIP_TOOLTIP:", JSON.stringify((await bodyText(frame)).match(/Dependencies crossing this band[^\n]{0,200}/)?.[0] || null));
    await page.screenshot({ path: `${SHOT}/i4-4-chip-tooltip.png` });
  }
  console.log("STAGED:", /Apply \d+ change|Save \(\d+\)/.test(await bodyText(frame)));
  expect(true).toBeTruthy();
});
