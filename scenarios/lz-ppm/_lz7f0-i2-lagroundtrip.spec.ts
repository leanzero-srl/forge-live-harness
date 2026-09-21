// LZ7F0 item 2 — the LAG ROUND TRIP (commit b42a2ae2 `_passBase`), live on LZPT.
// Bed: the DIAMOND under Epic LZPT-187 — 197 (05-04..05-06) -> 198 (05-07..05-12)
// and 199 (05-07..05-14) -> 200 (05-15..05-19, 3 wd). The Epic's Jira dates are
// NULL, so its bar is a pure rollup MIN/MAX of the four children.
// Independent expectations (Mon-Fri, no holidays):
//   lag 5 on 199->200: start = 5 wd after 05-14 then next wd = 05-22, +3wd -> 05-26
//                      envelope 05-04 .. 05-26   -> Epic offered "none -> May 4 / May 26"
//   lag 0: every bar back where it opened -> NOTHING staged, Save reads "Saved"
//   lag 3: start = 05-20, +3wd -> 05-22; envelope 05-04 .. 05-22
//                      -> Epic offered "none -> May 4 / May 22"
// Restores the lag to 0 at the end.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7f0";
const PLAN = "LZPT Scenarios", PLAN_ID = "plan-msq9dg8l-gz6mz1";
const EPIC = "LZPT-187", FROM = "LZPT-199", TO = "LZPT-200", LEAF = "LZPT-216";
const tok = JSON.parse(fs.readFileSync("/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz7f0/token.json", "utf8"));
test.describe.configure({ retries: 0, timeout: 2_400_000 });

const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const F = ["startDate", "dueDate", "duration", "buffer"];
const carriers = async () => {
  const p: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  return (p.issues || []).filter((i: any) => F.some((f) => String(i[f] ?? "") !== String(i._original?.[f] ?? "")))
    .map((i: any) => `${i.key}:${i.startDate}/${i.dueDate}/${i.duration}/${i.buffer}`);
};
const draftHead = async () => {
  const url = new URL(tok.url); url.searchParams.set("resource", "draft"); url.searchParams.set("planId", PLAN_ID);
  const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${tok.token}` } });
  const t = await r.text(); let j: any = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, revision: j?.revision ?? null, state: j?.state ?? null, changes: j?.changes ? Object.keys(j.changes).length : (Array.isArray(j?.pages) ? j.pages.length : null), raw: t.slice(0, 260) };
};

test("F2: lag 5 -> 0 stages nothing; 5 -> 3 keeps the Epic", async ({ page }) => {
  console.log("PRE_CARRIERS", JSON.stringify(await carriers()));
  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  console.log("SHELL_REV", ((await bodyText(frame)).match(/rev\s*v?([\d.]+)/) || [])[1]);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(9000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  console.log("STAGED_ON_OPEN", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  console.log("DRAFT_ON_OPEN", JSON.stringify(await draftHead()));
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);

  const barAttr = async (k: string) => {
    const b = frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first();
    if (!(await b.count())) return "ABSENT";
    return `${await b.getAttribute("data-bar-start")}..${await b.getAttribute("data-bar-due")}`;
  };
  await frame.locator(`[data-testid="gantt-bar"][data-key="${TO}"]`).first().scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(1500);
  const showBars = async (tag: string) => console.log(tag, "BARS", "EPIC", await barAttr(EPIC), "| 200", await barAttr(TO), "| 199", await barAttr(FROM), "| 198", await barAttr("LZPT-198"));
  await showBars("OPEN");

  const arrow = frame.locator(`[data-testid="dep-arrow-hit"][data-link="${FROM}-${TO}"]`).first();
  console.log("ARROW_COUNT", await frame.locator(`[data-testid="dep-arrow-hit"][data-link="${FROM}-${TO}"]`).count());
  const openMenu = async () => { await arrow.dispatchEvent("click"); await page.waitForTimeout(1500); return await frame.locator('[data-testid="dep-link-menu"]').count(); };
  const setLagTo = async (want: number) => {
    for (let i = 0; i < 14; i++) {
      if (!(await frame.locator('[data-testid="dep-link-menu"]').count())) await openMenu();
      const cur = parseInt(((await frame.locator('[data-testid="lag-value"]').first().textContent().catch(() => "0")) || "0").trim(), 10) || 0;
      if (cur === want) break;
      await frame.locator(`[data-testid="${cur < want ? "lag-inc" : "lag-dec"}"]`).first().dispatchEvent("click");
      await page.waitForTimeout(1400);
    }
    console.log("LAG_NOW", ((await frame.locator('[data-testid="lag-value"]').first().textContent().catch(() => "")) || "").trim(), "want", want);
    await frame.locator("body").first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(3000);
  };
  const applyRows = async () => await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) =>
    els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })));
  const gate = async (tag: string) => {
    const t = await bodyText(frame);
    const badge = (t.match(/Save\s*\(\d+\)|Saved|Apply\s+\d+\s+change\w*/gi) || []).join(" | ");
    console.log(tag, "BADGES", badge);
    const n = await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).count();
    if (!n) { console.log(tag, "NO_APPLY_BUTTON — nothing staged"); await page.screenshot({ path: `${OUT}/f2-${tag}.png` }); return []; }
    await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click");
    await page.waitForTimeout(3500);
    const rows = await applyRows();
    console.log(tag, "APPLY_ROWS", JSON.stringify(rows, null, 1));
    await page.screenshot({ path: `${OUT}/f2-${tag}.png` });
    await frame.locator("button").filter({ hasText: /^Cancel$/ }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(2000);
    return rows;
  };
  const epicChip = async (tag: string) => {
    await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
    await page.waitForTimeout(3500);
    const chips = await frame.locator('[data-testid="table-derived-chip"]').evaluateAll((els: any[]) =>
      els.map((e) => `${e.getAttribute("data-key")}=${e.getAttribute("data-reason")}:${(e.textContent || "").replace(/\s+/g, " ").trim()}`));
    console.log(tag, "DERIVED_CHIPS", JSON.stringify(chips.filter((c: string) => c.startsWith("LZPT-18") || c.startsWith("LZPT-19") || c.startsWith("LZPT-20"))));
    console.log(tag, "EPIC_CHIP", chips.find((c: string) => c.startsWith(EPIC)) ?? "(none)");
    await page.screenshot({ path: `${OUT}/f2-${tag}-table.png` });
    await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
    await page.waitForTimeout(3500);
    await frame.locator(`[data-testid="gantt-bar"][data-key="${TO}"]`).first().scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(1200);
  };

  // ---- lag 5 ----
  await setLagTo(5);
  await showBars("LAG5");
  const r5 = await gate("LAG5");
  console.log("LAG5_EPIC_ROW", JSON.stringify(r5.filter((r: any) => r.key === EPIC)));
  await page.waitForTimeout(4000);                    // ≥3 s for the draft autosave
  console.log("LAG5_DRAFT", JSON.stringify(await draftHead()));
  await epicChip("LAG5");

  // ---- lag back to 0 ----
  await setLagTo(0);
  await showBars("LAG0");
  const r0 = await gate("LAG0");
  console.log("LAG0_ROWS_N", r0.length);
  console.log("LAG0_CARRIERS", JSON.stringify(await carriers()));
  const saveText = await frame.locator("button").filter({ hasText: /^Save|^Saved/ }).allTextContents().catch(() => []);
  console.log("LAG0_SAVE_BUTTON", JSON.stringify(saveText));
  console.log("LAG0_DRAFT", JSON.stringify(await draftHead()));
  await epicChip("LAG0");

  // ---- lag 5 then 3: a GENUINE move keeps the Epic ----
  await setLagTo(5); await page.waitForTimeout(2000);
  await setLagTo(3);
  await showBars("LAG3");
  const r3 = await gate("LAG3");
  console.log("LAG3_EPIC_ROW", JSON.stringify(r3.filter((r: any) => r.key === EPIC)));

  // ---- restore, and the bulk buffer round trip on a leaf ----
  await setLagTo(0);
  await showBars("RESTORED");
  const rr = await gate("RESTORED");
  console.log("RESTORED_ROWS_N", rr.length);
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(3500);
  console.log("LEAF_CHECKBOX", await frame.locator(`[title="Select ${LEAF}"]`).count());
  await frame.locator(`[title="Select ${LEAF}"]`).first().dispatchEvent("click").catch((e: any) => console.log("SEL_ERR", String(e).slice(0, 100)));
  await page.waitForTimeout(800);
  for (const v of ["Yes", "No", "Yes"]) {
    await frame.locator("button").filter({ hasText: new RegExp(`^${v}$`) }).last().dispatchEvent("click").catch((e: any) => console.log("BULK_ERR", v, String(e).slice(0, 80)));
    await page.waitForTimeout(3500);
    const t = await bodyText(frame);
    console.log("BULK", v, "BADGES", (t.match(/Save\s*\(\d+\)|Saved|Apply\s+\d+\s+change\w*/gi) || []).join(" | "),
      "| REFUSAL", JSON.stringify((t.match(/[^.·]*nothing was staged[^.·]*/i) || [])[0] ?? null));
  }
  await page.screenshot({ path: `${OUT}/f2-bulk.png` });
  await frame.locator("button").filter({ hasText: /^Clear$/ }).last().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(1500);
  if (await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).count()) {
    await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click");
    await page.waitForTimeout(3000);
    console.log("FINAL_REVIEW_ROWS", JSON.stringify(await applyRows()));
    await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(14000);
  }
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  console.log("FINAL_CARRIERS", JSON.stringify(await carriers()));
  console.log("FINAL_DRAFT", JSON.stringify(await draftHead()));
  await showBars("FINAL");
  await page.screenshot({ path: `${OUT}/f2-final.png` });
});
