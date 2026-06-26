// Launches the harness browser as a PERSISTENT context (a real Chrome profile in
// .auth/profile). This preserves the device identity that one-time interactive
// login established, so reuse doesn't trip Atlassian's "new device" 2FA — unlike
// copying bare storageState into a fresh context.
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import {
  USER_DATA_DIR,
  STORAGE_STATE,
  HEADLESS,
  VIEWPORT,
  BASE_URL,
  LOGIN_PROBE,
  LOGIN_URL_RE,
} from "../config/env";

export interface LaunchOpts {
  /** Force headed (auth) / headless. Default: follow HEADLESS env. */
  headed?: boolean;
  /** Record video to this dir (one webm per page). */
  recordVideoDir?: string;
}

export async function launchHarnessContext(opts: LaunchOpts = {}): Promise<BrowserContext> {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  const headless = opts.headed === true ? false : opts.headed === false ? true : HEADLESS;
  const common: Parameters<typeof chromium.launchPersistentContext>[1] = {
    headless,
    viewport: VIEWPORT,
    args: ["--no-first-run", "--no-default-browser-check"],
  };
  if (opts.recordVideoDir) common.recordVideo = { dir: opts.recordVideoDir, size: VIEWPORT };
  // Prefer system Chrome (stable, matches a human's browser); fall back to the
  // bundled Chromium if Chrome isn't installed.
  try {
    return await chromium.launchPersistentContext(USER_DATA_DIR, { channel: "chrome", ...common });
  } catch {
    return await chromium.launchPersistentContext(USER_DATA_DIR, common);
  }
}

/** Export a portable storageState snapshot (the profile remains the primary store). */
export async function exportStorageState(context: BrowserContext): Promise<void> {
  await context.storageState({ path: STORAGE_STATE });
}

/**
 * Fast-fail session check. Navigates to a protected page; if redirected to the
 * Atlassian login, throws a clear "run npm run auth" error instead of letting the
 * scenario die deep inside an iframe wait.
 */
export async function assertLoggedIn(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/jira/your-work`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(600);
  if (LOGIN_URL_RE.test(page.url())) {
    throw new Error(
      `Atlassian session expired (redirected to ${page.url()}). Run \`npm run auth\` to log in again.`,
    );
  }
  // Soft confirmation — selector skins vary, so a non-match is only fatal if we
  // can also see we're on a login URL.
  const ok = await page.locator(LOGIN_PROBE).first().isVisible({ timeout: 4000 }).catch(() => false);
  if (!ok && LOGIN_URL_RE.test(page.url())) {
    throw new Error("Atlassian session appears expired. Run `npm run auth`.");
  }
}
