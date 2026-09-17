// TESTER scratch — ADVERSARIAL: the Epic SUMMARY row inside a converged chain is not a
// chain member (assignmentByKey never names it) yet it carries "Start a new chain here".
// What does the cut do?
import { test } from "@playwright/test";
import { getTarget } from "../../config/targets";
import { assertLoggedIn, launchHarnessContext } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
const T = getTarget("lz-ppm-dashboard");
const OUT = process.env.SHOT_DIR || "/tmp";
test.describe.configure({ retries: 0, timeout: 600_000 });
const text = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";
test("cut at the parent row", async () => {
  const ctx = await launchHarnessContext();
  const page = await ctx.newPage();
  try {
    await page.setViewportSize({ width: 1700, height: 1100 });
    await assertLoggedIn(page);
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    await page.locator('iframe[data-testid="hosted-resources-iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
    const s = await enterForgeSurface(page, { surface: "custom" });
    const frame: any = (s as any).frame;
    await page.waitForTimeout(2000);
    await frame.getByText("LZPT Scenarios", { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(3500);
    await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
    await page.waitForTimeout(5000);
    const grp = frame.locator('[data-testid="gantt-group-select"] [role="combobox"]').first();
    if (!/AI structure/i.test(await grp.innerText().catch(() => ""))) {
      await grp.click(); await page.waitForTimeout(600);
      await frame.getByRole("option", { name: /AI structure/i }).first().click();
      await page.waitForTimeout(15_000);
    }
    await frame.locator('[data-testid="gantt-depth-issues"]').first().click({ timeout: 20_000 });
    await page.waitForTimeout(2000);
    const dump = async () => frame.locator('[data-testid="gantt-group-header"]').evaluateAll((els: any[]) => els.map((e) => ({
      gv: e.getAttribute("data-group-gv"), t: (e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120) })));
    console.log("HEADERS(start) =", JSON.stringify(await dump(), null, 1));
    // undo the existing split if present
    const derived = frame.locator('[data-testid="gantt-group-header"][data-group-gv="ch:da14607d~LZPT-194"]').first();
    if (await derived.count()) {
      await derived.locator('[data-testid="gantt-segment-menu-button"]').first().click();
      await page.waitForTimeout(600);
      await frame.locator('[data-testid="ai-segment-action-unsplit"]').first().click();
      await page.waitForTimeout(3000);
      console.log("HEADERS(after undo) =", JSON.stringify(await dump(), null, 1));
    }
    // now cut AT THE PARENT
    const btn = frame.locator('[data-testid="gantt-chain-cut-button"][data-key="LZPT-186"]').first();
    console.log("parent cut button count =", await btn.count());
    await btn.click({ timeout: 20_000 });
    await page.waitForTimeout(700);
    const menu = frame.locator('[data-testid="ai-chain-split-menu"]').first();
    console.log("MENU =", (await menu.innerText()).replace(/\s+/g, " "), "| canSplit=", await menu.getAttribute("data-can-split"));
    await page.screenshot({ path: `${OUT}/20-parent-menu.png` });
    await frame.locator('[data-testid="ai-chain-action-split"]').first().click({ timeout: 15_000 });
    await page.waitForTimeout(3500);
    console.log("HEADERS(after parent cut) =", JSON.stringify(await dump(), null, 1));
    await page.screenshot({ path: `${OUT}/21-after-parent-cut.png` });
    // is the menu still open / what does it say now on the same row?
    const seq = await frame.locator('[data-testid="gantt-group-header"], [data-gantt-row-key]')
      .evaluateAll((els: any[]) => els.map((e) => e.getAttribute("data-gantt-row-key") || `__grp__:${e.getAttribute("data-group-gv")}`));
    const gi = seq.indexOf("__grp__:ch:da14607d");
    const ms: string[] = []; for (let i = gi + 1; i < seq.length && !seq[i].startsWith("__grp__:"); i++) ms.push(seq[i]);
    console.log("ROWS under ch:da14607d =", ms.join(" > "));
    console.log("BODY snippet =", (await text(frame)).slice(0, 400).replace(/\s+/g, " "));
  } finally {
    await page.screenshot({ path: `${OUT}/29-final.png` }).catch(() => {});
    await ctx.close().catch(() => {});
  }
});
