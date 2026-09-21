// LZ770B B1-restore — put LZPT-209 back to 6d, Save (second latency sample), prove clean.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz770b";
const PLAN = "LZPT Scenarios";
const PLAN_ID = "plan-msq9dg8l-gz6mz1";
const LEAF = "LZPT-209";
test.describe.configure({ retries: 0, timeout: 900_000 });
const bodyText = async (f: any) => (await f.locator("body").textContent().catch(() => "")) || "";

test("B1-restore: LZPT-209 back to 6d, Saved, bed clean", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(6000);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);

  const row = frame.locator(`[data-testid="table-row"][data-row-key="${LEAF}"]`).first();
  await row.scrollIntoViewIfNeeded().catch(() => {});
  console.log("ROW_NOW", await row.getAttribute("data-row-start"), await row.getAttribute("data-row-due"), await row.getAttribute("data-row-duration"));
  await row.getByText(/^9d$/).first().click();
  await page.waitForTimeout(600);
  const input = row.locator('input[inputmode="numeric"]').first();
  await input.fill("6");
  await input.press("Enter");
  await page.waitForTimeout(2500);
  console.log("ROW_RESTORED", await row.getAttribute("data-row-start"), await row.getAttribute("data-row-due"), await row.getAttribute("data-row-duration"));

  const btn = frame.locator('[data-testid="plan-save-btn"]').first();
  console.log("SAVE_LABEL", (await btn.textContent())?.trim());
  const t0 = Date.now();
  await btn.click();
  let saveMs = -1;
  for (let i = 0; i < 120; i++) {
    if ((await btn.getAttribute("data-save-state").catch(() => null)) === "saved") { saveMs = Date.now() - t0; break; }
    await page.waitForTimeout(250);
  }
  console.log("SAVE_LATENCY_MS_2", saveMs);
  await page.waitForTimeout(3000);
  const t = (await bodyText(frame)).replace(/\s+/g, " ");
  console.log("STAGED_TEXT", /Apply \d+ change/.exec(t)?.[0] ?? "none", "|", /Save \(\d+\)/.exec(t)?.[0] ?? "none");
  await page.screenshot({ path: `${OUT}/b1-05-restored.png` });
  const p = await getTestState("lz-ppm", { what: "plan", planId: PLAN_ID });
  const s2 = p.meta?.summary || {};
  console.log("META_RESTORED", JSON.stringify({ finish: s2.finish, digest: s2.schedDigest, at: s2.at, ver: p.meta?.version, savedEdits: p.meta?.savedEdits?.at }));
  const edited = (p.issues || []).filter((i: any) => ["startDate", "dueDate", "duration", "buffer"].some((f) => String(i[f] ?? "") !== String(i._original?.[f] ?? "")));
  console.log("EDITED_ROWS_AFTER_RESTORE", edited.length, edited.map((i: any) => i.key).join(","));
  expect(edited.length, "LZPT holds no row that differs from Jira").toBe(0);
  expect(s2.finish).toBe("2026-10-12");
});
