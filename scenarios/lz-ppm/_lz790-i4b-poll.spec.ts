// LZ790 item 4b — with the realtime plane CUT, the 60 s fallback poll must raise
// the SAME standing notice.
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

test("I4b: realtime cut -> the 60 s poll raises the behind-Jira notice", async ({ page }) => {
  console.log("PRE refresh", JSON.stringify(await getTestState("lz-ppm", { what: "refreshPlan", planId: PLAN_ID }).then((r: any) => ({ ok: r.ok }))));
  await page.setViewportSize({ width: 1400, height: 950 });
  let cut = 0;
  await page.routeWebSocket(/subscriptions|realtime|ably|pusher/i, (ws: any) => { cut += 1; console.log("WS_CUT", ws.url().slice(0, 140)); ws.close(); });
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
  // unsaved edit
  const row = frame.locator('[data-testid="table-row"][data-row-key="WFH-3734"]').first();
  await row.scrollIntoViewIfNeeded().catch(() => {});
  await row.getByText(/^\d+d$/).first().click({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(700);
  const input = row.locator('input[inputmode="numeric"]').first();
  await input.fill("9"); await input.press("Enter");
  await page.waitForTimeout(2500);
  const btn = frame.locator('[data-testid="plan-save-btn"]').first();
  console.log("UNSAVED", await btn.getAttribute("data-has-changes"), (await btn.textContent())?.trim(), "| websockets cut:", cut);

  const t0 = Date.now();
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "POST") return;
    const d = r.postData() || "";
    const m = d.match(/"(getNotifications|getPlanStatus|getPlan|getPlanMeta|subscribe\w*)"/);
    if (m) calls.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${m[1]}`);
  });
  await setFields("WFH-3730", { duedate: "2026-10-22" });
  console.log("JIRA PUT B due=2026-10-22 at", new Date().toISOString());
  const status = frame.locator('[data-testid="plan-refresh-status"]');
  let ms = -1, txt = "";
  for (let i = 0; i < 150; i++) {
    await page.waitForTimeout(1000);
    if (await status.count()) { txt = ((await status.textContent()) || "").replace(/\s+/g, " ").trim(); ms = Date.now() - t0; break; }
  }
  console.log("POLL_NOTICE_LATENCY_MS", ms);
  console.log("POLL_NOTICE_TEXT", txt);
  console.log("WS_CUT_COUNT", cut);
  console.log("RESOLVER_CALLS", JSON.stringify(calls));
  await page.screenshot({ path: `${OUT}/i4b-01-poll-notice.png` });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
});
