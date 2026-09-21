// LZ7G0 item 4b — the HEADER DRIFT COUNT must be DATE-ONLY (0301a09b / 7.13.0
// FIND 1). WFH-3753 is now DERIVED (A blocks it, so the plan draws 06-03..06-09
// against Jira's 06-01..06-05).
//   Phase 1: buffer-only on the derived row + two date edits on NON-derived rows
//            -> no per-row drift line, NO header drift note at all.
//   Phase 2: add a DATE edit on that same derived row -> the note appears and
//            counts exactly 1.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7g0";
const bed = JSON.parse(fs.readFileSync("/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz7g0/bed.json", "utf8"));
test.describe.configure({ retries: 0, timeout: 1_500_000 });
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const badges = async (f: any) => ((await bodyText(f)).match(/Save\s*\(\d+\)|Saved|Apply\s+\d+\s+change\w*/gi) || []).join(" | ");

test("G4B: drift count is date-only", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  await frame.getByText(bed.planName, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(10000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  const rows = async (tag: string) => console.log(tag, JSON.stringify(await frame.locator('[data-testid="table-row"]').evaluateAll((els: any[]) =>
    els.map((e) => `${e.getAttribute("data-row-key")} ${e.getAttribute("data-row-start")}..${e.getAttribute("data-row-due")} dur=${e.getAttribute("data-row-duration")} derived=${e.getAttribute("data-row-derived")}`))));
  await rows("OPEN");
  console.log("DERIVED_CHIPS", JSON.stringify(await frame.locator('[data-testid="table-derived-chip"]').evaluateAll((els: any[]) => els.map((e) => `${e.getAttribute("data-key")}=${e.getAttribute("data-reason")}`))));

  const setDue = async (key: string, iso: string, label: string) => {
    const row = frame.locator(`[data-row-key="${key}"]`).first();
    await row.scrollIntoViewIfNeeded().catch(() => {});
    await row.locator(`text=${label}`).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(1800);
    const day = frame.locator(`button[aria-label="${iso}"]`);
    console.log("DAY_COUNT", key, await day.count());
    await day.first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(2500);
  };
  const review = async (tag: string) => {
    const btn = frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ });
    if (!(await btn.count())) { console.log(tag, "NO_APPLY_BUTTON"); return; }
    await btn.first().dispatchEvent("click");
    await page.waitForTimeout(3500);
    const out = await frame.locator(':root').evaluate(() => {
      const secs: any[] = [];
      document.querySelectorAll('[data-testid="apply-section-header"]').forEach((h) => {
        secs.push({ heading: (h.textContent || "").replace(/\s+/g, " "),
          rows: Array.from(h.parentElement!.querySelectorAll('[data-testid="apply-change-row"]')).map((r) => ({
            key: r.getAttribute("data-issue-key"), text: (r.textContent || "").replace(/\s+/g, " "),
            driftLine: r.querySelector('[data-testid="apply-plan-drift"]') ? (r.querySelector('[data-testid="apply-plan-drift"]')!.textContent || "").replace(/\s+/g, " ") : null })) });
      });
      const d = document.querySelector('[data-testid="apply-plan-drift-count"]');
      return { secs, driftNote: d ? (d.textContent || "").replace(/\s+/g, " ") : null,
        driftRows: document.querySelectorAll('[data-testid="apply-plan-drift"]').length };
    });
    console.log(tag, "REVIEW", JSON.stringify(out, null, 1));
    await page.screenshot({ path: `${OUT}/g4b-${tag}.png` });
    await frame.locator("button").filter({ hasText: /^Cancel$/ }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(2000);
  };

  // PHASE 1 — buffer-only on the DERIVED row + two date edits on non-derived rows
  const dRow = frame.locator(`[data-row-key="${bed.D}"]`).first();
  await dRow.scrollIntoViewIfNeeded().catch(() => {});
  await dRow.getByText("No", { exact: true }).last().dispatchEvent("click").catch((e: any) => console.log("BUF_ERR", String(e).slice(0, 80)));
  await page.waitForTimeout(2500);
  await setDue(bed.C, "2026-06-12", "Jun 10");
  await setDue(bed.E, "2026-06-04", "Jun 3");
  await rows("PHASE1");
  console.log("BADGES_P1", await badges(frame));
  await review("phase1");

  // PHASE 2 — now stage a DATE on the same derived row
  await setDue(bed.D, "2026-06-08", "Jun 5");
  await rows("PHASE2");
  console.log("BADGES_P2", await badges(frame));
  await review("phase2");

  await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(3000);
  await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(2500);
  for (const label of ["Discard All", "Discard", "Confirm", "Yes"]) {
    const b = frame.locator("button").filter({ hasText: new RegExp(`^${label}$`) });
    if (await b.count()) { await b.last().dispatchEvent("click").catch(() => {}); break; }
  }
  await page.waitForTimeout(7000);
  console.log("BADGES_AFTER_DISCARD", await badges(frame));
  await rows("AFTER_DISCARD");
});
