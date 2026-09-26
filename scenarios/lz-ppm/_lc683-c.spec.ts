// LIVE CHECK dev 6.83.0 — ITEM 4: a link drawn in the Gantt is ONE immutable transition
// (arrow on the first frame + the cascade), Apply counts link + moved successor, Discard
// puts everything back. Plus two follow-ups from journey B: how much a REFUSED drag
// stages, and whether the refusal toast fits the viewport.
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
const NAME = process.env.LC683_PLAN || "LC683 Lag Bed";
const FROM = process.env.LC683_FROM || "WFH-3513";
const TO = process.env.LC683_TO || "WFH-3514";
const TAG = process.env.LC683_TAG || "bed1";
const REFUSAL = process.env.LC683_REFUSAL === "1";
test.describe.configure({ retries: 1, timeout: 2_400_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";

test("item 4 — staged link + cascade, one transition", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.frame;
  const realFrame = async () => (await (await frame.locator(":root").elementHandle())!.ownerFrame())!;
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 180_000 });
  await page.waitForTimeout(3000);
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first().click();
  await page.waitForTimeout(18000);
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(8000);

  const R: any = {};
  const bodyText = async () => (await frame.locator("body").textContent().catch(() => "")) || "";
  const stagedCount = async () => {
    const t = await bodyText();
    const m = t.match(/Apply (\d+) change/);
    return m ? Number(m[1]) : 0;
  };
  const arrowCount = async () => frame.locator('[data-testid="dep-arrow-hit"]').count();
  const linkArrow = async () => frame.locator(`[data-testid="dep-arrow-hit"][data-link="${FROM}-${TO}"]`).count();
  const rows = async () => {
    const f = await realFrame();
    return f.evaluate(() => [...document.querySelectorAll('[data-testid="gantt-bar"]')]
      .map((e: any) => ({ key: e.getAttribute("data-key"), left: e.style.left, width: e.style.width, derived: e.getAttribute("data-derived") })));
  };
  // The animated "Apply N changes" button defeats getByRole name matching — find it
  // by text, open the review modal, then click its Discard All.
  const discardAll = async () => {
    const apply = frame.locator("button").filter({ hasText: /Apply \d+ change/ }).first();
    if (!(await apply.count())) return "no-apply-button";
    await apply.dispatchEvent("click");
    await frame.locator('[data-testid="apply-review-modal"]').waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const rowsInModal = await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => e.getAttribute("data-issue-key")));
    const subtitle = await txt(frame.locator('[data-testid="apply-review-subtitle"]'));
    await page.screenshot({ path: `${OUT}/c-${TAG}-review-modal.png` });
    const d = frame.locator("button").filter({ hasText: /Discard All/i }).first();
    await d.dispatchEvent("click");
    await page.waitForTimeout(8000);
    return { rowsInModal, subtitle };
  };

  R.openStaged = await stagedCount();
  R.openRows = await rows();
  R.openArrows = await arrowCount();
  console.log("OPEN staged=", R.openStaged, "arrows=", R.openArrows, JSON.stringify(R.openRows));
  await page.screenshot({ path: `${OUT}/c-${TAG}-open.png` });

  // ── follow-up: what a REFUSED drag stages (bed1 only) ──
  if (REFUSAL) {
    const box = await frame.locator('[data-testid="gantt-bar"][data-key="WFH-3512"]').first().boundingBox();
    const cx = box!.x + box!.width / 2, cy = box!.y + box!.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (const f of [0.3, 0.6, 1]) await page.mouse.move(cx + 260 * f, cy, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(1500);
    const f = await realFrame();
    R.toastBox = await f.evaluate(() => [...document.querySelectorAll(".toast-enter, .toast-exit")].map((el: any) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, right: r.right, width: r.width, innerW: window.innerWidth, innerH: window.innerHeight,
        clippedRight: r.right > window.innerWidth, text: (el.textContent || "").slice(0, 200) };
    }));
    console.log("TOAST BOX", JSON.stringify(R.toastBox));
    await page.waitForTimeout(2000);
    R.refusedStaged = await stagedCount();
    R.refusedRows = await rows();
    R.applyPanelText = "(not opened)";
    console.log("AFTER REFUSED DRAG staged=", R.refusedStaged, JSON.stringify(R.refusedRows));
    await page.screenshot({ path: `${OUT}/c-${TAG}-after-refused-drag.png` });
    R.discard1Modal = await discardAll(); R.afterDiscard1 = await stagedCount();
    console.log("after discard1 staged=", R.afterDiscard1);
  }

  // ── the link draw ──
  const dotBox = async (key: string, side: "right" | "left") => {
    const f = await realFrame();
    return f.evaluate(([k, sd]: any) => {
      const bar = document.querySelector(`[data-testid="gantt-bar"][data-key="${k}"]`);
      const dot = bar && bar.querySelector(`.conn-dot-${sd}`);
      if (!dot) return null;
      const r = dot.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, [key, side]);
  };
  const fromDot = await dotBox(FROM, "right");
  const toDot = await dotBox(TO, "left");
  const frameBox = await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().boundingBox();
  R.dots = { fromDot, toDot, frameBox };
  console.log("DOTS", JSON.stringify(R.dots));
  const P = (p: any) => ({ x: frameBox!.x + p.x, y: frameBox!.y + p.y });
  const a = P(fromDot), b = P(toDot);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 6 });
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.waitForTimeout(250);
  await page.mouse.up();
  // FIRST FRAME after the drop: one animation frame, then read.
  const f2 = await realFrame();
  R.firstFrame = await f2.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res({
    arrows: document.querySelectorAll('[data-testid="dep-arrow-hit"]').length,
    links: [...document.querySelectorAll('[data-testid="dep-arrow-hit"]')].map((e: any) => e.getAttribute("data-link")),
    bars: [...document.querySelectorAll('[data-testid="gantt-bar"]')].map((e: any) => `${e.getAttribute("data-key")}@${e.style.left}`),
    body: /Apply (\d+) change/.exec(document.body.textContent || "")?.[1] || "0",
  })))));
  console.log("FIRST FRAME", JSON.stringify(R.firstFrame));
  await page.screenshot({ path: `${OUT}/c-${TAG}-linked-firstframe.png` });
  await page.waitForTimeout(4000);
  R.afterLink = { staged: await stagedCount(), arrows: await arrowCount(), thisLink: await linkArrow(), rows: await rows() };
  console.log("AFTER LINK", JSON.stringify(R.afterLink));
  await page.screenshot({ path: `${OUT}/c-${TAG}-linked.png` });

  // the Table view tells us the successor's DATES, not just pixels
  await frame.getByRole("button", { name: /^Table$/i }).first().click().catch(() => {});
  await page.waitForTimeout(7000);
  R.tableLinked = await frame.locator('[data-testid="table-row"]').evaluateAll((els: any[]) =>
    els.map((e) => ({ key: e.getAttribute("data-row-key"), start: e.getAttribute("data-row-start"), due: e.getAttribute("data-row-due"), derived: e.getAttribute("data-row-derived") })));
  console.log("TABLE LINKED", JSON.stringify(R.tableLinked));
  await page.screenshot({ path: `${OUT}/c-${TAG}-table-linked.png` });

  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  R.discardModal = await discardAll();
  R.afterDiscard = { staged: await stagedCount(), arrows: await arrowCount(), thisLink: await linkArrow(), rows: await rows() };
  console.log("AFTER DISCARD", JSON.stringify(R.afterDiscard));
  await page.screenshot({ path: `${OUT}/c-${TAG}-discarded.png` });

  R.stagedAtExit = /Apply \d+ change|Save \(\d+\)/.test(await bodyText());
  console.log("STAGED_AFTER_CLEANUP =", R.stagedAtExit);
  fs.writeFileSync(`${OUT}/c-${TAG}-results.json`, JSON.stringify(R, null, 2));
  expect(R.afterLink.thisLink).toBeGreaterThan(0);
});
