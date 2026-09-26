// LZ700 item 1 — derived-graph edits on the DERIVED_CHAIN bed.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";
const bed = JSON.parse(fs.readFileSync("/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz700/bed.json", "utf8"));
const T = getTarget("lz-ppm-dashboard");
const OUT = process.env.SHOT_DIR || "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz700/shots";
fs.mkdirSync(OUT, { recursive: true });
test.describe.configure({ retries: 0, timeout: 2_400_000, mode: "serial" });

test("derived-graph edits", async ({ page }) => {
  const R: any = { bed, steps: [] };
  await page.setViewportSize({ width: 1700, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.frame;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 180_000 });
  await page.waitForTimeout(3000);
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: bed.tag }).first().click();
  await page.waitForTimeout(16000);

  const body = async () => (await frame.locator("body").textContent().catch(() => "")) || "";
  const staged = async () => /Apply \d+ change|Save \(\d+\)/.test(await body());
  const stagedN = async () => { const t = await body(); const m = t.match(/Apply (\d+) change|Save \((\d+)\)/); return m ? Number(m[1] || m[2]) : 0; };
  const bars = async () => frame.locator('[data-testid="gantt-bar"]').evaluateAll((els: any[]) =>
    els.map((e) => ({ key: e.getAttribute("data-key"), start: e.getAttribute("data-bar-start"), due: e.getAttribute("data-bar-due"), derived: e.getAttribute("data-derived"), parent: e.getAttribute("data-parent") })));
  const chips = async () => frame.locator('[data-testid="gantt-derived-chip"]').evaluateAll((els: any[]) => els.map((e) => e.getAttribute("data-key")));
  const toGantt = async () => { await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {}); await page.waitForTimeout(7000); };

  await toGantt();
  R.steps.push({ step: "0-gantt-open-no-holiday", bars: await bars(), chips: await chips(), staged: await staged() });
  await page.screenshot({ path: `${OUT}/a00-open.png` });
  console.log("STEP0", JSON.stringify(R.steps.at(-1)));

  // ---- 1c: ADD the 2026-10-07 holiday while the plan is OPEN
  await frame.getByRole("button", { name: /^Schedule$/i }).first().click();
  await page.waitForTimeout(5000);
  await frame.getByRole("button", { name: /^Bank Holidays/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/a01-holiday-panel.png` });
  const pickDate = async (iso: string) => {
    await frame.getByRole("button", { name: /^Choose date$/ }).first().dispatchEvent("click");
    await page.waitForTimeout(1200);
    for (let i = 0; i < 18; i++) {
      const day = frame.getByRole("button", { name: iso, exact: true }).first();
      if (await day.count()) { await day.dispatchEvent("click"); await page.waitForTimeout(800); return true; }
      await frame.getByRole("button", { name: "Next month" }).first().dispatchEvent("click");
      await page.waitForTimeout(600);
    }
    return false;
  };
  const picked = await pickDate("2026-10-07");
  console.log("PICKED", picked);
  const nameInput = frame.locator('input[placeholder*="Holiday name"]').first();
  await nameInput.fill("LZ700 probe day").catch(() => {});
  await page.waitForTimeout(500);
  await frame.getByRole("button", { name: /^Add$/i }).first().click();
  await page.waitForTimeout(1200);
  let addToast = "(none)";
  for (let i = 0; i < 30; i++) { const t = await body(); const m = t.match(/Holiday added|Saved|Holiday removed|failed|error/i); if (m) { addToast = m[0]; break; } await page.waitForTimeout(250); }
  await page.screenshot({ path: `${OUT}/a02-holiday-added.png` });
  await page.waitForTimeout(5000);
  const afterAdd = { step: "1c-add-holiday", toast: addToast, staged: await staged(), stagedN: await stagedN(), panel: (await body()).replace(/\s+/g, " ").slice(0, 600) };
  R.steps.push(afterAdd); console.log("ADD", JSON.stringify(afterAdd));

  await toGantt();
  const afterAddGantt = { step: "1c-gantt-after-add", bars: await bars(), chips: await chips(), staged: await staged(), stagedN: await stagedN() };
  R.steps.push(afterAddGantt); console.log("AFTERADD", JSON.stringify(afterAddGantt));
  await page.screenshot({ path: `${OUT}/a03-gantt-derived.png` });

  // ---- 1a/1b: refused drags
  const bar = (k: string) => frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first();
  const dragBy = async (key: string, dx: number, tag: string) => {
    await bar(key).scrollIntoViewIfNeeded();
    const box = await bar(key).boundingBox();
    if (!box) throw new Error(`no box for ${key}`);
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (const f of [0.25, 0.5, 0.75, 1]) await page.mouse.move(cx + dx * f, cy, { steps: 6 });
    await page.mouse.up();
    let toast = "(none)";
    for (let i = 0; i < 30; i++) {
      const t = await body();
      const m = t.match(/[A-Z]+-\d+ must start [^.]+\.\s*Cannot move (?:before|after)\./);
      if (m) { toast = m[0]; break; }
      await page.waitForTimeout(200);
    }
    await page.screenshot({ path: `${OUT}/a-${tag}.png` });
    const got = { step: tag, key, dx, toast, staged: await staged(), stagedN: await stagedN(), bars: await bars(), chips: await chips() };
    R.steps.push(got); console.log("DRAG", JSON.stringify(got));
    await page.waitForTimeout(6000);
    return got;
  };
  await dragBy(bed.b, -90, "1a-drag-B-earlier");
  await dragBy(bed.c, -90, "1b-drag-C-earlier");

  fs.writeFileSync(`${OUT}/a-results.json`, JSON.stringify(R, null, 2));
  expect(1).toBe(1);
});
