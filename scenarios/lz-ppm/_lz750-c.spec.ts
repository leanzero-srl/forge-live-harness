// LZ750 item 6, take 2 — the FINE stale signal, with a restamp trigger that exists.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";
const BED = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz750b";
const bed = JSON.parse(fs.readFileSync(`${BED}/bed.json`, "utf8"));
const OUT = `${BED}/shots`; fs.mkdirSync(OUT, { recursive: true });
const T = getTarget("lz-ppm-dashboard");
const U = process.env.LZM_URL!, TOK = process.env.LZM_TOKEN!;
const HOOK = process.env.LZ_PPM_TESTHOOK_URL!, SEC = process.env.HARNESS_SECRET!;
const api = async (q: string, m = "GET", b?: any) => {
  const r = await fetch(`${U}?${q}`, { method: m, headers: { Authorization: `Bearer ${TOK}`, "Content-Type": "application/json" }, body: b && JSON.stringify(b) });
  return { _status: r.status, ...(await r.json().catch(() => ({}))) } as any;
};
const hook = async (q: string) => {
  const r = await fetch(`${HOOK}?${q}`, { headers: { Authorization: `Bearer ${SEC}` } });
  return { _status: r.status, ...(await r.json().catch(() => ({}))) } as any;
};
const COARSE = ["unmeasured", "capped", "start", "finish", "leaves", "pct", "zeroSlack", "bufferExhausted", "bufferTotal", "due"];
const pick = (s: any) => { const o: any = {}; for (const f of COARSE) o[f] = s?.[f] ?? null; return o; };
const P = bed.planId;
const snap = async (label: string) => {
  const m = await hook(`what=planMeta&planId=${P}`); const meta = m.meta || m;
  const row = (await api(`resource=issues&planId=${P}&key=${bed.l1}`)).issue || {};
  const ai = await api(`resource=ai&planId=${P}`);
  const o = { label, contentHash: meta.contentHash, ver: meta.version, at: meta.summary?.at, coarse: pick(meta.summary), schedDigest: meta.summary?.schedDigest,
    row: { s: row.startDate, d: row.dueDate, dur: row.duration },
    ai: { stale: ai.stale, staleBy: ai.staleBy, builtAt: ai.view?.builtAt, viewDigest: ai.view?.schedDigest, viewSched: ai.view?.scheduleStamp } };
  console.log("SNAP", JSON.stringify(o));
  return o;
};
test.describe.configure({ retries: 0, timeout: 3_000_000, mode: "serial" });

test("LZ750 item6 take2", async ({ page }) => {
  const R: any = { snaps: [] };
  R.snaps.push(await snap("t0-baseline"));

  await page.setViewportSize({ width: 1700, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.frame;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 180_000 });
  await page.waitForTimeout(3000);
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: bed.tag }).first().click();
  await page.waitForTimeout(20000);

  const chip = async () => {
    const l = frame.locator('[data-testid="ai-structure-status"]').first();
    if (!(await l.count())) return { present: false };
    return { present: true, state: await l.getAttribute("data-state"), staleBy: await l.getAttribute("data-stale-by"), text: (await l.innerText().catch(() => "")).replace(/\n/g, " | ") };
  };
  const toStoryline = async () => { await frame.locator('[data-testid="view-tab-storyline"]').first().click().catch(() => {}); await page.waitForTimeout(14000); };
  const toTable = async () => { await frame.getByRole("button", { name: /^Table$/i }).first().click().catch(() => {}); await page.waitForTimeout(7000); };

  await toStoryline();
  R.storylineBefore = { chip: await chip(), rebuild: await frame.locator('[data-testid="storyline-rebuild"]').count(), blocks: await frame.locator('[data-testid="storyline-block"]').count() };
  await page.screenshot({ path: `${OUT}/06a-storyline-before.png`, fullPage: true });
  console.log("STORYLINE BEFORE", JSON.stringify(R.storylineBefore));

  // the move: Dec 3 (Thu) -> Dec 2 (Wed), same Monday-week bucket, then SAVE
  await toTable();
  const row = frame.locator(`[data-testid="table-row"][data-row-key="${bed.l1}"]`).first();
  await row.scrollIntoViewIfNeeded().catch(() => {});
  await row.locator("div").filter({ hasText: /^Dec 3$/ }).first().click({ force: true });
  await page.waitForTimeout(1500);
  await frame.locator('.lz-datepicker button[aria-label="2026-12-02"]').first().click({ force: true });
  await page.waitForTimeout(4000);
  R.afterEdit = await row.evaluate((e: any) => ({ start: e.getAttribute("data-row-start"), due: e.getAttribute("data-row-due"), dur: e.getAttribute("data-row-duration") }));
  const save = frame.locator('[data-testid="plan-save-btn"]');
  R.saveLabel = await save.innerText().catch(() => "");
  await save.click({ force: true });
  await page.waitForTimeout(12000);
  R.saveAfter = await save.innerText().catch(() => "");
  await page.screenshot({ path: `${OUT}/06c-after-save.png` });
  console.log("EDIT+SAVE", JSON.stringify(R.afterEdit), R.saveLabel, "->", R.saveAfter);
  R.snaps.push(await snap("t1-after-save"));

  // a LAG round-trip: the product's own restamp trigger (restampPlanMetaAfterChange)
  const k9 = bed.chain[8].key, k10 = bed.chain[9].key;
  console.log("LAG 3", JSON.stringify(await api(`resource=dependencies&planId=${P}`, "PUT", { fromKey: k9, toKey: k10, lag: 3 })).slice(0, 160));
  R.snaps.push(await snap("t2-lag3"));
  console.log("LAG 2", JSON.stringify(await api(`resource=dependencies&planId=${P}`, "PUT", { fromKey: k9, toKey: k10, lag: 2 })).slice(0, 160));
  R.snaps.push(await snap("t3-lag-back"));

  // reload the plan surface so the UI reads the new staleness
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s2 = await enterForgeSurface(page, { surface: "custom" });
  const f2 = s2.frame;
  await page.waitForTimeout(5000);
  await f2.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 180_000 });
  await page.waitForTimeout(3000);
  await f2.locator('[data-testid="plan-card"]').filter({ hasText: bed.tag }).first().click();
  await page.waitForTimeout(20000);
  await f2.locator('[data-testid="view-tab-storyline"]').first().click().catch(() => {});
  await page.waitForTimeout(16000);
  const l2 = f2.locator('[data-testid="ai-structure-status"]').first();
  R.storylineAfter = {
    chip: (await l2.count()) ? { present: true, state: await l2.getAttribute("data-state"), staleBy: await l2.getAttribute("data-stale-by"), text: (await l2.innerText().catch(() => "")).replace(/\n/g, " | ") } : { present: false },
    rebuild: await f2.locator('[data-testid="storyline-rebuild"]').count(),
    blocks: await f2.locator('[data-testid="storyline-block"]').count(),
  };
  await page.screenshot({ path: `${OUT}/06d-storyline-after.png`, fullPage: true });
  console.log("STORYLINE AFTER", JSON.stringify(R.storylineAfter));

  // refreshPlan must NOT rebuild
  console.log("REFRESH", JSON.stringify(await hook(`what=refreshPlan&planId=${P}`)).slice(0, 200));
  await page.waitForTimeout(4000);
  R.snaps.push(await snap("t4-after-refreshPlan"));

  fs.writeFileSync(`${BED}/results2.json`, JSON.stringify(R, null, 2));
  expect(1).toBe(1);
});
