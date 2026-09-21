// LZ790 item 4 — the STANDING behind-Jira notice under an UNSAVED edit, and the
// 60 s poll fallback with realtime cut. Also records the duration column so a
// blank derived duration on an edited row cannot hide.
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
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const durs = async (f: any) => f.locator('[data-testid="table-row"]').evaluateAll((els: any[]) => els.map((e) => ({ k: e.getAttribute("data-row-key"), s: e.getAttribute("data-row-start"), d: e.getAttribute("data-row-due"), du: e.getAttribute("data-row-duration") })));

test("I4: standing behind-Jira notice, survives 60 s, refresh keeps edits; poll raises it with realtime cut", async ({ page }) => {
  console.log("PRE refresh", JSON.stringify(await getTestState("lz-ppm", { what: "refreshPlan", planId: PLAN_ID }).then((r: any) => ({ ok: r.ok }))));
  await page.setViewportSize({ width: 1400, height: 950 });
  const wsUrls: string[] = [];
  page.on("websocket", (ws) => { if (!wsUrls.includes(ws.url())) { wsUrls.push(ws.url()); console.log("WS", ws.url().slice(0, 160)); } });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(7000);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  console.log("ROWS_BASELINE", JSON.stringify(await durs(frame)));
  await page.screenshot({ path: `${OUT}/i4-00-baseline.png` });

  // ---- an UNSAVED edit: type a duration on X ----
  const row = frame.locator('[data-testid="table-row"][data-row-key="WFH-3734"]').first();
  await row.scrollIntoViewIfNeeded().catch(() => {});
  await row.getByText(/^5d$/).first().click({ timeout: 10000 }).catch(async () => { await row.getByText(/^5d$/).first().dispatchEvent("click"); });
  await page.waitForTimeout(700);
  const input = row.locator('input[inputmode="numeric"]').first();
  await input.fill("8"); await input.press("Enter");
  await page.waitForTimeout(2500);
  const btn = frame.locator('[data-testid="plan-save-btn"]').first();
  console.log("UNSAVED_STATE", await btn.getAttribute("data-has-changes"), (await btn.textContent())?.trim());
  console.log("ROWS_AFTER_UNSAVED_EDIT", JSON.stringify(await durs(frame)));
  await page.screenshot({ path: `${OUT}/i4-01-unsaved.png` });

  // ---- Jira moves a DIFFERENT row ----
  const t0 = Date.now();
  await setFields("WFH-3731", { duedate: "2026-10-28" });
  console.log("JIRA PUT C due=2026-10-28 at", new Date().toISOString());
  const status = frame.locator('[data-testid="plan-refresh-status"]');
  let noticeMs = -1, noticeText = "";
  for (let i = 0; i < 180; i++) {
    await page.waitForTimeout(1000);
    if (await status.count()) { noticeText = ((await status.textContent()) || "").replace(/\s+/g, " ").trim(); noticeMs = Date.now() - t0; break; }
  }
  console.log("NOTICE_LATENCY_MS", noticeMs);
  console.log("NOTICE_TEXT", noticeText);
  await page.screenshot({ path: `${OUT}/i4-02-notice.png` });

  // ---- it must STAND past 60 s ----
  await page.waitForTimeout(65_000);
  const still = await status.count() ? ((await status.textContent()) || "").replace(/\s+/g, " ").trim() : "(gone)";
  console.log("NOTICE_AT_+65s", still);
  console.log("UNSAVED_STILL", await btn.getAttribute("data-has-changes"), (await btn.textContent())?.trim());
  await page.screenshot({ path: `${OUT}/i4-03-notice-65s.png` });

  // ---- click Refresh (keeps your edits) ----
  await frame.locator("button").filter({ hasText: /^Refresh \(keeps your edits\)$/ }).first().dispatchEvent("click");
  await page.waitForTimeout(12000);
  console.log("ROWS_AFTER_REFRESH", JSON.stringify(await durs(frame)));
  console.log("NOTICE_AFTER_REFRESH", await status.count() ? ((await status.textContent()) || "").replace(/\s+/g, " ").trim() : "(cleared)");
  console.log("UNSAVED_AFTER_REFRESH", await btn.getAttribute("data-has-changes"), (await btn.textContent())?.trim());
  await page.screenshot({ path: `${OUT}/i4-04-after-refresh.png` });
  console.log("WS_URLS", JSON.stringify(wsUrls));

  // ---- discard the unsaved edit (reload without saving) ----
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
});
