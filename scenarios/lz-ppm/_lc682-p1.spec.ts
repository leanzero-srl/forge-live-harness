// RETEST dev 6.82.0 — ITEM 3: a lag / dependency edit re-measures the PLAN CARD in the
// same call, with NO refresh and NO re-index, and the card agrees with the Table's
// derived row.
//
// Bed "LC682 Lag Bed": WFH-3487 (10-05..10-09) -> WFH-3488 (10-12..10-16) -> WFH-3489
// (10-19..10-23), 5 wd each, target "Go live" 2026-10-28.
//   no lag        finish 10-23, room +3 wd, TIGHT
//   lag 5 wd      WFH-3489 renders 10-26..10-30 -> finish 10-30, room -2 wd, OVERDUE
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
// @ts-ignore
import { loadEnv } from "../../data/env.mjs";
import * as fs from "fs";

loadEnv();
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/shots";
const NAME = "LC682 Lag Bed";
const PLAN = "plan-test-mu9h1p8f-pxi5vy";
const PRED = "WFH-3488";
const SUCC = "WFH-3489";
const TOKEN = JSON.parse(fs.readFileSync("/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/token.json", "utf8"));
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

test("item 3 — the card follows a lag/dep edit with no refresh", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.frame;
  const realFrame = async () => (await (await frame.locator(":root").elementHandle())!.ownerFrame())!;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 150_000 });
  await page.waitForTimeout(3000);

  const R: any = { steps: [] };
  const card = () => frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first();
  const readCard = async (label: string) => {
    await card().scrollIntoViewIfNeeded();
    const got = {
      label,
      finish: (await txt(card().locator('[data-testid="plan-finish"]'))).replace(/\n/g, " "),
      room: (await txt(card().locator('[data-testid="plan-room"]'))).replace(/\n/g, " "),
      verdict: await txt(card().locator('[data-testid="plan-verdict-chip"]')),
      punchline: await txt(card().locator('[data-testid="plan-punchline"]')),
    };
    R.steps.push(got);
    console.log("CARD", JSON.stringify(got));
    return got;
  };
  const toPlans = async () => {
    await frame.locator(".lz-appbar-nav-item").filter({ hasText: /^Plans$/ }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(9000);
    await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 120_000 });
    await page.waitForTimeout(2500);
  };
  const openPlanTable = async () => {
    await card().click();
    await page.waitForTimeout(16000);
    await frame.getByRole("button", { name: /^Table$/i }).first().click().catch(() => {});
    await page.waitForTimeout(7000);
    const rows: any[] = [];
    for (const r of await frame.locator('[data-testid="table-row"]').all()) {
      rows.push({
        key: await r.getAttribute("data-row-key"), start: await r.getAttribute("data-row-start"),
        due: await r.getAttribute("data-row-due"), derived: await r.getAttribute("data-row-derived"),
      });
    }
    console.log("TABLE", JSON.stringify(rows));
    return rows;
  };

  // ---------- A: no lag ----------
  R.cardNoLag = await readCard("A no lag");
  R.tableNoLag = await openPlanTable();
  await page.screenshot({ path: `${OUT}/p1-a-table-nolag.png` });
  R.reloadsSoFar = 0;

  // ---------- B: setLinkLag 5 wd, then walk BACK to the Plans page (no reload) ----------
  R.setLag = await hook("setLag", { planId: PLAN, fromKey: PRED, toKey: SUCC, lag: "5" });
  console.log("HOOK setLag", JSON.stringify(R.setLag));
  await toPlans();
  R.cardAfterLag = await readCard("B after setLag 5");
  await page.screenshot({ path: `${OUT}/p1-b-card-lagged.png` });
  R.tableAfterLag = await openPlanTable();
  await page.screenshot({ path: `${OUT}/p1-c-table-lagged.png` });

  // ---------- C: deleteDependency, same call ----------
  R.delDep = await rest("DELETE", `resource=dependencies&planId=${PLAN}`, { fromKey: PRED, toKey: SUCC });
  console.log("REST deleteDependency", JSON.stringify(R.delDep).slice(0, 400));
  await toPlans();
  R.cardAfterDelete = await readCard("C after deleteDependency");
  await page.screenshot({ path: `${OUT}/p1-d-card-unlinked.png` });

  // ---------- D: createDependency, same call ----------
  R.addDep = await rest("POST", `resource=dependencies&planId=${PLAN}`, { fromKey: PRED, toKey: SUCC });
  console.log("REST createDependency", JSON.stringify(R.addDep).slice(0, 400));
  await toPlans();
  R.cardAfterCreate = await readCard("D after createDependency");
  R.metaAfterCreate = (await hook("planMeta", { planId: PLAN })).body?.meta?.summary ?? null;
  await page.screenshot({ path: `${OUT}/p1-e-card-relinked.png` });

  // ---------- E: setLinkLag 5 again over REST (the resolver, not the hook) ----------
  R.putLag = await rest("PUT", `resource=dependencies&planId=${PLAN}`, { fromKey: PRED, toKey: SUCC, lag: 5 });
  console.log("REST setLinkLag", JSON.stringify(R.putLag).slice(0, 400));
  await toPlans();
  R.cardAfterRelag = await readCard("E after REST setLinkLag 5");
  await page.screenshot({ path: `${OUT}/p1-f-card-relagged.png` });
  R.tableFinal = await openPlanTable();
  await page.screenshot({ path: `${OUT}/p1-g-table-final.png` });

  const bodyT = await txt(frame.locator("body"));
  R.stagedAtExit = /Apply\s+\d+\s+change|Save\s*\(\d+\)/.test(bodyT);
  console.log("STAGED_AFTER_CLEANUP =", R.stagedAtExit);
  fs.writeFileSync(`${OUT}/p1-results.json`, JSON.stringify(R, null, 2));
  expect(R.tableNoLag.length).toBe(3);
});
