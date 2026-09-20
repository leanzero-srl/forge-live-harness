// ROUND-3 lane A on the 16-chain bed: beat cards (right selector), item 2 (report
// per-beat lines), item 4 (explain modal fallback + 700px facts strip), item 6b
// (capacity percentile footnote).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6730";
const bed = JSON.parse(fs.readFileSync(`${OUT}/bed.json`, "utf8"));
test.describe.configure({ retries: 0, timeout: 2_400_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";
const body = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";

async function surface(page: any, w = 1600, h = 1200) {
  await page.setViewportSize({ width: w, height: h });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  if (s.kind !== "custom") throw new Error("no custom frame");
  await page.waitForTimeout(4000);
  return s.frame;
}
async function openPlan(frame: any, page: any, name = bed.planName) {
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: name }).first().click();
  await page.waitForTimeout(7000);
  if (!/Gantt/i.test(await body(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
}

test("A1 every beat card, driven through the beat BAR", async ({ page }) => {
  const frame = await surface(page);
  await openPlan(frame, page);
  await frame.locator('[data-testid="view-tab-storyline"]').first().click();
  await frame.locator('[data-testid="storyline-view"]').waitFor({ state: "visible", timeout: 300_000 });
  await page.waitForTimeout(5000);
  const bars = await frame.locator('[data-testid="storyline-beat"]').all();
  console.log("BEAT BARS:", bars.length);
  const out: string[] = [];
  for (let i = 0; i < bars.length; i++) {
    await bars[i].click();
    await page.waitForTimeout(1500);
    const c = frame.locator('[data-testid="beat-card"]').first();
    await c.waitFor({ state: "visible", timeout: 20_000 });
    const v = c.locator('[data-testid="beat-verdict"]');
    const rung = await v.getAttribute("data-rung").catch(() => null);
    const line = await txt(v);
    const keys = await c.locator('[data-testid="beat-member"], [data-testid="beat-key"]').allInnerTexts().catch(() => []);
    console.log(`--- BEAT ${i} rung=${rung}\n  verdict: ${line.replace(/\n/g, " ")}\n  card: ${(await txt(c)).replace(/\n/g, " | ")}`);
    out.push(`BEAT ${i} rung=${rung}\nverdict=${line}\nmembers=${JSON.stringify(keys)}\n${await txt(c)}`);
    await page.screenshot({ path: `${OUT}/A1-beat-${i}.png` });
    await bars[i].click(); await page.waitForTimeout(500);
  }
  fs.writeFileSync(`${OUT}/A1-beatcards.txt`, out.join("\n\n---\n\n"));
  expect(bars.length).toBeGreaterThan(1);
});

test("A2 explain modal: sections, fallbacks, and the 700px facts strip", async ({ page }) => {
  const frame = await surface(page);
  await openPlan(frame, page);
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  await frame.getByRole("button", { name: /Explain this plan/i }).first().click({ timeout: 30_000 });
  for (let i = 0; i < 80; i++) {
    if (await frame.locator('[data-testid="explain-facts-strip"]').count()) break;
    await page.waitForTimeout(2500);
  }
  await page.waitForTimeout(3000);
  const modal = frame.locator('[data-testid="plan-explain-modal"]');
  const modalBox = await modal.boundingBox().catch(() => null);
  console.log("MODAL BOX:", JSON.stringify(modalBox));
  // every section, and whether it is the fallback
  for (const id of ["explain-decides", "explain-would-move", "explain-next-moves"]) {
    const l = frame.locator(`[data-testid="${id}"]`);
    const n = await l.count();
    const empty = n ? await l.first().getAttribute("data-empty") : null;
    const t = n ? await txt(l.first()) : "(absent)";
    console.log(`${id}: count=${n} data-empty=${empty}\n   "${t.replace(/\n/g, " | ")}"`);
  }
  const headings = await frame.locator('[data-testid="explain-section"]').evaluateAll((els: any[]) =>
    els.map((e) => ({ title: e.firstElementChild?.textContent, bodyLen: (e.children[1]?.textContent || "").trim().length })));
  console.log("SECTIONS:", JSON.stringify(headings));
  // the strip: every cell visible, nothing clipped
  const strip = frame.locator('[data-testid="explain-facts-strip"]');
  const cells = await strip.evaluate((el: any) => {
    const sb = el.getBoundingClientRect();
    return Array.from(el.children).map((c: any) => {
      const v = c.querySelector("[data-fact]"), lab = c.firstElementChild;
      const r = c.getBoundingClientRect();
      return {
        fact: v?.getAttribute("data-fact"), label: lab?.textContent, value: v?.textContent,
        cellW: Math.round(r.width), cellH: Math.round(r.height),
        valClipped: v ? v.scrollWidth > v.clientWidth + 1 : null,
        labClipped: lab ? lab.scrollWidth > lab.clientWidth + 1 : null,
        insideStrip: r.left >= sb.left - 1 && r.right <= sb.right + 1 && r.bottom <= sb.bottom + 1,
        valRight: v ? Math.round(v.getBoundingClientRect().right) : null, stripRight: Math.round(sb.right),
      };
    });
  });
  console.log("STRIP CELLS:", JSON.stringify(cells, null, 1));
  fs.writeFileSync(`${OUT}/A2-strip.json`, JSON.stringify({ modalBox, headings, cells }, null, 1));
  fs.writeFileSync(`${OUT}/A2-explain.txt`, await txt(modal));
  await page.screenshot({ path: `${OUT}/A2-explain-700.png` });
  await modal.screenshot({ path: `${OUT}/A2-explain-modal.png` }).catch(() => {});
  expect(cells.length).toBeGreaterThan(3);
  for (const c of cells) { expect(c.valClipped, `clipped ${c.fact}=${c.value}`).toBe(false); expect(c.insideStrip, `outside ${c.fact}`).toBe(true); }
});

test("A3 capacity tab: the percentile footnote names only the percentile tiles", async ({ page }) => {
  const frame = await surface(page, 1600, 1300);
  await openPlan(frame, page);
  await frame.locator('[data-testid="view-tab-capacity"]').first().click();
  await frame.locator('[data-testid="plan-capacity"]').waitFor({ state: "visible", timeout: 240_000 });
  await page.waitForTimeout(7000);
  const cap = frame.locator('[data-testid="plan-capacity"]');
  const t = await txt(cap);
  fs.writeFileSync(`${OUT}/A3-capacity.txt`, t);
  console.log("=== CAPACITY ===\n" + t);
  const tiles = await cap.evaluate((el: any) => Array.from(el.querySelectorAll('[data-testid^="capacity-measure-"]')).map((e: any) => ({ id: e.getAttribute("data-testid"), text: e.textContent })));
  console.log("TILES:", JSON.stringify(tiles, null, 1));
  const note = frame.locator('[data-testid="capacity-percentile-note"]');
  const noteText = await note.count() ? await txt(note) : "(absent)";
  console.log("PERCENTILE NOTE:", noteText);
  fs.writeFileSync(`${OUT}/A3-note.json`, JSON.stringify({ tiles, noteText }, null, 1));
  await page.screenshot({ path: `${OUT}/A3-capacity.png`, fullPage: true });
});

test("A4 capture a storyline report and read every per-beat line", async ({ page }) => {
  const frame = await surface(page, 1600, 1300);
  await openPlan(frame, page);
  await frame.getByRole("button", { name: /^Planning$/i }).first().click();
  await page.waitForTimeout(6000);
  const sec = frame.locator('[data-testid="sponsor-reports"]');
  if (!(await sec.count())) { await frame.getByRole("button", { name: /Sponsor reports?/i }).first().click().catch(() => {}); await page.waitForTimeout(5000); }
  await sec.waitFor({ state: "visible", timeout: 60_000 });
  const name = `R3 storyline ${Date.now().toString(36)}`;
  await sec.getByLabel("Report name").fill(name);
  // the storyline template
  const sel = sec.locator('[class*="lz-select"], [data-testid*="select"]').first();
  console.log("TEMPLATE CONTROL:", await txt(sel));
  await sel.click().catch(() => {});
  await page.waitForTimeout(800);
  const opt = frame.getByRole("option", { name: /storyline|sponsor/i }).first();
  console.log("OPTIONS:", (await frame.getByRole("option").allInnerTexts().catch(() => [])).join(" / "));
  await opt.click().catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/A4-form.png`, fullPage: true });
  await sec.getByRole("button", { name: /^Capture/i }).first().click();
  for (let i = 0; i < 160; i++) {
    const b = await body(frame);
    if (/Immutable report captured|report captured/i.test(b)) break;
    await page.waitForTimeout(3000);
  }
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/A4-captured.png`, fullPage: true });
  const doc = frame.locator('[data-testid="storyline-report"]');
  if (!(await doc.count())) {
    const row = sec.locator("button.lz-history-item").first();
    await row.click().catch(() => {});
    await page.waitForTimeout(6000);
  }
  const dt = await doc.count() ? await txt(doc) : await txt(sec);
  fs.writeFileSync(`${OUT}/A4-report-doc.txt`, dt);
  console.log("=== REPORT DOC ===\n" + dt);
  const beats = await frame.locator('[data-testid="report-beat-row"], [data-testid="storyline-report-beat"]').allInnerTexts().catch(() => []);
  console.log("BEAT ROWS:", JSON.stringify(beats, null, 1));
  await page.screenshot({ path: `${OUT}/A4-report.png`, fullPage: true });
  fs.writeFileSync(`${OUT}/A4-reportname.txt`, name);
  expect(dt.length).toBeGreaterThan(100);
});
