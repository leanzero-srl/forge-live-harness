// LIVE CHECK dev 6.83.0 — ITEM 2 (punchline split) + ITEM 3 (nav re-click remount).
// Bed "LC683 Lag Bed": WFH-3511 -> 3512 -> 3513 (lag 5 wd on the last link, so 3513
// renders 2026-10-26..10-30) plus WFH-3514, a zero-duration milestone due 2026-09-10
// (past due => 1 missed milestone ISSUE).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
// @ts-ignore
import { loadEnv } from "../../data/env.mjs";
import * as fs from "fs";

loadEnv();
const T = getTarget("lz-ppm-dashboard");
const SC = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad";
const OUT = `${SC}/shots683`;
const NAME = "LC683 Lag Bed";
const PLAN = JSON.parse(fs.readFileSync(`${SC}/plans683.json`, "utf8")).plan1;
const TOKEN = JSON.parse(fs.readFileSync(`${SC}/token683.json`, "utf8"));
test.describe.configure({ retries: 1, timeout: 2_400_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";

async function hook(what: string, params: Record<string, string> = {}) {
  const u = new URL(process.env.LZ_PPM_TESTHOOK_URL!);
  u.searchParams.set("what", what);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u.toString(), { headers: { Authorization: `Bearer ${process.env.HARNESS_SECRET}` } });
  return { status: r.status, body: await r.json().catch(() => null) };
}
async function rest(method: string, qs: string, body?: any) {
  const r = await fetch(`${TOKEN.url}?${qs}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN.token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}
async function saveTarget(name: string, date: string) {
  const meta = (await hook("planMeta", { planId: PLAN })).body?.meta;
  const r = await rest("POST", "resource=call&name=saveTarget", {
    payload: { planId: PLAN, target: { name, date, scope: { type: "plan" } }, expectedVersion: meta.version },
  });
  const after = (await hook("planMeta", { planId: PLAN })).body?.meta;
  return { status: r.status, ok: r.body?.success, summary: after?.summary, targets: (after?.milestones || []).map((m: any) => `${m.name}@${m.date}`) };
}

test("items 2+3 — punchline split, nav re-click", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.frame;
  const realFrame = async () => (await (await frame.locator(":root").elementHandle())!.ownerFrame())!;
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 180_000 });
  await page.waitForTimeout(4000);

  const R: any = { steps: [] };
  R.version = await txt(frame.locator("body")).then((t: string) => (t.match(/\d+\.\d+\.\d+/g) || []).slice(-3));
  const card = () => frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first();
  const readCard = async (label: string) => {
    await card().scrollIntoViewIfNeeded();
    const got = {
      label,
      verdict: await txt(card().locator('[data-testid="plan-verdict-chip"]')),
      punchline: await txt(card().locator('[data-testid="plan-punchline"]')),
      finish: (await txt(card().locator('[data-testid="plan-finish"]'))).replace(/\n/g, " "),
      room: (await txt(card().locator('[data-testid="plan-room"]'))).replace(/\n/g, " "),
    };
    R.steps.push(got);
    console.log("CARD", JSON.stringify(got));
    return got;
  };
  // Re-click the nav item we are already on (the 6.83.0 change) and measure.
  const reclickPlans = async (tag: string) => {
    const f = await realFrame();
    const before = await f.evaluate(() => ({
      scroll: document.scrollingElement?.scrollTop ?? 0,
      cards: document.querySelectorAll('[data-testid="plan-card"]').length,
    }));
    await frame.locator(".lz-appbar-nav-item").filter({ hasText: /^Plans$/ }).first().dispatchEvent("click");
    await page.waitForTimeout(600);
    const mid = await f.evaluate(() => ({
      cards: document.querySelectorAll('[data-testid="plan-card"]').length,
      skeletons: document.querySelectorAll('.lz-skeleton, [class*="skeleton"]').length,
      scroll: document.scrollingElement?.scrollTop ?? 0,
    }));
    await page.screenshot({ path: `${OUT}/reclick-${tag}-600ms.png` });
    await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 120_000 });
    await page.waitForTimeout(9000);
    const after = await f.evaluate(() => ({
      cards: document.querySelectorAll('[data-testid="plan-card"]').length,
      scroll: document.scrollingElement?.scrollTop ?? 0,
    }));
    const note = { tag, before, at600ms: mid, after };
    (R.reclicks ||= []).push(note);
    console.log("RECLICK", JSON.stringify(note));
  };

  // ── S0: lag set, no targets. milestonesMissed 1 / targetsMissed 0 ──
  R.metaS0 = (await hook("planMeta", { planId: PLAN })).body?.meta?.summary;
  R.s0 = await readCard("S0 no targets");
  await page.screenshot({ path: `${OUT}/a-s0-card.png` });

  // ── S1: Go live 2026-10-28 via REST, then RE-CLICK Plans (no reload) ──
  R.t1 = await saveTarget("Go live", "2026-10-28");
  console.log("SAVE TARGET 1", JSON.stringify(R.t1));
  await reclickPlans("s1");
  R.s1 = await readCard("S1 + Go live 2026-10-28");
  await page.screenshot({ path: `${OUT}/a-s1-card.png` });

  // ── S2: a past plan-scoped target as well ──
  R.t2 = await saveTarget("Board review", "2026-08-14");
  await reclickPlans("s2");
  R.s2 = await readCard("S2 + Board review 2026-08-14 (past)");
  await page.screenshot({ path: `${OUT}/a-s2-card.png` });

  // ── S3: a SECOND past target, so one of them is not the commitment ──
  R.t3 = await saveTarget("Pilot gate", "2026-09-01");
  await reclickPlans("s3");
  R.s3 = await readCard("S3 + Pilot gate 2026-09-01 (past)");
  await page.screenshot({ path: `${OUT}/a-s3-card.png` });

  // ── S4: a THIRD past target -> plural ──
  R.t4 = await saveTarget("Design freeze", "2026-09-04");
  await reclickPlans("s4");
  R.s4 = await readCard("S4 + Design freeze 2026-09-04 (past)");
  await page.screenshot({ path: `${OUT}/a-s4-card.png` });

  // ── Dashboard health line must be byte-identical to the card punchline ──
  await card().click();
  await page.waitForTimeout(18000);
  await frame.getByRole("button", { name: /^Dashboard$/i }).first().click().catch(() => {});
  await page.waitForTimeout(9000);
  R.dash = {
    verdict: await txt(frame.locator('[data-testid="plan-health-verdict"]')),
    punchline: await txt(frame.locator('[data-testid="plan-health-punchline"]')),
    milestoneRows: await frame.locator('[data-testid="milestone-row"]').count(),
    milestoneStates: await frame.locator('[data-testid="milestone-row"]').evaluateAll((els: any[]) => els.map((e) => `${e.getAttribute("data-key")}:${e.getAttribute("data-state")}`)).catch(() => []),
  };
  console.log("DASH", JSON.stringify(R.dash));
  await page.screenshot({ path: `${OUT}/a-dashboard.png`, fullPage: false });
  R.dashMatchesCard = R.dash.punchline.trim() === R.s4.punchline.trim();

  // back to Plans
  await frame.locator(".lz-appbar-nav-item").filter({ hasText: /^Plans$/ }).first().dispatchEvent("click");
  await page.waitForTimeout(9000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 120_000 });

  // ── ITEM 3b: open the create-portfolio dialog, then re-click Plans ──
  await frame.locator('[data-testid="new-portfolio-btn"]').first().dispatchEvent("click");
  await page.waitForTimeout(1500);
  R.dialogBefore = await frame.locator('[data-testid="portfolio-dialog"]').count();
  await page.screenshot({ path: `${OUT}/a-dialog-open.png` });
  await frame.locator(".lz-appbar-nav-item").filter({ hasText: /^Plans$/ }).first().dispatchEvent("click");
  await page.waitForTimeout(3000);
  R.dialogAfterReclick = await frame.locator('[data-testid="portfolio-dialog"]').count();
  await page.screenshot({ path: `${OUT}/a-dialog-after-reclick.png` });
  console.log("DIALOG", R.dialogBefore, "->", R.dialogAfterReclick);

  const bodyT = await txt(frame.locator("body"));
  R.stagedAtExit = /Apply\s+\d+\s+change|Save\s*\(\d+\)/.test(bodyT);
  console.log("STAGED_AFTER_CLEANUP =", R.stagedAtExit);
  fs.writeFileSync(`${OUT}/a-results.json`, JSON.stringify(R, null, 2));
  expect(R.s0.punchline).not.toBe("(none)");
});
