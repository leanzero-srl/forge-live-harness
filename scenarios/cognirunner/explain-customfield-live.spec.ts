// LIVE (matrix E7): the "Explain this rule" fix (it25) on a CUSTOM field. Filters the admin
// Rules list to a rule on customfield_10282 (display name "COGTEST_Number"), clicks Explain, and
// asserts the AI explanation NAMES the field (not the bare customfield_ id) — the owner's original
// complaint ("field 10722 is useless"). it26 only hit a system-field rule; this closes the custom-
// field path end-to-end on the deployed app.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { enterForgeSurface } from "../../forge/frame";
import { assertLoggedIn } from "../../forge/browser";

const T = getTarget("cognirunner-global");
const FIELD_ID = "customfield_10282";
const FIELD_NAME = "COGTEST_Number";
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

test.describe.configure({ timeout: 180_000, retries: 1 });

test("🔤 Explain names a CUSTOM field live (it25) — not a bare customfield_ id", async ({ page, recorder }) => {
  test.skip(!T.envId, "COGNI_ENV_ID unresolved");
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  const surface = await enterForgeSurface(page, { surface: T.surface, readySelector: T.readySelector });
  const frame = surface.kind === "custom" ? surface.frame : null;
  if (!frame) throw new Error("expected admin custom-UI iframe");

  await frame.locator(".tab-btn", { hasText: /^\s*Rules\s*$/ }).first().click();
  const search = frame.locator('input[placeholder*="Search rules" i]').first();
  await search.waitFor({ timeout: 20_000 });
  await search.fill(FIELD_ID);
  await page.waitForTimeout(1200);

  const explainBtn = frame.locator(".rule-explain-btn").first();
  await expect(explainBtn, `a registered rule on ${FIELD_ID} should be listed`).toBeVisible({ timeout: 15_000 });
  await recorder.step("filter to custom-field rule + Explain", async () => { await explainBtn.click(); });

  const card = frame.locator(".rule-explain-card").first();
  await expect(card).toBeVisible({ timeout: 45_000 });
  await expect(card).toContainText(/\S/);
  const text = (await card.innerText()).trim();
  test.info().annotations.push({ type: "explanation", description: text });
  console.log(`EXPLAIN (${FIELD_ID} = ${FIELD_NAME}): ${text}`);

  // it25 HARD guarantee: the raw id must never leak into the explanation.
  expect(text.includes(FIELD_ID), `explanation must not parrot the bare id ${FIELD_ID} — got: ${text}`).toBe(false);
  // it25 POSITIVE: the field's human NAME appears (the whole point of the fix).
  expect(norm(text).includes(norm(FIELD_NAME)), `explanation should name the field "${FIELD_NAME}" — got: ${text}`).toBe(true);
});
