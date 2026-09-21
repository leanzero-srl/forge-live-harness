// LZ7G0 item 4 — the Apply review SECTION HEADINGS (0301a09b) on the WFH bed.
// Stage TWO date edits (WFH-3752 due 06-10 -> 06-12, WFH-3754 due 06-03 -> 06-04)
// and ONE buffer-only change (WFH-3753 No -> Yes) and assert:
//   "Date Changes 2/2", "Other Changes 1/1", the buffer row under Other, and the
//   header drift count (if any) counted from DATE rows only.
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

test("G4: date/other split in the Apply review", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  console.log("SHELL_REV", ((await bodyText(frame)).match(/rev\s*v?([\d.]+)/) || [])[1]);
  await frame.getByText(bed.planName, { exact: true }).first().click().catch((e: any) => console.log("PLAN_CLICK_ERR", String(e).slice(0, 80)));
  await page.waitForTimeout(10000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  console.log("STAGED_ON_OPEN", await badges(frame));
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  const rowState = async (tag: string) => {
    const rows = await frame.locator('[data-testid="table-row"]').evaluateAll((els: any[]) => els.map((e) => ({
      k: e.getAttribute("data-row-key"), s: e.getAttribute("data-row-start"), d: e.getAttribute("data-row-due"),
      dur: e.getAttribute("data-row-duration"), der: e.getAttribute("data-row-derived"), t: (e.textContent || "").replace(/\s+/g, " ") })));
    console.log(tag, "ROWS", JSON.stringify(rows, null, 1));
  };
  await rowState("OPEN");

  const setDue = async (key: string, iso: string, label: string) => {
    const row = frame.locator(`[data-row-key="${key}"]`).first();
    await row.scrollIntoViewIfNeeded().catch(() => {});
    await row.locator(`text=${label}`).first().dispatchEvent("click").catch((e: any) => console.log("CELL_ERR", key, String(e).slice(0, 70)));
    await page.waitForTimeout(1800);
    console.log("PICKER", key, await frame.locator(".lz-datepicker").count());
    const day = frame.locator(`button[aria-label="${iso}"]`);
    console.log("DAY_COUNT", key, await day.count());
    await day.first().dispatchEvent("click").catch((e: any) => console.log("DAY_ERR", key, String(e).slice(0, 70)));
    await page.waitForTimeout(2500);
  };
  await setDue(bed.C, "2026-06-12", "Jun 10");     // date edit 1
  await setDue(bed.E, "2026-06-04", "Jun 3");      // date edit 2
  // buffer-only change on the standalone leaf D
  const dRow = frame.locator(`[data-row-key="${bed.D}"]`).first();
  await dRow.scrollIntoViewIfNeeded().catch(() => {});
  await dRow.getByText("No", { exact: true }).last().dispatchEvent("click").catch((e: any) => console.log("BUF_ERR", String(e).slice(0, 80)));
  await page.waitForTimeout(2500);
  await rowState("AFTER_EDITS");
  console.log("BADGES", await badges(frame));
  await page.screenshot({ path: `${OUT}/g4-1-table.png` });

  const applyBtn = frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ });
  console.log("APPLY_BTN", await applyBtn.count());
  await applyBtn.first().dispatchEvent("click");
  await page.waitForTimeout(3500);
  const sections = await frame.locator('[data-testid="apply-section-header"]').allTextContents();
  console.log("SECTION_HEADERS", JSON.stringify(sections));
  const layout = await frame.locator(':root').evaluate(() => {
    const out: any[] = [];
    document.querySelectorAll('[data-testid="apply-section-header"]').forEach((h) => {
      const sec = h.parentElement!;
      const rows = Array.from(sec.querySelectorAll('[data-testid="apply-change-row"]')).map((r) => ({
        key: r.getAttribute("data-issue-key"), text: (r.textContent || "").replace(/\s+/g, " ") }));
      out.push({ heading: (h.textContent || "").replace(/\s+/g, " "), rows });
    });
    const drift = document.querySelector('[data-testid="apply-plan-drift-count"]');
    const head = document.querySelector('[data-testid="apply-change-row"]')?.closest('div[style]')?.parentElement;
    return { sections: out, drift: drift ? (drift.textContent || "").replace(/\s+/g, " ") : null };
  });
  console.log("SECTION_LAYOUT", JSON.stringify(layout, null, 1));
  const modal = await bodyText(frame);
  console.log("MODAL_SUMMARY_LINE", (modal.match(/\d+ changes? will be written to Jira[^]{0,160}/) || [])[0]);
  await page.screenshot({ path: `${OUT}/g4-2-review.png` });
  await page.screenshot({ path: `${OUT}/g4-2b-review-full.png`, fullPage: true });

  await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click").catch((e: any) => console.log("DISCARD_ERR", String(e).slice(0, 80)));
  await page.waitForTimeout(2500);
  for (const label of ["Discard All", "Discard", "Confirm", "Yes"]) {
    const b = frame.locator("button").filter({ hasText: new RegExp(`^${label}$`) });
    if (await b.count()) { await b.last().dispatchEvent("click").catch(() => {}); break; }
  }
  await page.waitForTimeout(7000);
  console.log("BADGES_AFTER_DISCARD", await badges(frame));
  await rowState("AFTER_DISCARD");
  await page.screenshot({ path: `${OUT}/g4-3-discarded.png` });
});
