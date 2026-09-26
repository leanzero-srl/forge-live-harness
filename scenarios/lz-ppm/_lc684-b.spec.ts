// LIVE CHECK dev 6.84.0 — ITEM 8: nav re-click refresh (d2255085) + staged link (c0f59860).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
// @ts-ignore
import { loadEnv } from "../../data/env.mjs";
import * as fs from "fs";

loadEnv();
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/shots684";
const TOK = JSON.parse(fs.readFileSync("/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lc684/tok.json", "utf8"));
const PLAN = "plan-test-mu9kw0i6-mook0n";
const NAME = "LC683 Lag Bed";
test.describe.configure({ retries: 1, timeout: 2_400_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";

async function hook(what: string, params: Record<string, string> = {}) {
  const u = new URL(process.env.LZ_PPM_TESTHOOK_URL!);
  u.searchParams.set("what", what);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u.toString(), { headers: { Authorization: `Bearer ${process.env.HARNESS_SECRET}` } });
  return await r.json().catch(() => null);
}
async function saveTarget(name: string, date: string, id?: string) {
  const meta = (await hook("planMeta", { planId: PLAN }))?.meta;
  const r = await fetch(`${TOK.url}?resource=call&name=saveTarget`, {
    method: "POST", headers: { Authorization: `Bearer ${TOK.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ payload: { planId: PLAN, target: { ...(id ? { id } : {}), name, date, scope: { type: "plan" } }, expectedVersion: meta.version } }),
  });
  const body = await r.json().catch(() => null);
  const after = (await hook("planMeta", { planId: PLAN }))?.meta;
  return { status: r.status, summary: after?.summary, targets: (after?.milestones || []).map((m: any) => `${m.id}|${m.name}@${m.date}`) };
}

test("item 8 — nav re-click, and a staged dependency", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.frame;
  const realFrame = async () => (await (await frame.locator(":root").elementHandle())!.ownerFrame())!;
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 180_000 });
  await page.waitForTimeout(4000);
  const R: any = {};
  const card = () => frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first();
  const readCard = async (label: string) => {
    await card().scrollIntoViewIfNeeded();
    const got = { label,
      verdict: await txt(card().locator('[data-testid="plan-verdict-chip"]')),
      punchline: await txt(card().locator('[data-testid="plan-punchline"]')),
      finish: (await txt(card().locator('[data-testid="plan-finish"]'))).replace(/\n/g, " "),
      room: (await txt(card().locator('[data-testid="plan-room"]'))).replace(/\n/g, " ") };
    console.log("CARD", JSON.stringify(got));
    return got;
  };
  R.cardBefore = await readCard("before");
  await page.screenshot({ path: `${OUT}/b-card-before.png` });

  // A REST target change the OPEN page cannot know about.
  R.meta0 = (await hook("planMeta", { planId: PLAN }))?.meta;
  const boardReview = (R.meta0.milestones || []).find((m: any) => m.name === "Board review");
  R.rest = await saveTarget("Board review", "2026-07-01", boardReview?.id);
  console.log("REST saveTarget ->", JSON.stringify({ roomWd: R.rest.summary?.roomWd, targetDate: R.rest.summary?.targetDate, targetsMissed: R.rest.summary?.targetsMissed, milestonesMissed: R.rest.summary?.milestonesMissed }));

  // RE-CLICK the nav item we are already on.
  const f = await realFrame();
  R.before = await f.evaluate(() => ({ cards: document.querySelectorAll('[data-testid="plan-card"]').length }));
  await frame.locator(".lz-appbar-nav-item").filter({ hasText: /^Plans$/ }).first().dispatchEvent("click");
  await page.waitForTimeout(600);
  R.at600 = await f.evaluate(() => ({ cards: document.querySelectorAll('[data-testid="plan-card"]').length, skeletons: document.querySelectorAll('.lz-skeleton, [class*="skeleton"]').length }));
  await page.screenshot({ path: `${OUT}/b-reclick-600ms.png` });
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForTimeout(9000);
  R.cardAfter = await readCard("after re-click");
  await page.screenshot({ path: `${OUT}/b-card-after.png` });
  R.cardChanged = R.cardAfter.room !== R.cardBefore.room || R.cardAfter.punchline !== R.cardBefore.punchline;

  // restore the target date
  R.restRestore = await saveTarget("Board review", "2026-08-14", boardReview?.id);
  await frame.locator(".lz-appbar-nav-item").filter({ hasText: /^Plans$/ }).first().dispatchEvent("click");
  await page.waitForTimeout(9000);
  R.cardRestored = await readCard("restored");

  // ── the staged dependency drag ──
  await card().click();
  await page.waitForTimeout(18000);
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  const stagedText = async () => {
    const t = (await frame.locator("body").textContent().catch(() => "")) || "";
    const m = t.match(/Apply \d+ change\w*|Save \(\d+\)/);
    return m ? m[0] : null;
  };
  R.stagedAtOpen = await stagedText();
  const rows = async () => frame.locator('[data-testid="gantt-bar"]').evaluateAll((els: any[]) =>
    els.map((e) => ({ key: e.getAttribute("data-key"), left: e.style.left })));
  R.rowsOpen = await rows();
  R.arrowsOpen = await frame.locator('[data-testid="dep-arrow-hit"]').count();
  for (const k of ["WFH-3513", "WFH-3514"]) await frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/b-gantt-open.png` });

  const rf = await realFrame();
  const started = await rf.evaluate((k: string) => {
    const b: any = document.querySelector(`[data-testid="gantt-bar"][data-key="${k}"]`);
    const dot: any = b?.parentElement?.querySelector(".conn-dot-right");
    if (!dot) return null;
    const r = dot.getBoundingClientRect(); const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    dot.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: cx, clientY: cy, buttons: 1 }));
    return { cx, cy };
  }, "WFH-3513");
  R.dragStart = started;
  const fb = (await frame.locator(":root").elementHandle())!;
  const ibox = await (await fb.ownerFrame())!.frameElement().then((h: any) => h.boundingBox());
  const target = await frame.locator('[data-testid="gantt-bar"][data-key="WFH-3514"]').first().boundingBox();
  if (started && target) {
    await page.mouse.move(ibox!.x + started.cx, ibox!.y + started.cy);
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 });
    await page.mouse.up();
  }
  // FIRST FRAME after the drop
  R.firstFrame = await rf.evaluate(() => ({
    arrows: document.querySelectorAll('[data-testid="dep-arrow-hit"]').length,
    links: Array.from(document.querySelectorAll('[data-testid="dep-arrow-hit"]')).map((e: any) => e.getAttribute("data-link")),
    bars: Array.from(document.querySelectorAll('[data-testid="gantt-bar"]')).map((e: any) => `${e.getAttribute("data-key")}@${e.style.left}`),
  }));
  await page.screenshot({ path: `${OUT}/b-link-firstframe.png` });
  await page.waitForTimeout(4000);
  R.afterLink = { staged: await stagedText(), arrows: await frame.locator('[data-testid="dep-arrow-hit"]').count(), rows: await rows() };
  await page.screenshot({ path: `${OUT}/b-link-settled.png` });
  const btn = frame.locator("button").filter({ hasText: /Apply \d+ change/ }).first();
  await btn.dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(2500);
  R.applyPanel = (await txt(frame.locator("body"))).replace(/\s+/g, " ").slice(0, 2500);
  await page.screenshot({ path: `${OUT}/b-apply-panel.png`, fullPage: true });
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(1500);
  const disc = frame.locator("button").filter({ hasText: /Discard All|Discard all/ }).first();
  await disc.dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(1500);
  await frame.locator("button").filter({ hasText: /^(Discard|Discard changes|Yes|Confirm)$/ }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(7000);
  R.stagedAfterDiscard = await stagedText();
  R.arrowsAfterDiscard = await frame.locator('[data-testid="dep-arrow-hit"]').count();
  await page.screenshot({ path: `${OUT}/b-after-discard.png` });
  console.log("STAGED_AFTER_CLEANUP =", !!R.stagedAfterDiscard, R.stagedAfterDiscard);
  fs.writeFileSync(`${OUT}/b-results.json`, JSON.stringify(R, null, 2));
  expect(R.cardBefore.punchline).not.toBe("(none)");
});
