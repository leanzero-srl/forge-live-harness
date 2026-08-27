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

/**
 * Remove the start-up markers a KILLED Chrome leaves behind in the profile.
 *
 * A persistent profile carries four files that say "an instance is running":
 * SingletonLock (a symlink whose target is `<host>-<pid>`), SingletonSocket,
 * SingletonCookie and RunningChromeVersion. Chrome removes them on a clean exit; a
 * crash, a timed-out launch or a kill -9 leaves them, and every later launch then dies
 * with "Opening in existing browser session" or "Target page, context or browser has
 * been closed". Because sharedContext is a WORKER fixture, one such launch failure took
 * out ten specs in a row — the batch runner can only clean between batches, so the
 * self-heal has to live here.
 *
 * Staleness is PROVEN, never assumed: the pid in SingletonLock's target is signalled
 * with 0, and the files are removed only if that process is gone. A live sibling run
 * therefore keeps its lock, which is what stops this from becoming the very race it is
 * meant to fix. (The profile is single-user by design — see the "run the suite alone"
 * note in the sentinel-vault loop notes — but proving it costs one syscall.)
 */
function clearStaleProfileLocks(dir: string): void {
  const lock = `${dir}/SingletonLock`;
  try {
    const target = fs.readlinkSync(lock); // e.g. "Some-Mac.local-55552"
    const pid = Number(target.slice(target.lastIndexOf("-") + 1));
    if (Number.isFinite(pid) && pid > 0) {
      try {
        process.kill(pid, 0);
        return; // a real process still holds the profile — leave everything alone
      } catch (e: any) {
        // ESRCH = no such process (stale). EPERM = alive but not ours; also leave it.
        if (e?.code !== "ESRCH") return;
      }
    }
  } catch {
    // No SingletonLock at all. RunningChromeVersion can still be lying around on its
    // own after a kill, and on its own it is enough to fail the launch — fall through.
  }
  for (const f of ["SingletonLock", "SingletonSocket", "SingletonCookie", "RunningChromeVersion"]) {
    try { fs.unlinkSync(`${dir}/${f}`); } catch { /* already gone */ }
  }
}

export async function launchHarnessContext(opts: LaunchOpts = {}): Promise<BrowserContext> {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  clearStaleProfileLocks(USER_DATA_DIR);
  const headless = opts.headed === true ? false : opts.headed === false ? true : HEADLESS;
  const common: Parameters<typeof chromium.launchPersistentContext>[1] = {
    headless,
    viewport: VIEWPORT,
    args: ["--no-first-run", "--no-default-browser-check"],
  };
  if (opts.recordVideoDir) common.recordVideo = { dir: opts.recordVideoDir, size: VIEWPORT };
  // Prefer system Chrome (stable, matches a human's browser); fall back to the
  // bundled Chromium if Chrome isn't installed.
  //
  // One retry after a lock sweep: a launch that dies part-way writes its own markers on
  // the way out, so the second attempt is the one that gets a clean profile. Without it
  // the very failure this function cleans up after is left for the next process to find.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await chromium.launchPersistentContext(USER_DATA_DIR, { channel: "chrome", ...common });
    } catch (chromeErr) {
      try {
        return await chromium.launchPersistentContext(USER_DATA_DIR, common);
      } catch (chromiumErr) {
        if (attempt === 1) throw chromiumErr;
        clearStaleProfileLocks(USER_DATA_DIR);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
  throw new Error("unreachable");
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
