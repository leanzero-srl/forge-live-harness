// TESTER (6.63.0): (a) probe the Table's KEY-column truncation under grouping,
// (b) prove the LZPT bed is restored, cold, after the whole 6.63.0 run.
import { test, expect } from "@playwright/test";
import { getTarget } from "../../config/targets";
import { assertLoggedIn, launchHarnessContext } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "plan-msq9dg8l-gz6mz1";
const OUT = process.env.SHOT_DIR || "/tmp";
test.describe.configure({ retries: 0, timeout: 1_200_000 });
const text = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";
const realFrame = async (f: any) => (await (await f.locator(":root").elementHandle())!.ownerFrame())!;

test("6.63.0 cold bed check + Table KEY column under grouping", async () => {
  const ctx = await launchHarnessContext();
  const page = await ctx.newPage();
  try {
    await page.setViewportSize({ width: 1700, height: 1100 });
    await assertLoggedIn(page);
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
    const s = await enterForgeSurface(page, { surface: "custom" });
    const frame: any = (s as any).frame;
    await page.waitForTimeout(2500);
    await frame.getByText("LZPT Scenarios", { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(5000);
    await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
    await page.waitForTimeout(8000);
    const rf = await realFrame(frame);
    const keyProbe = () => rf.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("[data-row-key]")).slice(0, 12);
      return rows.map((r: any) => {
        const a = r.querySelector("a");
        return { key: r.getAttribute("data-row-key"), shown: a ? a.textContent : null,
          truncated: a ? a.scrollWidth > a.clientWidth + 1 : null,
          cellKids: r.firstElementChild ? Array.from(r.children).slice(0, 3).map((c: any) => (c.innerText || "").trim().slice(0, 30)) : null };
      });
    });
    console.log("KEY COL (no grouping) =", JSON.stringify(await keyProbe()));
    await page.screenshot({ path: `${OUT}/40-table-nogroup.png` });
    const combos = await frame.locator('[role="combobox"]').evaluateAll((els: any[]) => els.map((e) => (e.innerText || "").trim()));
    console.log("COMBOS =", JSON.stringify(combos));
    const gi = combos.findIndex((c: string) => /grouping/i.test(c));
    await frame.locator('[role="combobox"]').nth(gi >= 0 ? gi : 0).click({ timeout: 25_000 });
    await page.waitForTimeout(900);
    const opts = await frame.locator('[role="option"]').evaluateAll((els: any[]) => els.map((e) => (e.innerText || "").trim()));
    console.log("GROUP OPTIONS =", JSON.stringify(opts));
    await frame.getByRole("option", { name: /^Status$/i }).first().click({ timeout: 20_000 }).catch(async () => {
      await frame.getByRole("option", { name: /Status/i }).first().click({ timeout: 20_000 });
    });
    await page.waitForTimeout(6000);
    console.log("KEY COL (grouped by Status) =", JSON.stringify(await keyProbe()));
    await page.screenshot({ path: `${OUT}/41-table-group-status.png` });
    // back to no grouping so the view pref is not left changed
    await frame.locator('[role="combobox"]').nth(gi >= 0 ? gi : 0).click({ timeout: 25_000 });
    await page.waitForTimeout(800);
    await frame.getByRole("option", { name: /No grouping/i }).first().click({ timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // ---- COLD BED ----
    const body = await text(frame);
    const staged = /Apply \d+ change|Save \(\d+\)/i.test(body);
    console.log("STAGED_AFTER_CLEANUP =", staged);
    console.log("HEADER LINE =", (body.split("\n").slice(0, 8).join(" | ")));
    await page.screenshot({ path: `${OUT}/42-bed-cold.png` });
    expect(staged).toBe(false);
  } finally { await ctx.close(); }
});
