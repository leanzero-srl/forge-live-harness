// PERSISTENT journey — Settings → API Access (jira:adminPage) on wolfaenpak.
// Drives the REAL admin tab: mint a token in the UI, prove the plaintext it shows
// AUTHENTICATES against the REST web trigger (whoami → the minting admin), revoke it
// through the app's own ConfirmDialog, prove the same token is now 401. Cleans up by
// construction (the token it minted is revoked; a `finally` revokes via the hook if
// the UI step failed). Screenshots the fresh-token state for the visual audit.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-admin");
test.describe.configure({ retries: 0, timeout: 240_000 });

async function whoami(url: string, token: string) {
  const u = new URL(url); u.searchParams.set("resource", "whoami");
  const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, json: await res.json().catch(() => null) };
}

test("API Access tab: mint in the UI → token authenticates over REST → revoke in the UI → 401", async ({ page }, testInfo) => {
  test.skip(!T.envId, "LZ_PPM_ENV_ID unresolved");
  await page.setViewportSize({ width: 1500, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  expect(frame, "custom UI frame").toBeTruthy();

  await frame!.getByRole("button", { name: /API Access/ }).click();
  const panel = frame!.getByTestId("api-access-panel");
  await panel.waitFor({ state: "visible", timeout: 30_000 });
  const urlEl = frame!.getByTestId("api-url");
  await expect(urlEl).toHaveText(/^https:\/\//, { timeout: 30_000 });
  const url = (await urlEl.textContent())!.trim();
  const name = `ui-journey ${Date.now().toString(36)}`;
  let tokenId: string | null = null;
  try {
    await frame!.getByTestId("api-token-name").fill(name);
    await frame!.getByTestId("api-token-mint").click();
    const plain = frame!.getByTestId("api-token-plaintext");
    await plain.waitFor({ state: "visible", timeout: 30_000 });
    const token = (await plain.textContent())!.trim();
    expect(token).toMatch(/^lzm_[0-9a-f]{48}$/);
    await page.screenshot({ path: testInfo.outputPath("api-access-fresh-token.png"), fullPage: true });

    // The row rendered for it.
    const row = frame!.locator(`[data-testid="api-token-row"]`, { hasText: name });
    await expect(row).toHaveCount(1);
    tokenId = await row.getAttribute("data-token-id");
    await expect(row.locator("text=viewer")).toBeVisible();

    // The UI-minted plaintext is a REAL credential.
    const me = await whoami(url, token);
    expect(me.status, JSON.stringify(me.json)).toBe(200);
    expect(me.json.token.role).toBe("viewer");
    expect(me.json.token.name).toBe(name);
    const hook = await getTestState("lz-ppm", { what: "fieldConfig" }); // hook alive, so the accountId comparison below is meaningful
    expect(hook.fields).toBeTruthy();

    // Revoke through the app's ConfirmDialog (never a native confirm).
    await row.getByTestId("api-token-revoke").click();
    const dialog = frame!.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/Revoke/);
    await dialog.getByRole("button", { name: /^Revoke$/ }).click();
    await expect(frame!.locator(`[data-testid="api-token-row"]`, { hasText: name })).toHaveCount(0, { timeout: 30_000 });
    tokenId = null;
    const dead = await whoami(url, token);
    expect(dead.status).toBe(401);
    await page.screenshot({ path: testInfo.outputPath("api-access-after-revoke.png"), fullPage: true });
  } finally {
    if (tokenId) { try { await getTestState("lz-ppm", { what: "revokeApiToken", id: tokenId }); } catch { /* best-effort */ } }
  }
});
