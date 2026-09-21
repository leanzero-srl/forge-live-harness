// LZ7F0 item 2, last bullet: the `_passBase` memory is TAB-LOCAL. Set lag 5,
// RELOAD, then set the lag back to 0 — does the Epic stay staged, and what does
// the user see? Restores the lag to 0 and discards whatever is left.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";
import * as fs from "fs";
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7f0";
const PLAN = "LZPT Scenarios", PLAN_ID = "plan-msq9dg8l-gz6mz1";
const EPIC = "LZPT-187", FROM = "LZPT-199", TO = "LZPT-200";
const tok = JSON.parse(fs.readFileSync("/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz7f0/token.json", "utf8"));
test.describe.configure({ retries: 0, timeout: 2_400_000 });
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const F = ["startDate", "dueDate", "duration", "buffer"];
const carriers = async () => {
  const p: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  return (p.issues || []).filter((i: any) => F.some((f) => String(i[f] ?? "") !== String(i._original?.[f] ?? ""))).map((i: any) => i.key);
};
const draftHead = async () => {
  const url = new URL(tok.url); url.searchParams.set("resource", "draft"); url.searchParams.set("planId", PLAN_ID);
  const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${tok.token}` } });
  return (await r.text()).slice(0, 200);
};

test("F2b: reload between lag 5 and lag 0", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  const open = async (tag: string) => {
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
    const s = await enterForgeSurface(page, { surface: "custom" });
    const f: any = s.kind === "custom" ? s.frame : null; if (!f) throw new Error("no frame");
    await page.waitForTimeout(9000);
    await f.getByText(PLAN, { exact: true }).first().click().catch(() => {});
    await page.waitForTimeout(10000);
    if (!/Gantt/i.test(await bodyText(f))) await f.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
    await page.waitForTimeout(6000);
    await f.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
    await page.waitForTimeout(5000);
    await f.locator(`[data-testid="gantt-bar"][data-key="${TO}"]`).first().scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(1500);
    console.log(tag, "BADGES", ((await bodyText(f)).match(/Save\s*\(\d+\)|Saved|Apply\s+\d+\s+change\w*/gi) || []).join(" | "));
    return f;
  };
  const barAttr = async (f: any, k: string) => {
    const b = f.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first();
    if (!(await b.count())) return "ABSENT";
    return `${await b.getAttribute("data-bar-start")}..${await b.getAttribute("data-bar-due")}`;
  };
  const setLagTo = async (f: any, want: number) => {
    const arrow = f.locator(`[data-testid="dep-arrow-hit"][data-link="${FROM}-${TO}"]`).first();
    for (let i = 0; i < 14; i++) {
      if (!(await f.locator('[data-testid="dep-link-menu"]').count())) { await arrow.dispatchEvent("click"); await page.waitForTimeout(1500); }
      const cur = parseInt(((await f.locator('[data-testid="lag-value"]').first().textContent().catch(() => "0")) || "0").trim(), 10) || 0;
      if (cur === want) break;
      await f.locator(`[data-testid="${cur < want ? "lag-inc" : "lag-dec"}"]`).first().dispatchEvent("click");
      await page.waitForTimeout(1400);
    }
    console.log("LAG_NOW", ((await f.locator('[data-testid="lag-value"]').first().textContent().catch(() => "")) || "").trim(), "want", want);
    await f.locator("body").first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(3000);
  };
  const rows = async (f: any, tag: string) => {
    const n = await f.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).count();
    if (!n) { console.log(tag, "NO_APPLY_BUTTON"); return []; }
    await f.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click");
    await page.waitForTimeout(3500);
    const r = await f.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ") })));
    console.log(tag, "APPLY_ROWS", JSON.stringify(r));
    await page.screenshot({ path: `${OUT}/f2b-${tag}.png` });
    await f.locator("button").filter({ hasText: /^Cancel$/ }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(2000);
    return r;
  };

  let f = await open("OPEN");
  console.log("OPEN_EPIC", await barAttr(f, EPIC), "200", await barAttr(f, TO), "carriers", JSON.stringify(await carriers()));
  await setLagTo(f, 5);
  console.log("LAG5_EPIC", await barAttr(f, EPIC), "200", await barAttr(f, TO));
  await rows(f, "LAG5");
  await page.waitForTimeout(5000);
  console.log("LAG5_DRAFT", await draftHead());

  // ---- RELOAD ----
  f = await open("AFTER_RELOAD");
  console.log("RELOAD_EPIC", await barAttr(f, EPIC), "200", await barAttr(f, TO), "carriers", JSON.stringify(await carriers()));
  await rows(f, "AFTER_RELOAD");

  await setLagTo(f, 0);
  console.log("LAG0_EPIC", await barAttr(f, EPIC), "200", await barAttr(f, TO));
  console.log("LAG0_BADGES", ((await bodyText(f)).match(/Save\s*\(\d+\)|Saved|Apply\s+\d+\s+change\w*/gi) || []).join(" | "));
  const after = await rows(f, "LAG0_AFTER_RELOAD");
  console.log("LAG0_EPIC_STILL_STAGED", after.some((r: any) => r.key === EPIC));
  await page.screenshot({ path: `${OUT}/f2b-lag0-screen.png` });

  // ---- clean up ----
  if (await f.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).count()) {
    await f.locator("button").filter({ hasText: /Apply\s+\d+\s+[Cc]hange/ }).first().dispatchEvent("click");
    await page.waitForTimeout(3000);
    await f.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click").catch((e: any) => console.log("DISCARD_ERR", String(e).slice(0, 100)));
    await page.waitForTimeout(14000);
  }
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(f)));
  console.log("FINAL_CARRIERS", JSON.stringify(await carriers()));
  console.log("FINAL_EPIC", await barAttr(f, EPIC), "200", await barAttr(f, TO));
  console.log("FINAL_DRAFT", await draftHead());
});
