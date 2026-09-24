import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";
const T = getTarget("lz-ppm-dashboard");
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/critic2";
const st = JSON.parse(fs.readFileSync(`${SHOT}/bed.json`, "utf8"));
test.describe.configure({ retries: 0, timeout: 1_800_000, mode: "serial" });
const bodyText = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";
const dump = (n: string, s: string) => fs.writeFileSync(`${SHOT}/${n}.txt`, s);
async function open(page: any) {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(4000);
  return frame;
}
async function openPlan(page: any, frame: any) {
  await frame.getByText(st.planName, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
}

test("X1 Plans cards with data", async ({ page }) => {
  const frame = await open(page);
  await page.screenshot({ path: `${SHOT}/shots/30-plans.png`, fullPage: true });
  const cards = await frame.locator('[data-testid="plan-card"]').all();
  const out: string[] = [];
  for (const c of cards) out.push((await c.innerText()).replace(/\n/g, " | "));
  dump("30-cards", out.join("\n"));
  console.log("CARDS (" + cards.length + "):\n" + out.join("\n"));
  console.log("HEADER:", (await bodyText(frame)).split("\n").slice(0, 14).join(" | "));
  console.log("no-portfolios hint:", await frame.locator('[data-testid="no-portfolios-hint"]').innerText().catch(() => "(none)"));
  const add = frame.locator('[data-testid="plan-portfolio-add"]').first();
  console.log("portfolio-add present:", await add.count(), await add.innerText().catch(() => ""));
  // AI proposal
  const prop = frame.locator('[data-testid="propose-portfolios-btn"]');
  if (await prop.count()) {
    await prop.click(); await page.waitForTimeout(12000);
    await page.screenshot({ path: `${SHOT}/shots/31-propose.png`, fullPage: true });
    dump("31-propose", await bodyText(frame));
    console.log("PROPOSE:\n" + (await bodyText(frame)).slice(0, 3500));
  }
  expect(cards.length).toBeGreaterThan(0);
});

test("X2 in-plan Capacity tab + Explain + glance", async ({ page }) => {
  const frame = await open(page);
  await openPlan(page, frame);
  await frame.locator('[data-testid="view-tab-capacity"]').first().click();
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${SHOT}/shots/40-capacity.png`, fullPage: true });
  dump("40-capacity", await bodyText(frame));
  console.log("IN-PLAN CAPACITY:\n" + (await bodyText(frame)).slice(0, 5000));
  // Explain
  await frame.getByRole("button", { name: /^Gantt$/ }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  const ex = frame.getByText(/Explain this plan/i).first();
  if (await ex.count()) {
    await ex.click();
    for (let i = 0; i < 45; i++) { const t = await bodyText(frame); if (/What to do next|temporarily unavailable/i.test(t)) break; await page.waitForTimeout(2000); }
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${SHOT}/shots/41-explain.png`, fullPage: true });
    dump("41-explain", await bodyText(frame));
    console.log("EXPLAIN:\n" + (await bodyText(frame)).slice(0, 5000));
  } else console.log("NO EXPLAIN");
  expect(1).toBe(1);
});

test("X3 the report as a sponsor reads it", async ({ page }) => {
  const frame = await open(page);
  await openPlan(page, frame);
  await frame.getByRole("button", { name: /^Planning$/ }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${SHOT}/shots/50-planning.png`, fullPage: true });
  dump("50-planning", await bodyText(frame));
  // open the captured report
  const r = frame.getByText(/Critic2 steering pack 2/).first();
  if (await r.count()) { await r.click(); await page.waitForTimeout(6000); }
  await page.screenshot({ path: `${SHOT}/shots/51-report.png`, fullPage: true });
  dump("51-report", await bodyText(frame));
  console.log("REPORT DOC:\n" + (await bodyText(frame)).slice(0, 6000));
  expect(1).toBe(1);
});

test("X4 glance on the hold-up ticket", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1100 });
  await assertLoggedIn(page);
  await page.goto("https://wolfaenpak.atlassian.net/browse/WFH-3248", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);
  const frames = page.frames();
  let target: any = null;
  for (const f of frames) {
    const t = await f.locator("body").innerText().catch(() => "");
    if (/plan|room|finish|storyline/i.test(t) && t.length > 40 && !/^\s*$/.test(t)) { console.log("FRAME", f.url().slice(0, 120), "->", t.slice(0, 400).replace(/\n/g, " | ")); if (/room|finish/i.test(t)) target = f; }
  }
  await page.screenshot({ path: `${SHOT}/shots/60-glance.png`, fullPage: true });
  if (target) { dump("60-glance", await target.locator("body").innerText()); console.log("GLANCE:\n" + (await target.locator("body").innerText())); }
  expect(1).toBe(1);
});
