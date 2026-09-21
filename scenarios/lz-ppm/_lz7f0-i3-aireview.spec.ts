// LZ7F0 item 3 (browser half) — dev 7.15.0 / UI v4.58.652.
// Drag LZPT-216 (2026-05-08..05-12, no preds/succs) to 2026-05-11..05-13 — the
// exact 3wd -> 3wd Mon..Wed shape the 7.12.0/7.14.0 reviewer called "compressed
// ... spanning a weekend". After ba993d5a the deterministic filter must drop any
// such finding: the modal must carry NO compression card and NO weekend claim.
// ONE real model call. Everything is discarded; nothing is applied to Jira.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";
import * as fs from "fs";
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7f0";
const PLAN = "LZPT Scenarios", PLAN_ID = "plan-msq9dg8l-gz6mz1", LEAF = "LZPT-216";
const tok = JSON.parse(fs.readFileSync("/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz7f0/token.json", "utf8"));
test.describe.configure({ retries: 0, timeout: 2_400_000 });
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const F = ["startDate", "dueDate", "duration", "buffer"];
const carriers = async () => {
  const p: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  return (p.issues || []).filter((i: any) => F.some((f) => String(i[f] ?? "") !== String(i._original?.[f] ?? ""))).map((i: any) => `${i.key}:${i.startDate}/${i.dueDate}`);
};
const aiMeter = async () => {
  const url = new URL(tok.url); url.searchParams.set("resource", "call"); url.searchParams.set("name", "getAiConfig");
  const r = await fetch(url.toString(), { method: "POST", headers: { Authorization: `Bearer ${tok.token}`, "Content-Type": "application/json" }, body: "{}" });
  const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch {}
  const u = j?.usage || j?.result?.usage || null;
  return { status: r.status, reviews: u?.byFeature?.review ?? u?.reviews ?? null, inputTokens: u?.inputTokens ?? null, raw: t.slice(0, 300) };
};

test("F3: the AI reviewer drops the refuted compression/weekend claim", async ({ page }) => {
  console.log("PRE_CARRIERS", JSON.stringify(await carriers()));
  console.log("AI_METER_BEFORE", JSON.stringify(await aiMeter()));
  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  console.log("SHELL_REV", ((await bodyText(frame)).match(/rev\s*v?([\d.]+)/) || [])[1]);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(10000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  console.log("STAGED_ON_OPEN", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);

  const dayNum = (iso: string | null) => (iso ? Math.round(new Date(`${iso}T00:00:00Z`).getTime() / 86400000) : NaN);
  const anchor = async (k: string) => await frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first()
    .evaluate((el: any) => ({ left: parseFloat(el.style.left), start: el.getAttribute("data-bar-start") }));
  const aA = await anchor("LZPT-218"), aB = await anchor("LZPT-226");
  let dayPx = (aB.left - aA.left) / (dayNum(aB.start) - dayNum(aA.start));
  console.log("DAY_PX", dayPx);
  const bar = frame.locator(`[data-testid="gantt-bar"][data-key="${LEAF}"]`).first();
  console.log("BAR_BEFORE", await bar.getAttribute("data-bar-start"), await bar.getAttribute("data-bar-due"));
  const TARGET = dayNum("2026-05-11");
  for (let attempt = 0; attempt < 8; attempt++) {
    await bar.scrollIntoViewIfNeeded().catch(() => {});
    const before = dayNum(await bar.getAttribute("data-bar-start"));
    const need = TARGET - before;
    if (need === 0) break;
    const dx = Math.max(-120, Math.min(120, need * dayPx));
    const bb = await bar.boundingBox(); if (!bb) throw new Error("no bar box");
    const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(cx + (i * dx) / 8, cy, { steps: 2 }); await page.waitForTimeout(70); }
    await page.waitForTimeout(350); await page.mouse.up(); await page.waitForTimeout(2200);
    const after = dayNum(await bar.getAttribute("data-bar-start"));
    console.log(`DRAG ${attempt}: ${before} -> ${after} (need ${need})`);
    if (after !== before) dayPx = dx / (after - before);
  }
  console.log("BAR_AFTER_DRAG", await bar.getAttribute("data-bar-start"), await bar.getAttribute("data-bar-due"));
  await page.screenshot({ path: `${OUT}/f3-00-dragged.png` });
  const applyBtn = frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first();
  console.log("APPLY_BTN", ((await applyBtn.textContent().catch(() => "")) || "").trim());
  await applyBtn.dispatchEvent("click");
  await page.waitForTimeout(3500);
  console.log("REVIEW_ROWS", JSON.stringify(await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })))));

  const aiBtn = frame.locator("button").filter({ hasText: /Review with AI/i }).first();
  await aiBtn.dispatchEvent("click");
  await frame.locator('[data-testid="ai-review-modal"]').first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => console.log("AI_MODAL_NOT_VISIBLE"));
  const t0 = Date.now();
  for (let i = 0; i < 300; i++) {
    const t = ((await frame.locator('[data-testid="ai-review-modal"]').first().textContent().catch(() => "")) || "");
    if (!/Reviewing the plan/i.test(t)) break;
    await page.waitForTimeout(500);
  }
  console.log("AI_REVIEW_MS", Date.now() - t0);
  await page.waitForTimeout(2500);
  const aiText = ((await frame.locator('[data-testid="ai-review-modal"]').first().textContent().catch(() => "")) || "").replace(/\s+/g, " ");
  console.log("AI_MODAL_TEXT_VERBATIM >>>", aiText, "<<<");
  console.log("AI_COMPRESS_HITS", JSON.stringify((aiText.match(/[^.]{0,160}compress[^.]{0,140}\./gi) || [])));
  console.log("AI_WEEKEND_HITS", JSON.stringify((aiText.match(/[^.]{0,160}(weekend|non-working|holiday)[^.]{0,140}\./gi) || [])));
  console.log("AI_MENTIONS_216", /LZPT-216/.test(aiText));
  await page.screenshot({ path: `${OUT}/f3-01-ai-review.png` });
  await frame.locator('[data-testid="ai-review-modal"]').first().screenshot({ path: `${OUT}/f3-01b-ai-modal.png` }).catch(() => {});
  console.log("AI_METER_AFTER", JSON.stringify(await aiMeter()));

  await frame.locator('[data-testid="ai-review-modal"]').locator("button").last().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(1500);
  await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click").catch((e: any) => console.log("DISCARD_ERR", String(e).slice(0, 100)));
  await page.waitForTimeout(14000);
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  console.log("FINAL_CARRIERS", JSON.stringify(await carriers()));
  console.log("BAR_FINAL", await bar.getAttribute("data-bar-start").catch(() => "ABSENT"), await bar.getAttribute("data-bar-due").catch(() => "ABSENT"));
  await page.screenshot({ path: `${OUT}/f3-02-final.png` });
});
