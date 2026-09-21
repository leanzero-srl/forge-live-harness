// LZ7C0 exit proof — a COLD open of LZPT Scenarios: nothing staged, 70 rows, the
// derived 42d back on LZPT-215, LZPT-190 undated, no reports left on the plan.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7c0";
const PLAN = "LZPT Scenarios";
const PLAN_ID = "plan-msq9dg8l-gz6mz1";
test.describe.configure({ retries: 0, timeout: 900_000 });
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");

test("C7: cold open — the bed is clean", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  console.log("SHELL_REV", ((await bodyText(frame)).match(/rev\s*v?([\d.]+)/) || [])[1]);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(9000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(7000);
  console.log("STAGED_ON_COLD_OPEN", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(7000);
  const rows = await frame.locator('[data-testid="table-row"]').count();
  console.log("TABLE_ROWS", rows);
  for (const k of ["LZPT-215", "LZPT-216", "LZPT-190"]) {
    const r = frame.locator(`[data-testid="table-row"][data-row-key="${k}"]`).first();
    await r.scrollIntoViewIfNeeded().catch(() => {});
    console.log(k, await r.getAttribute("data-row-start"), await r.getAttribute("data-row-due"), JSON.stringify(await r.getAttribute("data-row-duration")), "|", ((await r.textContent()) || "").replace(/\s+/g, " ").slice(0, 120));
  }
  await page.screenshot({ path: `${OUT}/c7-00-table.png`, fullPage: false });
  await frame.getByRole("button", { name: /^Planning$/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await frame.getByRole("button", { name: /Sponsor reports?/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  const rep = await bodyText(frame);
  console.log("REPORTS_HAS_LZ7C0", /LZ7C0/.test(rep));
  console.log("REPORTS_SNIP", rep.slice(0, 500));
  await page.screenshot({ path: `${OUT}/c7-01-reports.png`, fullPage: true });
  const p: any = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  const F = ["startDate", "dueDate", "duration", "buffer"];
  console.log("HOOK n", (p.issues || []).length,
    "carriers", JSON.stringify((p.issues || []).filter((i: any) => F.some((f) => String(i[f] ?? "") !== String(i._original?.[f] ?? ""))).map((i: any) => i.key)),
    "dec", JSON.stringify((p.issues || []).filter((i: any) => i.durationExplicitlyCleared === true).map((i: any) => i.key)),
    "savedEditsKey", p.meta && Object.prototype.hasOwnProperty.call(p.meta, "savedEdits"),
    "milestones", JSON.stringify(p.meta?.milestones), "protection", p.meta?.protectionEnabled);
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
});
