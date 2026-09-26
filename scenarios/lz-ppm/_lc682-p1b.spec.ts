// RETEST dev 6.82.0 — ITEM 3, second leg. The p1 run read the card three times in a
// row WITHOUT leaving the Plans page in between, and PlanList only fetches on mount —
// so those reads were the same stale render, not a stale stamp. Every leg here makes a
// real round trip: enter the plan, edit through the resolver, walk back out.
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
    method, headers: { Authorization: `Bearer ${TOKEN.token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

test("item 3b — every edit read after a real round trip", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.frame;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 150_000 });
  await page.waitForTimeout(3000);

  const R: any = { legs: [] };
  const card = () => frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first();
  const readCard = async () => {
    await card().scrollIntoViewIfNeeded();
    return {
      finish: (await txt(card().locator('[data-testid="plan-finish"]'))).replace(/\n/g, " "),
      room: (await txt(card().locator('[data-testid="plan-room"]'))).replace(/\n/g, " "),
      verdict: await txt(card().locator('[data-testid="plan-verdict-chip"]')),
      punchline: await txt(card().locator('[data-testid="plan-punchline"]')),
    };
  };
  const enterAndReadTable = async () => {
    await card().click();
    await page.waitForTimeout(16000);
    await frame.getByRole("button", { name: /^Table$/i }).first().click().catch(() => {});
    await page.waitForTimeout(7000);
    const rows: any[] = [];
    for (const r of await frame.locator('[data-testid="table-row"]').all()) {
      rows.push({ key: await r.getAttribute("data-row-key"), start: await r.getAttribute("data-row-start"), due: await r.getAttribute("data-row-due"), derived: await r.getAttribute("data-row-derived") });
    }
    return rows;
  };
  const backToPlans = async () => {
    await frame.locator(".lz-appbar-nav-item").filter({ hasText: /^Plans$/ }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(10000);
    await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 120_000 });
    await page.waitForTimeout(3000);
  };

  const leg = async (name: string, edit: () => Promise<any>) => {
    const table = await enterAndReadTable();                 // inside the plan
    const editRes = await edit();                            // resolver call, while inside
    const stamp = (await hook("planMeta", { planId: PLAN })).body?.meta?.summary ?? null;
    await backToPlans();
    const cardNow = await readCard();
    const entry = { name, table, editRes, stamp: stamp && { at: stamp.at, finish: stamp.finish, roomWd: stamp.roomWd, verdict: stamp.verdict, zeroSlack: stamp.zeroSlack }, card: cardNow };
    R.legs.push(entry);
    console.log("LEG", JSON.stringify(entry));
    await page.screenshot({ path: `${OUT}/p1b-${name}.png` });
  };

  R.cardAtOpen = await readCard();
  console.log("CARD AT OPEN", JSON.stringify(R.cardAtOpen));

  await leg("1-delete-dep", () => rest("DELETE", `resource=dependencies&planId=${PLAN}`, { fromKey: PRED, toKey: SUCC }));
  await leg("2-create-dep", () => rest("POST", `resource=dependencies&planId=${PLAN}`, { fromKey: PRED, toKey: SUCC }));
  await leg("3-rest-lag-5", () => rest("PUT", `resource=dependencies&planId=${PLAN}`, { fromKey: PRED, toKey: SUCC, lag: 5 }));

  R.tableFinal = await enterAndReadTable();
  console.log("TABLE FINAL", JSON.stringify(R.tableFinal));
  const bodyT = await txt(frame.locator("body"));
  R.stagedAtExit = /Apply\s+\d+\s+change|Save\s*\(\d+\)/.test(bodyT);
  console.log("STAGED_AFTER_CLEANUP =", R.stagedAtExit);
  fs.writeFileSync(`${OUT}/p1b-results.json`, JSON.stringify(R, null, 2));
  expect(R.legs.length).toBe(3);
});
