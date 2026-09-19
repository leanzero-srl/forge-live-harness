// SCRATCH 6.70.0 — items 1 (surface half) and 2.
//  1  Dashboard PLAN HEALTH: the verdict WORD, the criteria tooltip, no score ring;
//     the word equals the plan card's verdict chip and the REST summary.verdict;
//     the COMPLETE tile == summary.pct.
//  2  Plans page cards v2 (verdict sentence, finish, room/"not measured",
//     "Not part of any portfolio — add it", project chips, mono note); the
//     By portfolio|By project|All choice is REMEMBERED; create a portfolio through
//     the app dialog, assign LZPT from the card menu, open the Portfolio page,
//     run "Propose portfolios" (real model call) and CANCEL confirming nothing,
//     then delete the portfolio and prove the card is stray again.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
const PLAN_ID = "plan-msq9dg8l-gz6mz1";
const PF_NAME = "Test portfolio";
const OUT = "/Users/mihaiperdum/Projects/forge-live-harness/scratchpad/live-6700";
const tokenFile = `${OUT}/token.json`;
test.describe.configure({ retries: 0, timeout: 1_500_000, mode: "serial" });

async function rest(method: string, query: Record<string, string>, body?: any) {
  const t = JSON.parse(fs.readFileSync(tokenFile, "utf8"));
  const url = new URL(t.url);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    method,
    headers: { Authorization: `Bearer ${t.token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const listPortfolios = async () => (await rest("POST", { resource: "call", name: "listPortfolios" }, {})).body;

async function surface(page: any) {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  if (s.kind !== "custom") throw new Error("no custom frame");
  await page.waitForTimeout(3000);
  return s.frame;
}
const txt = async (l: any) => ((await l.innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();

test("P-A the Plans page cards v2 and the remembered grouping", async ({ page }) => {
  const rp: any = (await rest("GET", { resource: "plans" })).body;
  const row = (rp.plans || []).find((p: any) => p.id === PLAN_ID);
  console.log("REST summary.verdict =", row.summary.verdict, "| pct =", row.summary.pct, "| finish =", row.summary.finish,
    "| roomWd =", row.summary.roomWd, "| portfolio =", JSON.stringify(row.portfolio), "| projects =", JSON.stringify(row.projects));

  const frame = await surface(page);
  // The stored preference FIRST — the profile is reused, never assume a default.
  const real = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  const before = await real!.evaluate(() => window.localStorage.getItem("lz.plans.groupMode"));
  console.log("STORED groupMode BEFORE =", before);

  const modes = frame.locator('[data-testid="plans-group-mode"]');
  await modes.waitFor({ state: "visible", timeout: 60_000 });
  console.log("MODE BAR:", await txt(modes));
  for (const m of ["portfolio", "project", "all"]) {
    const b = frame.locator(`[data-testid="group-mode-${m}"]`);
    console.log(`  mode ${m}: exists=${await b.count()} label="${await txt(b)}" pressed=${await b.first().getAttribute("aria-pressed")}`);
  }

  const card = frame.locator('[data-testid="plan-card"]').filter({ hasText: PLAN }).first();
  await card.waitFor({ state: "visible", timeout: 30_000 });
  await card.scrollIntoViewIfNeeded();
  const f = (tid: string) => card.locator(`[data-testid="${tid}"]`);
  const fields: Record<string, any> = {
    name: await txt(f("plan-card-name")),
    verdictChip: await txt(f("plan-verdict-chip")),
    punchline: await txt(f("plan-punchline")),
    finish: await txt(f("plan-finish")),
    roomPresent: await f("plan-room").count(),
    portfolioChip: await f("plan-portfolio-chip").count() ? await txt(f("plan-portfolio-chip")) : null,
    portfolioAdd: await f("plan-portfolio-add").count() ? await txt(f("plan-portfolio-add")) : null,
    projectChips: await f("plan-project-chip").allInnerTexts(),
    note: await txt(f("plan-note")),
  };
  console.log("CARD FIELDS:", JSON.stringify(fields, null, 1));
  const noteFont = await f("plan-note").evaluate((e: any) => getComputedStyle(e).fontFamily);
  console.log("NOTE fontFamily:", noteFont, "| fontSize:", await f("plan-note").evaluate((e: any) => getComputedStyle(e).fontSize));
  await card.screenshot({ path: `${OUT}/p1-plan-card.png` });

  // Grouping is remembered: flip to "all", reload, read it back.
  await frame.locator('[data-testid="group-mode-all"]').click();
  await page.waitForTimeout(1200);
  const stored = await real!.evaluate(() => window.localStorage.getItem("lz.plans.groupMode"));
  console.log("STORED after clicking All =", stored);
  const frame2 = await surface(page);
  await frame2.locator('[data-testid="plans-group-mode"]').waitFor({ state: "visible", timeout: 60_000 });
  const pressedAfterReload = await frame2.locator('[data-testid="group-mode-all"]').getAttribute("aria-pressed");
  console.log("AFTER RELOAD group-mode-all aria-pressed =", pressedAfterReload);
  await page.screenshot({ path: `${OUT}/p2-plans-page.png`, fullPage: true });
  // restore the caller's preference
  await frame2.locator(`[data-testid="group-mode-${before || "portfolio"}"]`).click().catch(() => {});
  await page.waitForTimeout(800);
  expect(fields.name).toContain(PLAN);
  expect(pressedAfterReload).toBe("true");
});

test("P-B the Dashboard plan-health hero", async ({ page }) => {
  const frame = await surface(page);
  const card = frame.locator('[data-testid="plan-card"]').filter({ hasText: PLAN }).first();
  await card.waitFor({ state: "visible", timeout: 60_000 });
  const chipOnCard = await txt(card.locator('[data-testid="plan-verdict-chip"]'));
  await card.locator(".plan-card-open").first().click();
  await page.waitForTimeout(6000);
  // Dashboard tab
  const dash = frame.locator('[data-testid="view-tab-dashboard"]');
  if (await dash.count()) { await dash.first().click(); await page.waitForTimeout(3000); }
  const hero = frame.locator('[data-testid="plan-health"]');
  await hero.waitFor({ state: "visible", timeout: 90_000 });
  console.log("HERO data-verdict =", await hero.getAttribute("data-verdict"), "| data-room =", await hero.getAttribute("data-room"));
  console.log("HERO VERDICT WORD =", JSON.stringify(await txt(frame.locator('[data-testid="plan-health-verdict"]'))));
  console.log("HERO PUNCHLINE =", JSON.stringify(await txt(frame.locator('[data-testid="plan-health-punchline"]'))));
  console.log("HERO FULL =", JSON.stringify(await txt(hero)));
  console.log("CARD CHIP WAS =", JSON.stringify(chipOnCard));
  // no score ring anywhere in the hero
  const svgs = await hero.locator("svg").count();
  const ringish = await hero.evaluate((el: any) => el.innerHTML.match(/circle|stroke-dasharray|strokeDasharray/gi)?.length || 0);
  console.log("HERO svg count =", svgs, "| ring-ish markup hits =", ringish);
  // the criteria tooltip
  const crit = frame.locator('[data-testid="plan-health-criteria"]');
  console.log("CRITERIA node count =", await crit.count());
  const critHandle = await crit.first().elementHandle();
  const box = await critHandle!.boundingBox();
  const fbox = await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().boundingBox();
  if (box && fbox) { await page.mouse.move(fbox.x + box.x + box.width / 2, fbox.y + box.y + box.height / 2); await page.waitForTimeout(1200); }
  await crit.first().locator("*").first().focus().catch(() => {});
  await page.waitForTimeout(1200);
  const tipText = await frame.locator('[role="tooltip"], .lz-tip, .lz-infotip').allInnerTexts().catch(() => []);
  console.log("TOOLTIP TEXTS:", JSON.stringify(tipText));
  console.log("CRITERIA title attr:", await crit.first().locator("*").first().getAttribute("title").catch(() => null));
  console.log("CRITERIA innerHTML:", (await crit.first().innerHTML()).slice(0, 600));
  // the tiles
  const tiles = await frame.locator('[data-testid="kpi-tile"]').evaluateAll((els: any[]) =>
    els.map((e) => ({ label: e.getAttribute("data-label"), value: e.getAttribute("data-value") })));
  console.log("KPI TILES:", JSON.stringify(tiles));
  await page.screenshot({ path: `${OUT}/p3-dashboard.png`, fullPage: true });
});

test("P-C create the portfolio, assign LZPT, open the portfolio page", async ({ page }) => {
  console.log("PORTFOLIOS BEFORE:", JSON.stringify(await listPortfolios()));
  const frame = await surface(page);
  await frame.locator('[data-testid="new-portfolio-btn"]').waitFor({ state: "visible", timeout: 60_000 });
  await frame.locator('[data-testid="new-portfolio-btn"]').click();
  await frame.locator('[data-testid="portfolio-dialog"]').waitFor({ state: "visible", timeout: 20_000 });
  console.log("DIALOG:", await txt(frame.locator('[data-testid="portfolio-dialog"]')));
  await page.screenshot({ path: `${OUT}/p4-portfolio-dialog.png` });
  await frame.locator('[data-testid="portfolio-dialog-name"]').fill(PF_NAME);
  await frame.locator('[data-testid="portfolio-dialog-description"]').fill("[harness-test] 6700").catch(() => {});
  await frame.locator('[data-testid="portfolio-dialog-save"]').click();
  await page.waitForTimeout(4000);
  const after: any = await listPortfolios();
  console.log("PORTFOLIOS AFTER CREATE:", JSON.stringify(after));
  const pf = (after?.portfolios || []).find((p: any) => p.name === PF_NAME);
  fs.writeFileSync(`${OUT}/portfolio-state.json`, JSON.stringify({ id: pf?.id || null }, null, 2));
  expect(pf, "the dialog created the portfolio").toBeTruthy();

  // assign LZPT from the CARD MENU's custom select
  const card = frame.locator('[data-testid="plan-card"]').filter({ hasText: PLAN }).first();
  await card.scrollIntoViewIfNeeded();
  await card.locator('[data-testid="plan-portfolio-add"]').click();
  await frame.locator('[data-testid="plan-assign-select"]').waitFor({ state: "visible", timeout: 15_000 });
  await frame.locator('[data-testid="plan-assign-select"] [role="combobox"]').click();
  await page.waitForTimeout(600);
  await frame.locator(`[role="option"]`).filter({ hasText: PF_NAME }).first().click();
  await page.waitForTimeout(4000);
  const chip = card.locator('[data-testid="plan-portfolio-chip"]');
  console.log("CARD PART-OF CHIP:", await txt(chip));
  const rp: any = (await rest("GET", { resource: "plans" })).body;
  console.log("REST plan.portfolio =", JSON.stringify((rp.plans || []).find((p: any) => p.id === PLAN_ID)?.portfolio));
  await page.screenshot({ path: `${OUT}/p5-assigned.png`, fullPage: true });

  // open the portfolio page from the chip
  await chip.click();
  await page.waitForTimeout(4000);
  const name = frame.locator('[data-testid="portfolio-name"]');
  await name.waitFor({ state: "visible", timeout: 30_000 });
  console.log("PORTFOLIO PAGE name =", await txt(name), "| kind =", await txt(frame.locator('[data-testid="portfolio-kind"]')));
  console.log("ROLLUP verdict =", await txt(frame.locator('[data-testid="portfolio-verdict"]')), "| finish =", await txt(frame.locator('[data-testid="portfolio-finish"]')));
  for (const rag of ["red", "amber", "green", "grey", "unknown"]) {
    const n = frame.locator(`[data-testid="portfolio-count-${rag}"]`);
    if (await n.count()) console.log(`  count-${rag}:`, await txt(n));
  }
  console.log("DIRECTION ROWS:", await frame.locator('[data-testid="portfolio-direction-row"]').allInnerTexts());
  console.log("PLANS AS CARDS:", await frame.locator('[data-testid="plans-grid"] [data-testid="plan-card"]').count());
  console.log("PORTFOLIO PAGE TEXT:\n" + (await txt(frame.locator("body"))).slice(0, 1500));
  await page.screenshot({ path: `${OUT}/p6-portfolio-page.png`, fullPage: true });
  expect(await frame.locator('[data-testid="plans-grid"] [data-testid="plan-card"]').count()).toBeGreaterThan(0);
});

test("P-D Propose portfolios: a real model call, confirm NOTHING, no writes", async ({ page }) => {
  const before: any = await listPortfolios();
  const beforeJson = JSON.stringify(before);
  const cfgBefore: any = (await rest("POST", { resource: "call", name: "getAiConfig" }, {})).body;
  console.log("AI USAGE BEFORE:", JSON.stringify(cfgBefore?.usage));
  const frame = await surface(page);
  await frame.locator('[data-testid="propose-portfolios-btn"]').waitFor({ state: "visible", timeout: 60_000 });
  await frame.locator('[data-testid="propose-portfolios-btn"]').click();
  await frame.locator('[data-testid="propose-dialog"]').waitFor({ state: "visible", timeout: 30_000 });
  for (let i = 0; i < 60; i++) {
    const t = await txt(frame.locator('[data-testid="propose-dialog"]'));
    if (!/Reading|Thinking|Proposing|Working|Grouping/i.test(t)) break;
    await page.waitForTimeout(3000);
  }
  await page.waitForTimeout(3000);
  console.log("PROPOSE DIALOG:\n" + await txt(frame.locator('[data-testid="propose-dialog"]')));
  console.log("CLUSTERS:", await frame.locator('[data-testid="propose-cluster"]').count());
  for (const c of await frame.locator('[data-testid="propose-cluster"]').all()) console.log("  CLUSTER:", await txt(c));
  console.log("ai-off block:", await frame.locator('[data-testid="propose-ai-off"]').count(), "| empty block:", await frame.locator('[data-testid="propose-empty"]').count());
  await page.screenshot({ path: `${OUT}/p7-propose.png`, fullPage: true });
  // CANCEL — confirm nothing.
  const cancel = frame.locator('[data-testid="propose-dialog"] button').filter({ hasText: /^(Cancel|Close|Not now)$/i }).first();
  if (await cancel.count()) await cancel.click(); else await page.keyboard.press("Escape");
  await page.waitForTimeout(3000);
  const after: any = await listPortfolios();
  console.log("PORTFOLIOS AFTER PROPOSE+CANCEL:", JSON.stringify(after));
  const cfgAfter: any = (await rest("POST", { resource: "call", name: "getAiConfig" }, {})).body;
  console.log("AI USAGE AFTER:", JSON.stringify(cfgAfter?.usage));
  expect(JSON.stringify(after)).toBe(beforeJson);
});

test("P-Z delete the portfolio; LZPT is stray again", async ({ page }) => {
  const st = JSON.parse(fs.readFileSync(`${OUT}/portfolio-state.json`, "utf8"));
  const frame = await surface(page);
  const card = frame.locator('[data-testid="plan-card"]').filter({ hasText: PLAN }).first();
  await card.scrollIntoViewIfNeeded();
  const chip = card.locator('[data-testid="plan-portfolio-chip"]');
  if (await chip.count()) {
    await chip.click();
    await page.waitForTimeout(3500);
    await frame.locator('[data-testid="portfolio-delete-btn"]').click();
    await page.waitForTimeout(1500);
    const confirm = frame.locator("button").filter({ hasText: /^(Delete|Delete portfolio|Yes, delete)$/i }).last();
    if (await confirm.count()) await confirm.click();
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${OUT}/p8-after-delete.png`, fullPage: true });
  }
  const left: any = await listPortfolios();
  console.log("PORTFOLIOS AFTER DELETE:", JSON.stringify(left));
  const still = (left?.portfolios || []).find((p: any) => p.id === st.id || p.name === PF_NAME);
  if (still) { const d = await rest("POST", { resource: "call", name: "deletePortfolio" }, { portfolioId: still.id }); console.log("REST delete fallback ->", d.status, JSON.stringify(d.body)); }
  const frame3 = await surface(page);
  const card3 = frame3.locator('[data-testid="plan-card"]').filter({ hasText: PLAN }).first();
  await card3.waitFor({ state: "visible", timeout: 60_000 });
  const add = card3.locator('[data-testid="plan-portfolio-add"]');
  console.log("CARD AFTER DELETE — add-offer:", await add.count() ? await txt(add) : "(absent)",
    "| chip:", await card3.locator('[data-testid="plan-portfolio-chip"]').count());
  const rp: any = (await rest("GET", { resource: "plans" })).body;
  console.log("REST plan.portfolio AFTER =", JSON.stringify((rp.plans || []).find((p: any) => p.id === PLAN_ID)?.portfolio));
  const finalPf: any = await listPortfolios();
  console.log("FINAL PORTFOLIOS:", JSON.stringify(finalPf));
  expect((finalPf?.portfolios || []).some((p: any) => p.name === PF_NAME)).toBe(false);
});
