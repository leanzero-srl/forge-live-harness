// LZ7B0 item 3 (B) + item 4 — dev 7.11.0 / UI v4.58.648, bed LZPT Scenarios.
// TWO leaf drags saved -> meta.savedEdits SET. Re-index raises the carry confirm and
// says how many. Revert ONE row to Jira's value and Save -> the mark is KEPT. Discard
// All the other -> the mark is ABSENT (latency measured). Re-index then raises NO
// confirm. NEVER applies to Jira.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7b0";
const PLAN = "LZPT Scenarios";
const PLAN_ID = "plan-msq9dg8l-gz6mz1";
const A = "LZPT-216"; // 2026-05-08 -> 2026-05-12
const B = "LZPT-213"; // 2026-05-15 -> 2026-05-15
test.describe.configure({ retries: 0, timeout: 1_200_000 });

const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const meta = async () => {
  const p: any = await getTestState("lz-ppm", { what: "planMeta", planId: PLAN_ID });
  return { at: p.meta?.savedEdits?.at ?? null, has: p.meta && Object.prototype.hasOwnProperty.call(p.meta, "savedEdits"), v: p.meta?.version };
};
const snap = async () => {
  const p: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  const F = ["startDate", "dueDate", "duration", "buffer"];
  return {
    carriers: (p.issues || []).filter((i: any) => F.some((f) => String(i[f] ?? "") !== String(i._original?.[f] ?? ""))).map((i: any) => `${i.key}:${i.startDate}/${i.dueDate}/${i.duration}`),
    dec: (p.issues || []).filter((i: any) => i.durationExplicitlyCleared === true).map((i: any) => i.key),
    n: (p.issues || []).length,
    savedEdits: p.meta?.savedEdits ?? null,
  };
};
const pollMark = async (tag: string, want: "present" | "absent", ms = 12000) => {
  const t0 = Date.now();
  let last: any = null;
  while (Date.now() - t0 < ms) {
    last = await meta();
    const ok = want === "present" ? !!last.at : !last.has;
    if (ok) { console.log(`${tag} -> ${want} after ${Date.now() - t0}ms`, JSON.stringify(last)); return { ok: true, ms: Date.now() - t0, last }; }
    await new Promise((r) => setTimeout(r, 700));
  }
  console.log(`${tag} -> STILL NOT ${want} after ${ms}ms`, JSON.stringify(last));
  return { ok: false, ms, last };
};

test("I3: savedEdits set / kept on partial revert / cleared on discard; re-index confirm", async ({ page }) => {
  console.log("PRE", JSON.stringify(await snap()), JSON.stringify(await meta()));
  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(8000);
  console.log("SHELL_REV", ((await bodyText(frame)).match(/rev\s*v?([\d.]+)/) || [])[1]);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(7000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  await frame.locator("[data-gantt-scroll]").first().evaluate((el: any) => { el.scrollLeft = 0; }).catch(() => {});
  await page.waitForTimeout(1500);
  console.log("STAGED_ON_OPEN", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));

  const dayNum = (iso: string | null) => (iso ? Math.round(new Date(`${iso}T00:00:00Z`).getTime() / 86400000) : NaN);
  const anchor = async (k: string) => await frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first()
    .evaluate((el: any) => ({ left: parseFloat(el.style.left), start: el.getAttribute("data-bar-start") }));
  const aA = await anchor("LZPT-218"), aB = await anchor("LZPT-226");
  let dayPx = (aB.left - aA.left) / (dayNum(aB.start) - dayNum(aA.start));
  console.log("DAY_PX", dayPx);

  const dragTo = async (key: string, targetIso: string) => {
    const bar = frame.locator(`[data-testid="gantt-bar"][data-key="${key}"]`).first();
    const TARGET = dayNum(targetIso);
    for (let attempt = 0; attempt < 10; attempt++) {
      await bar.scrollIntoViewIfNeeded().catch(() => {});
      const before = dayNum(await bar.getAttribute("data-bar-start"));
      const need = TARGET - before;
      if (need === 0) { console.log(`  ${key} at ${targetIso}`); return true; }
      const dx = Math.max(-150, Math.min(150, need * dayPx));
      const bb = await bar.boundingBox(); if (!bb) throw new Error(`no box ${key}`);
      const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
      await page.mouse.move(cx, cy); await page.mouse.down();
      for (let i = 1; i <= 8; i++) { await page.mouse.move(cx + (i * dx) / 8, cy, { steps: 2 }); await page.waitForTimeout(70); }
      await page.waitForTimeout(350); await page.mouse.up(); await page.waitForTimeout(2200);
      const after = dayNum(await bar.getAttribute("data-bar-start"));
      console.log(`  ${key} attempt ${attempt}: ${before} -> ${after} (need ${need}, dx ${dx.toFixed(0)})`);
      if (after !== before) dayPx = dx / (after - before);
    }
    console.log(`  ${key} FAILED to reach ${targetIso}`);
    return false;
  };
  const save = async (tag: string) => {
    const btn = frame.locator('[data-testid="plan-save-btn"]').first();
    console.log(tag, "SAVE_LABEL", ((await btn.textContent().catch(() => "")) || "").trim());
    await btn.click({ timeout: 30000 });
    for (let i = 0; i < 200; i++) { if ((await btn.getAttribute("data-save-state").catch(() => null)) === "saved") break; await page.waitForTimeout(250); }
    await page.waitForTimeout(1200);
  };

  // ---- 1. two leaf drags, saved ----
  await dragTo(A, "2026-05-11");
  await dragTo(B, "2026-05-18");
  console.log("STAGED_AFTER_2_DRAGS", ((await bodyText(frame)).match(/Save\s*\(\d+\)/i) || [])[0]);
  await page.screenshot({ path: `${OUT}/i3-01-two-drags.png` });
  await save("S1");
  console.log("AFTER_SAVE1", JSON.stringify(await snap()));
  await pollMark("MARK_AFTER_SAVE1", "present", 8000);

  // ---- 2. Re-index with a carried saved edit: the confirm must appear and count ----
  const reindex = frame.locator("button").filter({ hasText: /Re-?index/i }).first();
  await reindex.dispatchEvent("click");
  await page.waitForTimeout(3000);
  const t1 = await bodyText(frame);
  const confirm1 = /saved edit|will be dropped|Jira wins|Re-?index this plan/i.test(t1);
  console.log("REINDEX_CONFIRM_1", confirm1);
  console.log("REINDEX_CONFIRM_1_TEXT", (t1.match(/Re-?index[\s\S]{0,500}/i) || [])[0]);
  await page.screenshot({ path: `${OUT}/i3-02-reindex-confirm.png` });
  const cancel = frame.locator("button").filter({ hasText: /^(Cancel|Keep my edits|Not now)$/i }).first();
  console.log("CANCEL_BUTTONS", await frame.locator("button").filter({ hasText: /^Cancel$/i }).count());
  await cancel.dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(2500);
  console.log("AFTER_CANCEL staged", ((await bodyText(frame)).match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/i) || [])[0]);
  console.log("AFTER_CANCEL snap", JSON.stringify(await snap()));

  // ---- 3. revert ONE row to Jira's value and Save -> mark KEPT ----
  await dragTo(A, "2026-05-08");
  await save("S2");
  const afterPartial = await snap();
  console.log("AFTER_PARTIAL_REVERT", JSON.stringify(afterPartial));
  const kept = await meta();
  console.log("MARK_AFTER_PARTIAL", JSON.stringify(kept));
  await new Promise((r) => setTimeout(r, 6000));
  console.log("MARK_AFTER_PARTIAL_+6s", JSON.stringify(await meta()));
  await page.screenshot({ path: `${OUT}/i3-03-partial-revert.png` });

  // ---- 4. Discard All the remaining row -> mark ABSENT ----
  const applyBtn = frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first();
  console.log("APPLY_BTN", ((await applyBtn.textContent().catch(() => "")) || "").trim());
  await applyBtn.dispatchEvent("click");
  await page.waitForTimeout(3000);
  console.log("APPLY_ROWS", JSON.stringify(await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })))));
  await page.screenshot({ path: `${OUT}/i3-04-apply-before-discard.png` });
  const tDiscard = Date.now();
  await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click");
  const r = await pollMark("MARK_AFTER_DISCARD", "absent", 20000);
  console.log("DISCARD_TO_ABSENT_MS", r.ok ? Date.now() - tDiscard : "NEVER");
  await page.waitForTimeout(4000);
  console.log("AFTER_DISCARD snap", JSON.stringify(await snap()));
  await page.screenshot({ path: `${OUT}/i3-05-discarded.png` });

  // ---- 5. Re-index with nothing carried -> NO confirm ----
  await page.waitForTimeout(2000);
  await frame.locator("button").filter({ hasText: /Re-?index/i }).first().dispatchEvent("click");
  await page.waitForTimeout(3000);
  const t2 = await bodyText(frame);
  const confirm2 = /saved edit|will be dropped|Jira wins|Re-?index this plan\?/i.test(t2);
  console.log("REINDEX_CONFIRM_2 (expect false)", confirm2);
  console.log("REINDEX_2_SNIP", (t2.match(/Re-?index[\s\S]{0,300}/i) || [])[0]);
  await page.screenshot({ path: `${OUT}/i3-06-reindex-2.png` });
  await page.waitForTimeout(20000);
  const fin = await snap();
  console.log("FINAL", JSON.stringify(fin), JSON.stringify(await meta()));
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await page.screenshot({ path: `${OUT}/i3-07-final.png` });
});
