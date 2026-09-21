// LZ790 item 3b — the REST holiday route: does an OPEN client reflect it?
// (KNOWN FAIL expected on 7.8.0: the REST router runs in a webtrigger and the
// resolver plane cannot publish. Measure, do not assume.)
import { test } from "../../fixtures/forge";
import fs from "node:fs";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz790shots";
const PLAN = "LZ790 retest bed";
const PLAN_ID = "plan-test-muas0boj-ttkdmu";
test.describe.configure({ retries: 0, timeout: 1_200_000 });

test("I3b: REST holiday -> open client", async ({ page }) => {
  const tok = JSON.parse(fs.readFileSync("/tmp/lz790tok", "utf8"));
  await page.setViewportSize({ width: 1500, height: 950 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  for (let i = 0; i < 8; i++) { await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {}); await page.waitForTimeout(3000); if (await frame.getByRole("button", { name: /^Table/i }).count()) break; }
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  await frame.locator("body").evaluate(() => { (window as any).__t = []; const seen = new Set<string>(); new MutationObserver(() => { document.querySelectorAll('[data-testid="toast"]').forEach((n: any) => { const t = (n.textContent || "").replace(/\s+/g, " ").trim(); if (!seen.has(t)) { seen.add(t); (window as any).__t.push(t); } }); }).observe(document.body, { childList: true, subtree: true }); });
  const eDue = async () => frame.locator('[data-testid="table-row"][data-row-key="WFH-3733"]').first().getAttribute("data-row-due").catch(() => null);
  const before = await eDue();
  console.log("A: E due before =", before);

  const res = await fetch(`${tok.u}?resource=schedule&action=holiday&planId=${PLAN_ID}`, {
    method: "POST", headers: { Authorization: `Bearer ${tok.t}`, "Content-Type": "application/json" },
    body: JSON.stringify({ date: "2026-11-18", name: "LZ790 REST holiday" }),
  });
  const body = await res.text();
  const t0 = Date.now();
  console.log("REST holiday ->", res.status, body.slice(0, 400));

  let ms = -1, after = before;
  for (let i = 0; i < 90; i++) { await page.waitForTimeout(1000); const n = await eDue(); if (n !== before) { after = n; ms = Date.now() - t0; break; } }
  console.log("A: E due", before, "->", after, "| latency ms", ms);
  console.log("A: toasts =", JSON.stringify(await frame.locator("body").evaluate(() => (window as any).__t)));
  const m: any = await getTestState("lz-ppm", { what: "planMeta", planId: PLAN_ID });
  console.log("META holidayYears", JSON.stringify(m.meta?.holidayYears), "summary.finish", m.meta?.summary?.finish, "at", m.meta?.summary?.at);
  await page.screenshot({ path: `${OUT}/i3b-01-rest-holiday.png` });
  // and after a manual reload, does the client see the holiday at all?
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  const s2 = await enterForgeSurface(page, { surface: "custom" });
  const f2: any = s2.kind === "custom" ? s2.frame : null;
  await f2.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 90_000 }).catch(() => {});
  for (let i = 0; i < 8; i++) { await f2.getByText(PLAN, { exact: true }).first().click().catch(() => {}); await page.waitForTimeout(3000); if (await f2.getByRole("button", { name: /^Table/i }).count()) break; }
  await f2.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  console.log("A after RELOAD: E due =", await f2.locator('[data-testid="table-row"][data-row-key="WFH-3733"]').first().getAttribute("data-row-due").catch(() => null));
  await page.screenshot({ path: `${OUT}/i3b-02-after-reload.png` });
});
