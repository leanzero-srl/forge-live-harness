// API access tab in the site console (docs/REST-CONFIG-API.md, 2026-09-15).
//   1. the tab renders its four cards and the Endpoint card shows a URL;
//   2. mint "harness-ui" (role editor) → the plaintext panel shows an svt_ token exactly once →
//      dismissed → the row is in the table as active → Revoke through the custom dialog → the row
//      reads revoked (a revoked token is not deleted, so the table keeps the row);
//   3. the Recent jobs card shows either the empty state or rows;
//   4. Export → site configuration → JSON with a `policy` key.
// The token minted here is revoked by the test itself; if a run dies between mint and revoke, the
// next run sweeps every active token named "harness-ui" through the same dialog before minting.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { enterForgeSurface } from "../../forge/frame";

const S = getTarget("sentinel-steward-console");
const TOKEN_NAME = "harness-ui";

test.describe.configure({ timeout: 180_000, retries: 1 });

async function openApiTab(page: any) {
  await page.goto(S.deepLink(S.envId)!, { waitUntil: "domcontentloaded" });
  const s = await enterForgeSurface(page, { surface: "custom", readySelector: ".admin-title", timeout: 45000 });
  if (s.kind !== "custom") throw new Error("expected Custom UI");
  const app = s.frame;
  await expect(app.locator(".admin-title")).toBeVisible({ timeout: 15000 });
  await expect(app.locator('[data-testid="sv-setup"]'), "steady state is the settings view").toHaveCount(0);
  await app.locator('[data-testid="tab-api-access"]').click();
  await expect(app.locator('[data-testid="api-tab"]')).toBeVisible({ timeout: 10000 });
  return app;
}

async function revokeRow(app: any, row: any) {
  await row.locator('[data-testid="api-token-revoke"]').click();
  const dialog = app.locator('[data-testid="api-revoke-dialog"]');
  await expect(dialog, "custom confirm dialog opens (never window.confirm)").toBeVisible();
  await expect(dialog).toContainText(`Revoke ${TOKEN_NAME}?`);
  await expect(dialog).toContainText("Integrations using it stop immediately");
  await dialog.locator('[data-testid="api-revoke-dialog-yes"]').click();
  await expect(dialog).toHaveCount(0, { timeout: 15000 });
}

test("tab renders: four cards, an endpoint URL, jobs card in a defined state", async ({ page }) => {
  const app = await openApiTab(page);
  for (const c of ["url", "tokens", "jobs", "export"]) {
    await expect(app.locator(`[data-testid="api-${c}-card"]`), `card ${c} rendered`).toBeVisible();
    await expect(app.locator(`[data-testid="api-${c}-card"] .sv-group-head .sv-group-text`), `card ${c} has its one-line text`).not.toBeEmpty();
  }
  // never a blank pane: the URL card is either the URL or the unavailable/refused failure with Retry
  const url = app.locator('[data-testid="api-url"]');
  const urlError = app.locator('[data-testid="api-url-error"]');
  await expect(url.or(urlError)).toBeVisible({ timeout: 20000 });
  if (await urlError.count()) {
    console.log("### endpoint card failed:", await urlError.textContent());
    await expect(urlError.locator('[data-testid="api-url-error-retry"]')).toBeVisible();
    throw new Error("list-api-tokens did not return a URL — is the server deployed?");
  }
  const text = (await url.textContent())!.trim();
  expect(text, "endpoint is an https URL").toMatch(/^https:\/\/\S+/);
  console.log("### endpoint:", text);
  await expect(app.locator('[data-testid="api-url-copy"]')).toBeEnabled();

  // the recipe expands and is built from the real URL
  await app.locator('[data-testid="api-recipe-toggle"]').click();
  const recipe = app.locator('[data-testid="api-recipe"]');
  await expect(recipe).toBeVisible();
  await expect(recipe).toContainText(text);
  await expect(recipe).toContainText("Idempotency-Key");
  await expect(recipe).toContainText("sentinel-vault-receipt");

  // jobs: empty state or rows, never the skeleton forever and never blank
  const empty = app.locator('[data-testid="api-jobs-empty"]');
  const rows = app.locator('[data-testid="api-job-row"]');
  const jobsError = app.locator('[data-testid="api-jobs-error"]');
  await expect(empty.or(rows.first()).or(jobsError)).toBeVisible({ timeout: 20000 });
  expect(await jobsError.count(), `jobs card errored: ${await jobsError.textContent().catch(() => "")}`).toBe(0);
  const n = await rows.count();
  console.log("### jobs:", n === 0 ? "empty state" : `${n} rows`);
  if (n > 0) {
    await expect(rows.first().locator('[data-testid="api-job-status"]')).not.toBeEmpty();
    await rows.first().locator('[data-testid="api-job-toggle"]').click();
    await expect(app.locator('[data-testid="api-job-results"]').first()).toBeVisible();
  } else {
    await expect(empty).toHaveText("No API jobs yet.");
  }
});

test("mint harness-ui (editor) → plaintext once → dismissed → row active → revoke via dialog → row revoked", async ({ page }) => {
  const app = await openApiTab(page);
  await expect(app.locator('[data-testid="api-tokens-table"]')).toBeVisible({ timeout: 20000 });

  // sweep a leftover from a dead run so the row we assert on is the one we mint
  const leftovers = app.locator(`[data-testid="api-token-row"][data-token-name="${TOKEN_NAME}"][data-token-state="active"]`);
  for (let i = await leftovers.count(); i > 0; i--) {
    console.log("### revoking a leftover active harness-ui token");
    await revokeRow(app, leftovers.first());
  }

  await app.locator('[data-testid="api-mint-name"]').fill(TOKEN_NAME);
  await app.locator('[data-testid="api-mint-role-value"]').click();
  await expect(app.locator('[data-testid="api-mint-role"] [role="listbox"]'), "custom listbox (never a native select)").toBeVisible();
  await app.locator('[data-testid="api-mint-role-editor"]').click();
  await expect(app.locator('[data-testid="api-mint-role-value"]')).toContainText("Editor");
  await app.locator('[data-testid="api-mint"]').click();

  const panel = app.locator('[data-testid="api-minted-panel"]');
  await expect(panel, "plaintext panel").toBeVisible({ timeout: 20000 });
  const plaintext = (await panel.locator('[data-testid="api-minted-token"]').textContent())!.trim();
  expect(plaintext, "token format svt_ + 48 hex").toMatch(/^svt_[0-9a-f]{48}$/);
  await expect(panel).toContainText("Copy it now — it is not stored and cannot be shown again");
  await expect(panel.locator('[data-testid="api-minted-copy"]')).toBeEnabled();
  await panel.locator('[data-testid="api-minted-dismiss"]').click();
  await expect(panel, "dismissed explicitly").toHaveCount(0);
  await expect(app.locator('[data-testid="api-mint-form"]'), "mint form is back").toBeVisible();

  const row = app.locator(`[data-testid="api-token-row"][data-token-name="${TOKEN_NAME}"][data-token-state="active"]`);
  await expect(row, "the minted row appears active").toHaveCount(1);
  await expect(row, "prefix column shows the token's prefix").toContainText(plaintext.slice(0, 8));
  await expect(row.locator(".api-chip").first()).toContainText(/editor/i);
  await expect(row.locator('[data-testid="api-token-state"]')).toContainText("Active");

  await revokeRow(app, row);
  const revoked = app.locator(`[data-testid="api-token-row"][data-token-name="${TOKEN_NAME}"][data-token-state="revoked"]`);
  await expect(revoked.first(), "row reads revoked").toBeVisible();
  await expect(revoked.first().locator('[data-testid="api-token-state"]')).toContainText("Revoked");
  await expect(revoked.first().locator('[data-testid="api-token-revoke"]'), "no second Revoke on a revoked row").toHaveCount(0);
  await expect(app.locator(`[data-testid="api-token-row"][data-token-name="${TOKEN_NAME}"][data-token-state="active"]`)).toHaveCount(0);

  // the revocation survives a reload (the server wrote it, the UI did not just repaint)
  const app2 = await openApiTab(page);
  await expect(app2.locator('[data-testid="api-tokens-table"]')).toBeVisible({ timeout: 20000 });
  await expect(app2.locator(`[data-testid="api-token-row"][data-token-name="${TOKEN_NAME}"][data-token-state="active"]`), "no active harness-ui after reload").toHaveCount(0);
});

test("export the site configuration → JSON with a policy key", async ({ page }) => {
  const app = await openApiTab(page);
  await app.locator('[data-testid="api-export-site"]').click();
  const out = app.locator('[data-testid="api-export-output"]');
  const err = app.locator('[data-testid="api-export-error"]');
  await expect(out.or(err)).toBeVisible({ timeout: 30000 });
  expect(await err.count(), `export failed: ${await err.textContent().catch(() => "")}`).toBe(0);
  await expect(out).toHaveAttribute("data-export", "site");
  const json = (await out.locator('[data-testid="api-export-json"]').textContent())!;
  const parsed = JSON.parse(json);
  expect(parsed, "export is an object").toBeTruthy();
  expect(Object.keys(parsed), "site config carries policy").toContain("policy");
  console.log("### site config keys:", Object.keys(parsed).join(", "));
  await expect(out.locator('[data-testid="api-export-copy"]')).toBeEnabled();
});
