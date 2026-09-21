// LZ790 items 2 (drop toast) + 6 (toast anchor, Re-index tip & confirm) on the LZ790 bed.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { setFields } from "../../data/jira-build.mjs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz790shots";
const PLAN = "LZ790 retest bed";
const PLAN_ID = "plan-test-muas0boj-ttkdmu";
test.describe.configure({ retries: 0, timeout: 900_000 });
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");

async function geometry(frame: any) {
  const band = await frame.locator(".lz-plan-toolbar").first().boundingBox().catch(() => null);
  const toast = await frame.locator('[data-testid="toast"]').first().boundingBox().catch(() => null);
  const save = await frame.locator('[data-testid="plan-save-btn"]').first().boundingBox().catch(() => null);
  const reidx = await frame.locator("button").filter({ hasText: /^Re-index$/ }).first().boundingBox().catch(() => null);
  const apply = await frame.locator("button").filter({ hasText: /Apply\s+\d+\s+change/ }).first().boundingBox().catch(() => null);
  const overlaps = (a: any, b: any) => !!a && !!b && !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
  return { band, toast, save, reidx, apply, coversSave: overlaps(toast, save), coversReindex: overlaps(toast, reidx), coversApply: overlaps(toast, apply), toastTopMinusBandBottom: toast && band ? Math.round(toast.y - (band.y + band.height)) : null };
}

test("I2/I6: drop toast copy + anchor at 1100 and 1400; re-index tip and confirm", async ({ page }) => {
  // clean slate: a whole-plan rebuild clears meta.editDrops and meta.savedEdits
  console.log("PRE refresh", JSON.stringify(await getTestState("lz-ppm", { what: "refreshPlan", planId: PLAN_ID }).then((r: any) => ({ ok: r.ok }))));
  const m0: any = await getTestState("lz-ppm", { what: "planMeta", planId: PLAN_ID });
  console.log("PRE meta editDrops", JSON.stringify(m0.meta?.editDrops), "savedEdits", JSON.stringify(m0.meta?.savedEdits));

  await page.setViewportSize({ width: 1100, height: 900 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(7000);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  console.log("OPENED", (await bodyText(frame)).slice(0, 160));
  await page.screenshot({ path: `${OUT}/i26-00-open-1100.png` });

  // ---- item 6b: the Re-index InfoTip ----
  const tipBtn = frame.locator("button").filter({ hasText: /^Re-index$/ }).first();
  const tipBox = await tipBtn.boundingBox();
  console.log("REINDEX_BTN_BOX", JSON.stringify(tipBox));
  const info = frame.locator('[data-testid="plan-toolbar"] , .lz-plan-toolbar').first().locator("xpath=.//*[text()='?']").first();
  const infoBox = await info.boundingBox().catch(() => null);
  console.log("INFOTIP_BOX", JSON.stringify(infoBox));
  if (infoBox) { await page.mouse.move(infoBox.x + infoBox.width / 2, infoBox.y + infoBox.height / 2); await page.waitForTimeout(1200); }
  const tipText = await bodyText(frame);
  const tipHas = {
    carry: /saved-but-unapplied edits are carried through the rebuild too, field by field/.test(tipText),
    jiraWins: /Jira’s value wins, yours is dropped, and the app names the drop/.test(tipText),
    confirm: /Re-index asks you to confirm before it starts/.test(tipText),
  };
  console.log("REINDEX_TIP_HAS", JSON.stringify(tipHas));
  await page.screenshot({ path: `${OUT}/i26-01-reindex-tip.png` });

  // ---- a SAVED edit through the UI (Table), then the Jira change that drops it ----
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  const row = frame.locator('[data-testid="table-row"][data-row-key="WFH-3736"]').first();
  await row.scrollIntoViewIfNeeded().catch(() => {});
  console.log("Z_ROW_BEFORE", await row.getAttribute("data-row-start"), await row.getAttribute("data-row-due"));
  await row.locator('[data-testid="cell-due"], td').filter({ hasText: /\w{3}\s+\d+/ }).first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(800);
  // fall back: applyEdit through the hook is a real stored saved edit too
  let savedViaUi = false;
  const btn = frame.locator('[data-testid="plan-save-btn"]').first();
  if ((await btn.getAttribute("data-has-changes").catch(() => "0")) === "1") { await btn.click(); savedViaUi = true; await page.waitForTimeout(4000); }
  if (!savedViaUi) {
    console.log("UI edit did not stage — using the hook's applyEdit (same stored shape)");
    console.log("applyEdit", JSON.stringify(await getTestState("lz-ppm", { what: "applyEdit", planId: PLAN_ID, key: "WFH-3736", field: "dueDate", value: "2026-10-14" })));
  }

  // ---- item 6c: Re-index CONFIRM now that a row carries a saved edit ----
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s2 = await enterForgeSurface(page, { surface: "custom" });
  const f2: any = s2.kind === "custom" ? s2.frame : null;
  await page.waitForTimeout(9000);
  await f2.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  await f2.locator("button").filter({ hasText: /^Re-index$/ }).first().dispatchEvent("click");
  await page.waitForTimeout(2000);
  const confirmText = await bodyText(f2);
  const cm = confirmText.match(/[^.]*carried through the rebuild[^?]*\?/);
  console.log("REINDEX_CONFIRM_MATCHES_RULE", /Jira’s value wins, yours is dropped, and the app names the drop\./.test(confirmText));
  console.log("REINDEX_CONFIRM_SNIP", cm ? cm[0].slice(0, 400) : "(no confirm sentence found)");
  await page.screenshot({ path: `${OUT}/i26-02-reindex-confirm.png` });
  await f2.locator("button").filter({ hasText: /^Cancel$/i }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(1500);

  // ---- item 2: the DROP toast, at 1100 px ----
  await f2.locator("body").evaluate((b: any) => {
    (window as any).__toasts = [];
    new MutationObserver(() => { document.querySelectorAll('[data-testid="toast"]').forEach((n: any) => { const t = (n.textContent || "").replace(/\s+/g, " ").trim(); if (!(window as any).__toasts.includes(t)) (window as any).__toasts.push(t); }); }).observe(document.body, { childList: true, subtree: true });
  });
  await setFields("WFH-3736", { duedate: "2026-10-16" });
  console.log("JIRA PUT Z due=2026-10-16 at", new Date().toISOString());
  let geo: any = null;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(700);
    if (await f2.locator('[data-testid="toast"]').count()) { geo = await geometry(f2); await page.screenshot({ path: `${OUT}/i26-03-toast-1100.png` }); break; }
  }
  console.log("TOASTS_1100", JSON.stringify(await f2.locator("body").evaluate(() => (window as any).__toasts)));
  console.log("GEOMETRY_1100", JSON.stringify(geo));
  const md: any = await getTestState("lz-ppm", { what: "planMeta", planId: PLAN_ID });
  console.log("META editDrops", JSON.stringify(md.meta?.editDrops));

  // ---- 1400 px ----
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.waitForTimeout(2500);
  await f2.locator("body").evaluate((b: any) => { (window as any).__toasts2 = []; new MutationObserver(() => { document.querySelectorAll('[data-testid="toast"]').forEach((n: any) => { const t = (n.textContent || "").replace(/\s+/g, " ").trim(); if (!(window as any).__toasts2.includes(t)) (window as any).__toasts2.push(t); }); }).observe(document.body, { childList: true, subtree: true }); });
  console.log("applyEdit Y due", JSON.stringify(await getTestState("lz-ppm", { what: "applyEdit", planId: PLAN_ID, key: "WFH-3735", field: "dueDate", value: "2026-10-13" })));
  await setFields("WFH-3735", { duedate: "2026-10-15" });
  console.log("JIRA PUT Y due=2026-10-15 at", new Date().toISOString());
  let geo2: any = null;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(700);
    if (await f2.locator('[data-testid="toast"]').count()) { geo2 = await geometry(f2); await page.screenshot({ path: `${OUT}/i26-04-toast-1400.png` }); break; }
  }
  console.log("TOASTS_1400", JSON.stringify(await f2.locator("body").evaluate(() => (window as any).__toasts2)));
  console.log("GEOMETRY_1400", JSON.stringify(geo2));
  const md2: any = await getTestState("lz-ppm", { what: "planMeta", planId: PLAN_ID });
  console.log("META editDrops 2", JSON.stringify(md2.meta?.editDrops));
  await page.screenshot({ path: `${OUT}/i26-05-final.png` });
});
