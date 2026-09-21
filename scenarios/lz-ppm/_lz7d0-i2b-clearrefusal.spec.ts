// LZ7D0 follow-up — is the duration CLEAR on LZPT refused with a SENTENCE, or
// dropped in silence? `editRefusal` should fire for a duration-only gesture on a
// plan whose project has no PPM Duration field (writability byReason
// field-missing: 140) and toast describeOutcome's wording. Read-only: a refused
// gesture stages nothing.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7d0";
const PLAN = "LZPT Scenarios";
const ROW = "LZPT-216";
test.describe.configure({ retries: 0, timeout: 900_000 });
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");

test("D8: the duration clear is refused out loud", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(9000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  const before = await bodyText(frame);
  const r = frame.locator(`[data-testid="table-row"][data-row-key="${ROW}"]`).first();
  await r.scrollIntoViewIfNeeded().catch(() => {});
  console.log("BEFORE dur", JSON.stringify(await r.getAttribute("data-row-duration")));
  await r.locator("div").filter({ hasText: /^\d+d$/ }).last().dispatchEvent("click");
  await page.waitForTimeout(1200);
  const inp = r.locator('input[inputmode="numeric"]').first();
  await inp.fill("");
  await inp.press("Enter");
  await page.waitForTimeout(2000);
  const after = await bodyText(frame);
  console.log("AFTER dur", JSON.stringify(await r.getAttribute("data-row-duration")));
  console.log("STAGED", ((after.match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/gi) || []).join(" | ")) || "(none)");
  const added = after.replace(before.slice(0, 0), "");
  console.log("TOAST_MATCH", JSON.stringify((after.match(/[^.·]*won't be stored[^.·]*/i) || after.match(/Jira holds no Duration[^.]*/i) || [])[0] ?? null));
  console.log("TOAST_REGION", JSON.stringify((after.match(/Duration won't[\s\S]{0,120}/i) || [])[0] ?? null));
  await page.screenshot({ path: `${OUT}/d8-01-refusal.png` });
  // and the same gesture in the Gantt's DateEditor, for the "same rule twice" claim
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  const bar = frame.locator(`[data-testid="gantt-bar"][data-key="${ROW}"]`).first();
  await bar.scrollIntoViewIfNeeded().catch(() => {});
  await bar.dblclick().catch(() => {});
  await page.waitForTimeout(2500);
  console.log("DATE_EDITOR", await frame.locator('[data-testid="date-editor"]').count());
  if (await frame.locator('[data-testid="date-editor"]').count()) {
    const di = frame.locator('[data-testid="date-editor"] input[inputmode="numeric"]').first();
    console.log("DUR_INPUT", await di.count(), "value", await di.inputValue().catch(() => "?"));
    await di.fill("");
    await page.waitForTimeout(800);
    const ap = frame.locator('[data-testid="dateeditor-apply"]').first();
    console.log("APPLY_BTN", ((await ap.textContent().catch(() => "")) || "").trim());
    await ap.dispatchEvent("click");
    await page.waitForTimeout(2500);
    const t2 = await bodyText(frame);
    console.log("EDITOR_TOAST", JSON.stringify((t2.match(/[^.·]*won't be stored[^.·]*/i) || t2.match(/Jira holds no Duration[^.]*/i) || [])[0] ?? null));
    console.log("EDITOR_STAGED", ((t2.match(/Save\s*\(\d+\)|Apply\s+\d+\s+change\w*/gi) || []).join(" | ")) || "(none)");
    await page.screenshot({ path: `${OUT}/d8-02-editor-refusal.png` });
  }
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
});
