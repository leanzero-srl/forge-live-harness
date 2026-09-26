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
  await page.waitForTimeout(3000);
  return frame;
}
async function openPlan(page: any, frame: any, name: string) {
  await frame.getByText(name, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
}

test("Y1 Dashboards: bed plan and LZPT, word for word", async ({ page }) => {
  const frame = await open(page);
  await openPlan(page, frame, st.planName);
  await frame.getByRole("button", { name: /^Dashboard$/ }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${SHOT}/shots/70-dash-bed.png`, fullPage: true });
  dump("70-dash-bed", await bodyText(frame));
  console.log("BED DASH:\n" + (await bodyText(frame)).slice(0, 3500));
  await frame.getByRole("button", { name: /Plans/ }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await openPlan(page, frame, "LZPT Scenarios");
  await frame.getByRole("button", { name: /^Dashboard$/ }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${SHOT}/shots/71-dash-lzpt.png`, fullPage: true });
  dump("71-dash-lzpt", await bodyText(frame));
  console.log("LZPT DASH:\n" + (await bodyText(frame)).slice(0, 3500));
  expect(1).toBe(1);
});

test("Y2 Planning -> Sponsor reports -> the storyline document", async ({ page }) => {
  const frame = await open(page);
  await openPlan(page, frame, st.planName);
  await frame.getByRole("button", { name: /^Planning$/ }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  await frame.getByText(/Sponsor reports/i).first().click().catch(() => {});
  await page.waitForTimeout(7000);
  await page.screenshot({ path: `${SHOT}/shots/72-reports-list.png`, fullPage: true });
  dump("72-reports-list", await bodyText(frame));
  const r = frame.getByText(/Critic2 steering pack 2/).first();
  if (await r.count()) { await r.click(); await page.waitForTimeout(8000); }
  await page.screenshot({ path: `${SHOT}/shots/73-report-doc.png`, fullPage: true });
  dump("73-report-doc", await bodyText(frame));
  console.log("REPORT DOC:\n" + (await bodyText(frame)).slice(0, 7000));
  expect(1).toBe(1);
});

test("Y3 Explain on the bed plan", async ({ page }) => {
  const frame = await open(page);
  await openPlan(page, frame, st.planName);
  await frame.getByText(/Explain this plan/).first().click();
  for (let i = 0; i < 70; i++) { const t = await bodyText(frame); if (/What to do next|temporarily unavailable|Close/i.test(t) && !/Asking for the explanation…/.test(t)) break; await page.waitForTimeout(2000); }
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SHOT}/shots/74-explain.png`, fullPage: true });
  dump("74-explain", await bodyText(frame));
  console.log("EXPLAIN:\n" + (await bodyText(frame)).slice(0, 6000));
  expect(1).toBe(1);
});

test("Y4 portfolio round trip", async ({ page }) => {
  const frame = await open(page);
  const btn = frame.locator('[data-testid="new-portfolio-btn"]');
  console.log("new-portfolio btn:", await btn.count());
  if (await btn.count()) {
    await btn.click(); await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SHOT}/shots/80-newpf.png`, fullPage: true });
    dump("80-newpf", await bodyText(frame));
    const inp = frame.locator('input[type=text]').last();
    await inp.fill("Critic2 Programme").catch(() => {});
    await page.waitForTimeout(500);
    await frame.getByRole("button", { name: /^Create/i }).first().click().catch(() => {});
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${SHOT}/shots/81-pf-created.png`, fullPage: true });
    dump("81-pf-created", await bodyText(frame));
  }
  const add = frame.locator('[data-testid="plan-card"]').filter({ hasText: st.planName }).locator('[data-testid="plan-portfolio-add"]').first();
  if (await add.count()) { await add.click(); await page.waitForTimeout(2500); await page.screenshot({ path: `${SHOT}/shots/82-pf-assign.png`, fullPage: true }); dump("82-pf-assign", await bodyText(frame)); }
  const opt = frame.getByText("Critic2 Programme").last();
  if (await opt.count()) { await opt.click(); await page.waitForTimeout(5000); }
  await page.screenshot({ path: `${SHOT}/shots/83-pf-after.png`, fullPage: true });
  dump("83-pf-after", await bodyText(frame));
  const cards = await frame.locator('[data-testid="plan-card"]').all();
  for (const c of cards) { const t = await c.innerText(); if (t.includes(st.planName)) console.log("BED CARD AFTER:", t.replace(/\n/g, " | ")); }
  console.log("SECTIONS:", await frame.locator('[data-testid="plan-section-title"]').allInnerTexts().catch(() => []));
  console.log("ROLLUPS:", await frame.locator('[data-testid="plan-section-rollup"]').allInnerTexts().catch(() => []));
  console.log("PAGE:\n" + (await bodyText(frame)).slice(0, 2500));
  expect(1).toBe(1);
});
