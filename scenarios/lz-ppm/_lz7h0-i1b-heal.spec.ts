// LZ7H0 item 1b — THE HEAL and the TYPED duration (d3687b37), dev 7.17.0.
// (1) Pin A the old way through the hook (stored 2 vs _original 5), then open the
//     plan, make any edit, Save, Discard All -> A's stored duration is back to 5.
// (2) Type duration 4 on A -> review must read `Dur: 5 → 4d` (JIRA'S number as the
//     baseline, not the 2 that was pinned, and not the 2d span) -> Save -> stored 4
//     -> Discard All -> back to 5.
// Also screenshots the Permissions view for item 3 (the plan OWNER name).
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";
import * as fs from "fs";
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7h0";
const bed = JSON.parse(fs.readFileSync("/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz7h0/bed.json", "utf8"));
const { A, B, D, planId: PLAN_ID, planName: PLAN } = bed;
test.describe.configure({ retries: 0, timeout: 2_400_000 });
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const snap = async () => {
  const p: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  const iss = p.issues || [];
  const r: any = {};
  for (const i of iss) r[i.key] = `${i.startDate}|${i.dueDate} dur=${JSON.stringify(i.duration)} ORIGdur=${JSON.stringify(i._original?.duration)} cleared=${JSON.stringify(i.durationExplicitlyCleared)}`;
  return { r, savedEditsKey: p.meta && Object.prototype.hasOwnProperty.call(p.meta, "savedEdits") };
};

test("H1b: Discard heals a pinned row back to Jira's 5, and a typed 4 is measured against 5", async ({ page }) => {
  // ---- pin A the OLD way: stored 2, _original 5 ----
  console.log("PIN", JSON.stringify(await getTestState("lz-ppm", { what: "applyEdit", planId: PLAN_ID, key: A, field: "duration", value: "2" } as any)).slice(0, 200));
  console.log("PINNED", JSON.stringify(await snap(), null, 1));

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
  console.log("STAGED_ON_OPEN", ((await bodyText(frame)).match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/gi) || []).join(" | "));
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  const readTable = async (tag: string) => {
    const rows = await frame.locator('[data-testid="table-row"]').evaluateAll((els: any[]) =>
      els.map((e) => ({ k: e.getAttribute("data-row-key"), s: e.getAttribute("data-row-start"), d: e.getAttribute("data-row-due"), dur: e.getAttribute("data-row-duration"), derived: e.getAttribute("data-row-derived") })));
    console.log(tag, "TABLE", JSON.stringify(rows));
    return rows;
  };
  await readTable("PINNED_OPEN");
  await page.screenshot({ path: `${OUT}/h1b-00-pinned.png` });

  const editD = async (due: string) => {
    const trow = frame.locator(`[data-testid="table-row"][data-row-key="${D}"]`).first();
    await trow.scrollIntoViewIfNeeded().catch(() => {});
    const cells = trow.locator("div").filter({ hasText: /^Jun \d+$/ });
    await cells.nth(1).dispatchEvent("click");
    await page.waitForTimeout(1500);
    await frame.locator(`button[aria-label="${due}"]`).first().dispatchEvent("click");
    await page.waitForTimeout(4000);
  };
  const review = async (tag: string) => {
    if (!(await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).count())) { console.log(tag, "NO_APPLY_BUTTON"); return []; }
    await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click");
    await page.waitForTimeout(3500);
    const rows = await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })));
    console.log(tag, "REVIEW_ROWS", JSON.stringify(rows, null, 1));
    await page.screenshot({ path: `${OUT}/h1b-${tag}-review.png` });
    await frame.locator("button").filter({ hasText: /^Cancel$/ }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(2000);
    return rows;
  };
  const save = async (tag: string) => {
    const btn = frame.locator('[data-testid="plan-save-btn"]').first();
    console.log(tag, "SAVE_BEFORE", ((await btn.textContent().catch(() => "")) || "").trim());
    await btn.click({ timeout: 30000 }).catch((e: any) => console.log(tag, "SAVE_ERR", String(e).slice(0, 80)));
    for (let i = 0; i < 240; i++) { if ((await btn.getAttribute("data-save-state").catch(() => null)) === "saved") break; await page.waitForTimeout(250); }
    await page.waitForTimeout(8000);
    console.log(tag, "SAVE_AFTER", ((await btn.textContent().catch(() => "")) || "").trim());
    console.log(tag, "POSTSAVE", JSON.stringify(await snap()));
  };
  const discard = async (tag: string) => {
    if (!(await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).count())) { console.log(tag, "NOTHING_TO_DISCARD"); return; }
    await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click");
    await page.waitForTimeout(3000);
    await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click");
    await page.waitForTimeout(6000);
    console.log(tag, "POSTDISCARD_6s", JSON.stringify(await snap(), null, 1));
    await page.waitForTimeout(9000);
    console.log(tag, "POSTDISCARD_15s", JSON.stringify(await snap(), null, 1));
    console.log(tag, "STAGED_AFTER", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  };

  // ---------- (1) THE HEAL ----------
  await editD("2026-06-08");
  await readTable("AFTER_UNRELATED_EDIT");
  await review("HEAL");
  await save("HEAL");
  await discard("HEAL");
  await readTable("AFTER_HEAL");
  await page.screenshot({ path: `${OUT}/h1b-01-healed.png` });

  // ---------- (2) TYPE duration 4 on A ----------
  const arow = frame.locator(`[data-testid="table-row"][data-row-key="${A}"]`).first();
  await arow.scrollIntoViewIfNeeded().catch(() => {});
  const durCell = arow.locator("div").filter({ hasText: /^\d+d$/ }).first();
  console.log("DUR_CELL_COUNT", await arow.locator("div").filter({ hasText: /^\d+d$/ }).count(), "TEXT", await durCell.textContent().catch(() => null));
  await durCell.dispatchEvent("click");
  await page.waitForTimeout(1200);
  const input = arow.locator("input").first();
  console.log("INPUT_COUNT", await arow.locator("input").count());
  await input.fill("4").catch(async (e: any) => { console.log("FILL_ERR", String(e).slice(0, 80)); });
  await input.press("Enter").catch(() => {});
  await page.waitForTimeout(4000);
  const t = await bodyText(frame);
  console.log("TOAST_WARN", JSON.stringify((t.match(/[^.]*won't be stored[^.]*\.|Jira holds no Duration[^.]*\./i) || [])[0] ?? null));
  await readTable("AFTER_TYPED_4");
  await page.screenshot({ path: `${OUT}/h1b-02-typed4.png` });
  await review("TYPED");
  await save("TYPED");
  await readTable("AFTER_TYPED_SAVE");
  await discard("TYPED");
  await readTable("FINAL");
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await page.screenshot({ path: `${OUT}/h1b-03-final.png` });

  // ---------- item 3: the OWNER name on a surface ----------
  const perms = frame.getByRole("button", { name: /Permissions/i }).first();
  if (await perms.count()) { await perms.dispatchEvent("click"); await page.waitForTimeout(4000); }
  else { console.log("NO_PERMISSIONS_TAB"); }
  const pt = await bodyText(frame);
  console.log("PERMISSIONS_TEXT", pt.slice(0, 900));
  console.log("OWNER_NAME_PRESENT", /Mihai Perdum/.test(pt), "UNKNOWN_PRESENT", /Unknown/.test(pt));
  await page.screenshot({ path: `${OUT}/h1b-04-permissions.png` });
});
