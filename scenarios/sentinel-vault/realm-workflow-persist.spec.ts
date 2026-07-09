// DEEP admin persistence journey for the WORKFLOW config (newest/most-complex capsule). Drives the
// realm-console Workflow tab: ensure the workflow is enabled, change the "Re-review Approved pages
// after" (reviewAfterDays) field to a distinct value, Save (success alert), reload, assert it
// persisted. Round-trips the whole set-space-workflow-settings object (enabled/enforceMode/approval/
// entryConditions/reviewAfterDays) through KVS. reviewAfterDays chosen because it's picker-free and
// distinctive; flips 90↔120 each run so a real change is exercised. Dev-scoped via .space-admin-title.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { enterForgeSurface } from "../../forge/frame";
import { BASE_URL } from "../../config/env";
const T = getTarget("sentinel-vault-realm");
const REVIEW = 'input[aria-label="Re-review Approved pages after this many days"]';
test.describe.configure({ retries: 2 });

async function openWorkflow(page: any) {
  const s = await enterForgeSurface(page, { surface: "custom", readySelector: ".space-admin-title", timeout: 45000 });
  if (s.kind !== "custom") throw new Error("expected Custom UI");
  const app = s.frame;
  await expect(app.locator(".space-admin-title")).toBeVisible({ timeout: 15000 });
  await app.locator(".tab-navigation .tab-button", { hasText: "Workflow" }).click();
  await page.waitForTimeout(1600);
  return app;
}
async function ensureEnabledReviewVisible(app: any, page: any) {
  const review = app.locator(REVIEW);
  if (!(await review.isVisible().catch(() => false))) {
    await app.locator(".settings-row", { hasText: "Enable document workflow" }).locator(".form-checkbox").click();
    await page.waitForTimeout(700);
  }
  await expect(review).toBeVisible({ timeout: 8000 });
  return review;
}

test("workflow review-period change persists across a reload (set-space-workflow-settings round-trip)", async ({ page, recorder }) => {
  recorder.setTarget({ product: T.product, app: T.app, appId: T.appId, module: T.module, moduleType: T.moduleType, surface: T.surface, url: BASE_URL + T.deepLink(T.envId), repo: T.repo });
  let next = "90";
  await recorder.step("set a distinct review period + Save", async () => {
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    const app = await openWorkflow(page);
    const review = await ensureEnabledReviewVisible(app, page);
    const cur = (await review.inputValue()).trim();
    next = cur === "90" ? "120" : "90";
    await review.fill(next);
    await app.getByRole("button", { name: /Save workflow settings/i }).click();
    await expect(app.locator(".alert-success")).toBeVisible({ timeout: 15000 });
    console.log("### saved reviewAfterDays =", next);
  }, { expectation: { assertion: "the workflow review-period saves with a success confirmation", narrative: "Sets review period and Saves; asserts success alert." } });

  await recorder.step("reload → the review period persisted", async () => {
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    const app = await openWorkflow(page);
    const review = app.locator(REVIEW);
    await expect(review).toBeVisible({ timeout: 8000 });
    const persisted = (await review.inputValue()).trim();
    console.log("### persisted reviewAfterDays =", persisted);
    expect(persisted, `review period should persist as ${next}`).toBe(next);
  }, { expectation: { assertion: "the saved review period survives a full reload", narrative: "Reloads and asserts the review period equals what was saved." } });
});
