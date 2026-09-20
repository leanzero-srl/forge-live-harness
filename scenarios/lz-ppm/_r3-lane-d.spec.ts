// ROUND-3 lane D: capture a STORYLINE report on each bed and read the document —
// item 1 (storylines[].line + risks say "no single ticket is tighter than the rest",
// and a beat with a strictly tighter ticket names it) and item 2 (per-beat lines are
// measured over the beat's OWN tickets, each n <= the beat's n).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6730";
const beds = [
  { bedName: "bed2", ...JSON.parse(fs.readFileSync(`${OUT}/bed2.json`, "utf8")) },
  { bedName: "bed1", ...JSON.parse(fs.readFileSync(`${OUT}/bed.json`, "utf8")) },
];
test.describe.configure({ retries: 0, timeout: 2_400_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";
const body = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";
const captured: { planId: string; name: string }[] = [];

for (const bed of beds) {
  test(`D-${bed.bedName} storyline report document`, async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1300 });
    await assertLoggedIn(page);
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
    const s = await enterForgeSurface(page, { surface: "custom" });
    if (s.kind !== "custom") throw new Error("no frame");
    const frame = s.frame;
    await page.waitForTimeout(4000);
    await frame.locator('[data-testid="plan-card"]').filter({ hasText: bed.planName }).first().click();
    await page.waitForTimeout(7000);
    if (!/Gantt/i.test(await body(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
    await page.waitForTimeout(5000);
    await frame.getByRole("button", { name: /^Planning$/i }).first().click();
    await page.waitForTimeout(6000);
    const sec = frame.locator('[data-testid="sponsor-reports"]');
    if (!(await sec.count())) {
      console.log("PLANNING BODY:", (await body(frame)).slice(0, 1500));
      await frame.getByRole("button", { name: /Sponsor reports?/i }).first().click().catch(() => {});
      await page.waitForTimeout(6000);
    }
    if (!(await sec.count())) { console.log("STILL NO SECTION:", (await body(frame)).slice(0, 2500)); await page.screenshot({ path: `${OUT}/D-${bed.bedName}-noplanning.png`, fullPage: true }); }
    await sec.waitFor({ state: "visible", timeout: 60_000 });
    const name = `R3 sl ${bed.bedName} ${Date.now().toString(36)}`;
    await sec.getByLabel("Report name").fill(name);
    const combo = sec.getByRole("combobox").first();
    console.log("TEMPLATE TRIGGER:", await txt(combo));
    await combo.click();
    await page.waitForTimeout(700);
    const opts = await frame.getByRole("option").allInnerTexts();
    console.log("OPTIONS:", JSON.stringify(opts));
    await frame.getByRole("option", { name: /Storyline report/i }).first().click();
    await page.waitForTimeout(800);
    console.log("TEMPLATE NOW:", await txt(sec.getByRole("combobox").first()));
    await page.screenshot({ path: `${OUT}/D-${bed.bedName}-form.png`, fullPage: true });
    await sec.getByRole("button", { name: /^Capture/i }).first().click();
    for (let i = 0; i < 200; i++) {
      if (/report captured/i.test(await body(frame))) break;
      await page.waitForTimeout(3000);
    }
    captured.push({ planId: bed.planId, name });
    await page.waitForTimeout(5000);
    const doc = frame.locator('[data-testid="storyline-report"]');
    if (!(await doc.count())) {
      await frame.getByRole("button", { name: /Open captured report/i }).first().click().catch(() => {});
      await page.waitForTimeout(7000);
    }
    if (!(await doc.count())) { await sec.locator("button.lz-history-item").first().click().catch(() => {}); await page.waitForTimeout(7000); }
    await doc.waitFor({ state: "visible", timeout: 90_000 });
    const dt = await txt(doc);
    fs.writeFileSync(`${OUT}/D-${bed.bedName}-doc.txt`, dt);
    console.log(`=== ${bed.bedName} REPORT DOC ===\n` + dt);
    const rows = await doc.evaluate((el: any) => {
      const grab = (sel: string) => Array.from(el.querySelectorAll(sel)).map((li: any) => ({
        name: li.querySelector('[data-testid="storyline-report-name"]')?.textContent,
        line: li.querySelector('[data-testid="storyline-report-line"]')?.textContent,
        facts: li.querySelector('.lz-slrep-facts')?.textContent,
      }));
      return {
        verdict: el.querySelector('[data-testid="storyline-report-verdict"]')?.textContent,
        verdictLine: el.querySelector('[data-testid="storyline-report-verdict-line"]')?.textContent,
        pressure: el.querySelector('[data-testid="storyline-report-pressure"]')?.textContent,
        finish: el.querySelector('[data-testid="storyline-report-finish"]')?.textContent,
        storylines: grab('[data-testid="storyline-report-storyline"]'),
        beats: grab('[data-testid="storyline-report-beat"]'),
        omitted: el.querySelector('[data-testid="storyline-report-beats-omitted"]')?.textContent || null,
      };
    });
    console.log(`${bed.bedName} ROWS:`, JSON.stringify(rows, null, 1));
    fs.writeFileSync(`${OUT}/D-${bed.bedName}-rows.json`, JSON.stringify(rows, null, 1));
    await page.screenshot({ path: `${OUT}/D-${bed.bedName}-report.png`, fullPage: true });
    // item 2: every beat line's count is <= that beat's own n, never the storyline's
    for (const b of rows.beats) {
      const n = Number(/·\s*(\d+)\s*tickets/.exec(b.facts || "")?.[1] || 0);
      const claimed = [...String(b.line || "").matchAll(/(\d+)\s*(?:of\s*(\d+)\s*)?tickets?/g)].map((m) => [Number(m[1]), m[2] ? Number(m[2]) : null]);
      console.log(`BEAT "${b.name}" n=${n} line="${b.line}" claims=${JSON.stringify(claimed)}`);
      for (const [c, of] of claimed) {
        expect(c, `beat "${b.name}" (n=${n}) claims ${c} tickets`).toBeLessThanOrEqual(n);
        if (of !== null) expect(of, `beat "${b.name}" (n=${n}) scope ${of}`).toBe(n);
      }
    }
    expect(rows.beats.length).toBeGreaterThan(0);
  });
}

test.afterAll(async () => {
  for (const c of captured) {
    const r: any = await getTestState("lz-ppm", { what: "plans" }).catch(() => null);
    console.log("captured report to clean:", c.planId, c.name, r ? "" : "");
  }
});
