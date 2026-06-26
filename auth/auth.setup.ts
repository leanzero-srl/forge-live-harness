// One-time interactive login. Run with `npm run auth`.
// Opens a HEADED persistent-profile browser; you log in (email + password + MFA)
// once. The profile (.auth/profile) is then reused by every scenario, and a
// portable storage-state.json is exported alongside.
import { test as setup } from "@playwright/test";
import { launchHarnessContext, exportStorageState } from "../forge/browser";
import { BASE_URL, LOGIN_PROBE, LOGIN_URL_RE } from "../config/env";

setup("interactive login (one-time) → persistent profile", async () => {
  setup.setTimeout(6 * 60_000);
  const context = await launchHarnessContext({ headed: true });
  const page = context.pages()[0] ?? (await context.newPage());

  await page.goto(`${BASE_URL}/jira/your-work`, { waitUntil: "domcontentloaded" }).catch(() => {});

  const probe = page.locator(LOGIN_PROBE).first();
  const alreadyIn = await probe.isVisible({ timeout: 3000 }).catch(() => false);

  if (!alreadyIn) {
    // eslint-disable-next-line no-console
    console.log(
      "\n  ────────────────────────────────────────────────────────────\n" +
        "  Log in (email → password → MFA) in the OPEN browser window.\n" +
        "  Waiting up to 6 minutes for an authenticated page…\n" +
        "  ────────────────────────────────────────────────────────────\n",
    );
    // Wait until the URL is no longer a login URL (handles the email→password→MFA steps).
    await page
      .waitForFunction((reSource) => !new RegExp(reSource).test(location.href), LOGIN_URL_RE.source, {
        timeout: 6 * 60_000,
      })
      .catch(() => {});
    await probe.waitFor({ state: "visible", timeout: 90_000 }).catch(() => {});
  }

  if (LOGIN_URL_RE.test(page.url())) {
    throw new Error("Still on a login page after waiting — login did not complete. Re-run `npm run auth`.");
  }

  await exportStorageState(context);
  // eslint-disable-next-line no-console
  console.log("\n  ✓ Session saved (.auth/profile + .auth/storage-state.json). You can close this and run `npm test`.\n");
  await context.close();
});
