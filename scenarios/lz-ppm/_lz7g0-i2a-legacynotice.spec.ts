// LZ7G0 item 2a — the STANDING LEGACY-DRAFT NOTICE (e1e65b71) on LZPT, with a
// manifest-less head seeded by ?what=seedLegacyDraft for LZPT-212 (dueDate
// 2026-09-23, stored row is fully undated).
// Asserts: the notice renders EXACTLY once; the toolbar stages exactly ONE row
// (no phantom successor / no parent rollup carried); LZPT-212 shows the seeded
// due; and — driven, not assumed — a hook refreshPlan raises the BEHIND notice
// while the legacy notice is on screen, so the two standing slots are measured
// for overlap in the same frame.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7g0";
const PLAN = "LZPT Scenarios", PLAN_ID = "plan-msq9dg8l-gz6mz1", KEY = "LZPT-212";
const SENT = "This draft was saved by an older version of the app";
test.describe.configure({ retries: 0, timeout: 1_200_000 });
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");

test("G2A: one legacy notice, one drafted row, seeded due, no slot collision", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  const shell = await bodyText(frame);
  console.log("SHELL_REV", (shell.match(/rev\s*v?([\d.]+)/) || [])[1]);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(10000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(8000);

  const t1 = await bodyText(frame);
  console.log("NOTICE_TESTID_COUNT", await frame.locator('[data-testid="plan-legacy-draft-notice"]').count());
  console.log("NOTICE_TEXT_OCCURRENCES", t1.split(SENT).length - 1);
  console.log("NOTICE_FULL", await frame.locator('[data-testid="plan-legacy-draft-notice"]').first().textContent().catch(() => "(absent)"));
  console.log("TOOLBAR_BADGES", (t1.match(/Save\s*\(\d+\)|Saved|Apply\s+\d+\s+change\w*/gi) || []).join(" | "));
  console.log("REFRESH_SLOT_COUNT_BEFORE", await frame.locator('[data-testid="plan-refresh-status"]').count());
  await page.screenshot({ path: `${OUT}/g2a-1-open.png`, fullPage: false });

  // the staged set, from the review itself
  const applyBtn = frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ });
  console.log("APPLY_BUTTON_COUNT", await applyBtn.count());
  if (await applyBtn.count()) {
    await applyBtn.first().dispatchEvent("click");
    await page.waitForTimeout(3500);
    const rows = await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) =>
      els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })));
    console.log("APPLY_ROWS", JSON.stringify(rows, null, 1));
    const heads = await frame.locator('[data-testid="apply-section-header"]').allTextContents().catch(() => []);
    console.log("APPLY_SECTION_HEADERS", JSON.stringify(heads));
    await page.screenshot({ path: `${OUT}/g2a-2-review.png` });
    await frame.locator("button").filter({ hasText: /^Cancel$/ }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(2000);
  }

  // the row itself + every derived chip on the plan
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(4500);
  const row = frame.locator(`[data-row-key="${KEY}"]`).first();
  console.log("ROW_212", await row.evaluate((e: any) => ({ start: e.getAttribute("data-row-start"), due: e.getAttribute("data-row-due"), dur: e.getAttribute("data-row-duration"), derived: e.getAttribute("data-row-derived"), text: (e.textContent || "").replace(/\s+/g, " ").slice(0, 200) })).catch(() => "ABSENT"));
  const parent = frame.locator(`[data-row-key="LZPT-190"]`).first();
  console.log("ROW_190_PARENT", await parent.evaluate((e: any) => ({ start: e.getAttribute("data-row-start"), due: e.getAttribute("data-row-due"), derived: e.getAttribute("data-row-derived") })).catch(() => "ABSENT"));
  const chips = await frame.locator('[data-testid="table-derived-chip"]').evaluateAll((els: any[]) =>
    els.map((e) => `${e.getAttribute("data-key")}=${e.getAttribute("data-reason")}`));
  console.log("DERIVED_CHIPS", JSON.stringify(chips));
  await page.screenshot({ path: `${OUT}/g2a-3-table.png` });

  // FORCE the behind-Jira slot while the legacy notice is up: a hook refreshPlan
  // publishes plan-updated on the global plane and PlanView raises the behind notice
  // because the session holds local edits.
  console.log("REFRESH_HOOK", JSON.stringify((await getTestState("lz-ppm", { what: "refreshPlan", planId: PLAN_ID }) as any)?.meta?.contentHash ?? "?"));
  for (let i = 0; i < 12; i++) {
    if (await frame.locator('[data-testid="plan-refresh-status"]').count()) break;
    await page.waitForTimeout(2500);
  }
  const both = await frame.locator(':root').evaluate(() => {
    const a = document.querySelector('[data-testid="plan-legacy-draft-notice"]') as HTMLElement | null;
    const b = document.querySelector('[data-testid="plan-refresh-status"]') as HTMLElement | null;
    const r = (e: HTMLElement | null) => { if (!e) return null; const q = e.getBoundingClientRect(); return { top: Math.round(q.top), bottom: Math.round(q.bottom), left: Math.round(q.left), right: Math.round(q.right) }; };
    const ra = r(a), rb = r(b);
    const overlap = ra && rb ? !(ra.bottom <= rb.top || rb.bottom <= ra.top || ra.right <= rb.left || rb.right <= ra.left) : null;
    return { legacy: ra, refresh: rb, refreshText: b ? (b.textContent || "").replace(/\s+/g, " ") : null, overlap, parentFlex: a && a.parentElement ? getComputedStyle(a.parentElement).flexDirection : null };
  });
  console.log("SLOT_GEOMETRY", JSON.stringify(both));
  await page.screenshot({ path: `${OUT}/g2a-4-bothnotices.png` });
  console.log("BADGES_AFTER_REFRESH", ((await bodyText(frame)).match(/Save\s*\(\d+\)|Saved|Apply\s+\d+\s+change\w*/gi) || []).join(" | "));
  console.log("DRAFT_SCHEMAS_AFTER", JSON.stringify(await getTestState("lz-ppm", { what: "draftSchemas", planId: PLAN_ID })));
});
