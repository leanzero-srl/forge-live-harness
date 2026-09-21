// LZ790 item 2 (toast half) + item 6 (Re-index InfoTip text).
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
test.describe.configure({ retries: 0, timeout: 1_200_000 });

test("I2b/I6b: the drop toast names the field and the key, once; the Re-index tip", async ({ page }) => {
  await getTestState("lz-ppm", { what: "refreshPlan", planId: PLAN_ID });
  await getTestState("lz-ppm", { what: "clearDrafts", planId: PLAN_ID });
  const m0: any = await getTestState("lz-ppm", { what: "planMeta", planId: PLAN_ID });
  console.log("PRE editDrops", JSON.stringify(m0.meta?.editDrops));

  await page.setViewportSize({ width: 1400, height: 950 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  // plan cards render SKELETONS for ~10 s — wait for a real card, not a fixed pause.
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  for (let i = 0; i < 8; i++) {
    await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
    await page.waitForTimeout(3000);
    if (await frame.getByRole("button", { name: /^Table/i }).count()) break;
  }
  // The profile REMEMBERS the last view per plan (ppm.display.viewMode.<planId>);
  // Re-index only exists in an editing view. Never assume Gantt.
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);

  // ---- item 6b: the Re-index InfoTip, hovered by real mouse next to the button ----
  const rb = await frame.locator("button").filter({ hasText: /^Re-index$/ }).first().boundingBox();
  console.log("REINDEX_BOX", JSON.stringify(rb));
  await page.mouse.move(rb!.x + rb!.width + 11.5, rb!.y + rb!.height / 2);
  await page.waitForTimeout(1500);
  const tip = ((await frame.locator('[data-testid="lz-tooltip"]').first().textContent().catch(() => "")) || "").replace(/\s+/g, " ");
  console.log("TIP_LEN", tip.length);
  console.log("TIP_TEXT", tip);
  console.log("TIP_HAS", JSON.stringify({
    carry: /saved-but-unapplied edits are carried through the rebuild too, field by field/.test(tip),
    jiraWins: /Jira’s value wins, yours is dropped, and the app names the drop\./.test(tip),
    confirm: /Re-index asks you to confirm before it starts/.test(tip),
  }));
  await page.screenshot({ path: `${OUT}/i2b-00-tip.png` });
  await page.mouse.move(10, 500);

  // ---- the drop: one saved edit, then Jira changes THAT field ----
  await frame.locator("body").evaluate(() => {
    (window as any).__t = [];
    const seen = new Set<string>();
    new MutationObserver(() => { document.querySelectorAll('[data-testid="toast"]').forEach((n: any) => { const t = (n.textContent || "").replace(/\s+/g, " ").trim(); if (!seen.has(t)) { seen.add(t); (window as any).__t.push({ t, at: Date.now() }); } }); }).observe(document.body, { childList: true, subtree: true });
  });
  console.log("applyEdit", JSON.stringify(await getTestState("lz-ppm", { what: "applyEdit", planId: PLAN_ID, key: "WFH-3736", field: "dueDate", value: "2026-10-20" })));
  const t0 = Date.now();
  await setFields("WFH-3736", { duedate: "2026-10-21" });
  console.log("JIRA PUT Z due=2026-10-21 at", new Date().toISOString());
  let shot = false;
  for (let i = 0; i < 45; i++) {
    await page.waitForTimeout(1000);
    const toasts: any[] = await frame.locator("body").evaluate(() => (window as any).__t);
    if (!shot && toasts.some((x: any) => /Jira changed the/.test(x.t))) { await page.screenshot({ path: `${OUT}/i2b-01-droptoast.png` }); shot = true; console.log("DROP_TOAST_LATENCY_MS", Date.now() - t0); }
  }
  const toasts: any[] = await frame.locator("body").evaluate(() => (window as any).__t);
  console.log("ALL_TOASTS", JSON.stringify(toasts.map((x) => x.t), null, 1));
  console.log("DROP_TOAST_COUNT", toasts.filter((x) => /Jira changed the/.test(x.t)).length);
  const md: any = await getTestState("lz-ppm", { what: "planMeta", planId: PLAN_ID });
  console.log("META editDrops", JSON.stringify(md.meta?.editDrops));
  await page.screenshot({ path: `${OUT}/i2b-02-end.png` });
});
