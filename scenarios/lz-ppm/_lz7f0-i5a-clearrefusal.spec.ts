// LZ7F0 item 5a — the COMPOSED clear refusal (ae103ccc + 2d703bc7), live on LZPT.
// LZPT-215 "EDGE long-run" is 2026-05-04..2026-06-30 with duration NULL in Jira;
// the browser measures 42 working days (counted independently: 42) and every LZPT
// row is `field-missing` for Duration, so BOTH facts hold and the sentence must
// COMPOSE. Gesture: open the DateEditor, BLANK the Duration input (not "Clear",
// which states all three schedule fields), press Apply.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7f0";
const PLAN = "LZPT Scenarios", PLAN_ID = "plan-msq9dg8l-gz6mz1", ROW = "LZPT-215";
const EXPECTED = "Jira holds no Duration for this issue — the 42d shown is measured from its dates, so there is nothing to clear, and no Duration field here to store one either.";
test.describe.configure({ retries: 0, timeout: 1_800_000 });
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const F = ["startDate", "dueDate", "duration", "buffer"];
const carriers = async () => {
  const p: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  return (p.issues || []).filter((i: any) => F.some((f) => String(i[f] ?? "") !== String(i._original?.[f] ?? ""))).map((i: any) => i.key);
};

test("F5a: the clear refusal composes both facts", async ({ page }) => {
  console.log("PRE_CARRIERS", JSON.stringify(await carriers()));
  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  const real: any = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  await page.waitForTimeout(9000);
  console.log("SHELL_REV", ((await bodyText(frame)).match(/rev\s*v?([\d.]+)/) || [])[1]);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(10000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  console.log("STAGED_ON_OPEN", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  const bar = frame.locator(`[data-testid="gantt-bar"][data-key="${ROW}"]`).first();
  await bar.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(1200);
  console.log("BAR", await bar.getAttribute("data-bar-start"), await bar.getAttribute("data-bar-due"));
  // capture toasts as they appear (4 s auto-dismiss, no testid)
  await real.evaluate(() => {
    (window as any).__toasts = [];
    new MutationObserver((ms) => { for (const m of ms) for (const n of Array.from(m.addedNodes) as any[]) {
      if (n.nodeType === 1 && (n.className || "").toString().includes("toast")) (window as any).__toasts.push((n.textContent || "").replace(/\s+/g, " ").trim());
      if (n.nodeType === 1) for (const t of Array.from(n.querySelectorAll?.(".toast-enter, [class*=toast]") || []) as any[]) (window as any).__toasts.push((t.textContent || "").replace(/\s+/g, " ").trim());
    } }).observe(document.body, { childList: true, subtree: true });
  });
  await bar.dblclick().catch((e: any) => console.log("DBL_ERR", String(e).slice(0, 90)));
  await page.waitForTimeout(2500);
  const ed = frame.locator('[data-testid="date-editor"]');
  console.log("EDITOR_COUNT", await ed.count());
  console.log("EDITOR_TEXT", (await ed.first().textContent().catch(() => "")).replace(/\s+/g, " ").slice(0, 400));
  const dur = ed.locator('input[inputmode="numeric"]').first();
  console.log("DURATION_VALUE_BEFORE", await dur.inputValue().catch(() => "(none)"));
  await dur.fill("");
  await page.waitForTimeout(1200);
  console.log("DURATION_VALUE_AFTER", await dur.inputValue().catch(() => "(none)"));
  await page.screenshot({ path: `${OUT}/f5a-00-editor.png` });
  await ed.locator('[data-testid="dateeditor-apply"]').first().dispatchEvent("click").catch((e: any) => console.log("APPLY_ERR", String(e).slice(0, 90)));
  await page.waitForTimeout(2500);
  const toasts: string[] = await real.evaluate(() => (window as any).__toasts || []);
  console.log("TOASTS", JSON.stringify([...new Set(toasts)]));
  const body = await bodyText(frame);
  const seen = (body.match(/Jira holds no Duration[^]*?(either\.|clear\.)/) || [])[0] || null;
  console.log("TOAST_IN_BODY", JSON.stringify(seen));
  console.log("EXACT_MATCH", [...new Set(toasts)].some((t) => t.includes(EXPECTED)) || (seen !== null && seen === EXPECTED));
  console.log("EXPECTED   ", JSON.stringify(EXPECTED));
  await page.screenshot({ path: `${OUT}/f5a-01-toast.png` });
  console.log("STAGED_AFTER", ((await bodyText(frame)).match(/Save\s*\(\d+\)|Saved|Apply\s+\d+\s+change\w*/gi) || []).join(" | "));
  console.log("BAR_AFTER", await bar.getAttribute("data-bar-start").catch(() => "ABSENT"), await bar.getAttribute("data-bar-due").catch(() => "ABSENT"));
  console.log("FINAL_CARRIERS", JSON.stringify(await carriers()));
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
});
