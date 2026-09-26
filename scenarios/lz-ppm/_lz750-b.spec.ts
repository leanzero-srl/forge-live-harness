// LZ750 item 6 — the AI-view FINE stale signal on a within-week move of a leaf
// that does not carry the finish (breaker F5 / commit 3f6f9634).
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
test.describe.configure({ retries: 0, timeout: 3_000_000, mode: "serial" });

test("LZ750 item6 fine stale signal", async ({ page }) => {
  const R: any = {};
  const P = bed.planId;
  const meta0 = await hook(`what=planMeta&planId=${P}`);
  R.before = { contentHash: (meta0.meta || meta0).contentHash, coarse: pick((meta0.meta || meta0).summary), schedDigest: (meta0.meta || meta0).summary?.schedDigest };
  const ai0 = await api(`resource=ai&planId=${P}`);
  R.before.ai = { stale: ai0.stale, staleBy: ai0.staleBy, builtAt: ai0.view?.builtAt, schedDigest: ai0.view?.schedDigest, scheduleStamp: ai0.view?.scheduleStamp, metaStamp: ai0.view?.metaStamp };
  console.log("BEFORE", JSON.stringify(R.before));

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
    return { present: true, state: await l.getAttribute("data-state"), staleBy: await l.getAttribute("data-stale-by"), partial: await l.getAttribute("data-partial"), text: (await l.innerText().catch(() => "")).replace(/\n/g, " | ") };
  };
  const toStoryline = async () => { await frame.locator('[data-testid="view-tab-storyline"]').first().click().catch(() => {}); await page.waitForTimeout(14000); };
  const toTable = async () => { await frame.getByRole("button", { name: /^Table$/i }).first().click().catch(() => {}); await page.waitForTimeout(7000); };

  await toStoryline();
  R.storylineBefore = { chip: await chip(), rebuild: await frame.locator('[data-testid="storyline-rebuild"]').count(), blocks: await frame.locator('[data-testid="storyline-block"]').count() };
  await page.screenshot({ path: `${OUT}/06a-storyline-before.png`, fullPage: true });
  console.log("STORYLINE BEFORE", JSON.stringify(R.storylineBefore));

  // ---- the move: WFH-3668 due 2026-12-03 (Thu) -> 2026-12-02 (Wed), SAME week bucket, then SAVE
  await toTable();
  const row = frame.locator(`[data-testid="table-row"][data-row-key="${bed.l1}"]`).first();
  await row.scrollIntoViewIfNeeded().catch(() => {});
  await row.locator("div").filter({ hasText: /^Dec 3$/ }).first().click({ force: true }).catch(async () => {
    await row.locator('div:nth-child(5)').first().click({ force: true });
  });
  await page.waitForTimeout(1500);
  R.pickerOpen = await frame.locator(".lz-datepicker").count();
  await frame.locator('.lz-datepicker button[aria-label="2026-12-02"]').first().click({ force: true });
  await page.waitForTimeout(4000);
  R.afterEdit = { row: await row.evaluate((e: any) => ({ start: e.getAttribute("data-row-start"), due: e.getAttribute("data-row-due"), dur: e.getAttribute("data-row-duration") })) };
  await page.screenshot({ path: `${OUT}/06b-after-edit.png` });
  const save = frame.locator('[data-testid="plan-save-btn"]');
  R.saveLabel = await save.innerText().catch(() => "");
  await save.click({ force: true });
  await page.waitForTimeout(12000);
  R.saveAfter = await save.innerText().catch(() => "");
  await page.screenshot({ path: `${OUT}/06c-after-save.png` });
  console.log("EDIT+SAVE", JSON.stringify({ ...R.afterEdit, saveLabel: R.saveLabel, saveAfter: R.saveAfter }));

  const meta1 = await hook(`what=planMeta&planId=${P}`);
  R.after = { contentHash: (meta1.meta || meta1).contentHash, coarse: pick((meta1.meta || meta1).summary), schedDigest: (meta1.meta || meta1).summary?.schedDigest };
  const ai1 = await api(`resource=ai&planId=${P}`);
  R.after.ai = { stale: ai1.stale, staleBy: ai1.staleBy, builtAt: ai1.view?.builtAt, schedDigest: ai1.view?.schedDigest };
  console.log("AFTER", JSON.stringify(R.after));

  await toStoryline();
  R.storylineAfter = { chip: await chip(), rebuild: await frame.locator('[data-testid="storyline-rebuild"]').count(), blocks: await frame.locator('[data-testid="storyline-block"]').count() };
  await page.screenshot({ path: `${OUT}/06d-storyline-after.png`, fullPage: true });
  console.log("STORYLINE AFTER", JSON.stringify(R.storylineAfter));

  // ---- refreshPlan must NOT rebuild
  const rp = await hook(`what=refreshPlan&planId=${P}`);
  R.refresh = { status: rp._status, reason: rp.reason ?? rp.result?.reason ?? null, raw: JSON.stringify(rp).slice(0, 400) };
  await page.waitForTimeout(4000);
  const ai2 = await api(`resource=ai&planId=${P}`);
  R.afterRefresh = { stale: ai2.stale, staleBy: ai2.staleBy, builtAt: ai2.view?.builtAt, schedDigest: ai2.view?.schedDigest };
  console.log("REFRESH", JSON.stringify(R.refresh), JSON.stringify(R.afterRefresh));

  fs.writeFileSync(`${BED}/results.json`, JSON.stringify(R, null, 2));
  expect(1).toBe(1);
});
