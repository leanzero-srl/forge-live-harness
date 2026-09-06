// Launches the harness browser as a PERSISTENT context (a real Chrome profile in
// .auth/profile). This preserves the device identity that one-time interactive
// login established, so reuse doesn't trip Atlassian's "new device" 2FA — unlike
// copying bare storageState into a fresh context.
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { launchReservedProfile } from "./profile-reservation";
import { createPortableLauncher, getPortableReceipt, type PortableReceipt } from "./portable-browser.mjs";
const launchReceipts = new WeakMap<BrowserContext, PortableReceipt | { mode: "persistent-chrome"; browserVersion: string | null }>();
export function getHarnessLaunchReceipt(context: BrowserContext) { return launchReceipts.get(context) ?? null; }
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
  /** Explicit opt-in only; runner environment remains authoritative. */
  browserMode?: "persistent-chrome" | "portable-chrome152";
  expectedAccountId?: string;
  expectedUiVersion?: string;
  /** Interactive auth must always use the existing persistent profile. */
  authFlow?: boolean;
  /** Record video to this dir (one webm per page). */
  recordVideoDir?: string;
}

/**
 * HOST FLAG BANNERS SWALLOW CLICKS. Jira renders site notices into
 * `#aui-flag-container` (and the newer `[data-testid$="flag-group"]`) with a high
 * z-index, floating OVER the Forge iframe. Playwright's actionability check then
 * reports "<div class=aui-message…> intercepts pointer events" and every click
 * inside the app times out — a healthy app failing for a host reason. Measured
 * 2026-09-03 on wolfaenpak: an "Email notifications are off until 04/Sep/26"
 * evaluation notice blocked the entire Apply flow of two journeys.
 *
 * Installed as an INIT script so it survives every navigation and reload, and it
 * only removes the containers' ability to receive pointer events — the banner is
 * still visible in screenshots, so evidence stays honest.
 */
const FLAG_SUPPRESSOR_CSS = `#aui-flag-container, [data-testid="flag-group"], [data-testid$=".flag-group"], #jira-flags { pointer-events: none !important; }`;

export async function installHostFlagSuppressor(context: BrowserContext): Promise<void> {
  await context.addInitScript((css: string) => {
    const inject = () => {
      if (document.getElementById("lz-harness-flag-suppressor")) return;
      if (!document.head) return;
      const st = document.createElement("style");
      st.id = "lz-harness-flag-suppressor";
      st.textContent = css;
      document.head.appendChild(st);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inject, { once: true });
    else inject();
    // Some hosts replace <head> late in boot; re-assert once the app has settled.
    setTimeout(inject, 2000);
    setTimeout(inject, 6000);
  }, FLAG_SUPPRESSOR_CSS).catch(() => {});
}

export async function launchHarnessContext(opts: LaunchOpts = {}): Promise<BrowserContext> {
  const envMode = process.env.LZ_HARNESS_BROWSER_MODE;
  if (opts.browserMode && envMode !== undefined && opts.browserMode !== envMode) throw new Error("BROWSER_MODE_MISMATCH");
  const mode = envMode ?? opts.browserMode ?? "persistent-chrome";
  if (!["persistent-chrome", "portable-chrome152"].includes(mode)) throw new Error("BROWSER_MODE_UNKNOWN");
  const headless = opts.headed === true ? false : opts.headed === false ? true : HEADLESS;
  if (mode === "portable-chrome152") {
    if (opts.authFlow) throw new Error("PORTABLE_AUTH_FLOW_FORBIDDEN");
    if (opts.expectedAccountId && process.env.LZ_EXPECTED_ACCOUNT_ID !== undefined && opts.expectedAccountId !== process.env.LZ_EXPECTED_ACCOUNT_ID) throw new Error("BROWSER_PRINCIPAL_BINDING_MISMATCH");
    if (opts.expectedUiVersion && process.env.LZ_EXPECTED_UI_VERSION !== undefined && opts.expectedUiVersion !== process.env.LZ_EXPECTED_UI_VERSION) throw new Error("BROWSER_UI_BINDING_MISMATCH");
    const context = await createPortableLauncher({ chromium, installHostFlagSuppressor })({
      mode, headed: !headless, authFlow: opts.authFlow, viewport: VIEWPORT, recordVideoDir: opts.recordVideoDir,
      expected: { accountId: process.env.LZ_EXPECTED_ACCOUNT_ID ?? opts.expectedAccountId ?? "", uiVersion: process.env.LZ_EXPECTED_UI_VERSION ?? opts.expectedUiVersion ?? "" },
    });
    const receipt = getPortableReceipt(context);
    if (!receipt) {
      const error = new Error("PORTABLE_LAUNCH_RECEIPT_MISSING");
      try { await context.close(); } catch (cleanup) { throw new AggregateError([error, cleanup], "Portable receipt missing and cleanup failed"); }
      throw error;
    }
    launchReceipts.set(context, receipt);
    console.log("HARNESS_BROWSER_RECEIPT " + JSON.stringify(receipt));
    return context;
  }
  const common: Parameters<typeof chromium.launchPersistentContext>[1] = {
    headless,
    viewport: VIEWPORT,
    args: ["--no-first-run", "--no-default-browser-check"],
  };
  if (opts.recordVideoDir) common.recordVideo = { dir: opts.recordVideoDir, size: VIEWPORT };
  // One canonical cross-process reservation covers worker, video and auth callers.
  // Unknown launch/owner failures retain an unclean record; no marker deletion or kill.
  const context = await launchReservedProfile(USER_DATA_DIR, async (profile, channel) => {
    const ctx = await chromium.launchPersistentContext(profile,
      channel === "chrome" ? { channel: "chrome", ...common } : common);
    await installHostFlagSuppressor(ctx);
    return ctx;
  });
  const receipt = Object.freeze({ mode: "persistent-chrome" as const, browserVersion: context.browser()?.version() ?? null });
  launchReceipts.set(context, receipt);
  console.log("HARNESS_BROWSER_RECEIPT " + JSON.stringify(receipt));
  return context;
}

/** Export a portable storageState snapshot (the profile remains the primary store). */
export async function exportStorageState(context: BrowserContext): Promise<void> {
  if (getPortableReceipt(context)) throw new Error("PORTABLE_STATE_EXPORT_FORBIDDEN");
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

/**
 * Remove HOST-level flag banners that float over the page and swallow clicks.
 *
 * Jira renders site notices into `#aui-flag-container` / `[data-testid$="flag-group"]`
 * with a high z-index. They sit ON TOP of the Forge iframe, so Playwright's
 * actionability check reports "<div class=aui-message…> intercepts pointer events"
 * and every click inside the app times out — a green app failing for a host reason.
 * (Measured 2026-09-03 on wolfaenpak: an "Email notifications are off until …"
 * evaluation-plan notice blocked the whole Apply flow.)
 *
 * Only host chrome is removed; the app's own DOM lives inside the iframe and is
 * never touched. Safe to call repeatedly.
 */
export async function dismissHostFlags(page: Page): Promise<number> {
  return page.evaluate(() => {
    const sels = ["#aui-flag-container", '[data-testid="flag-group"]', '[data-testid$=".flag-group"]', "#jira-flags"];
    let n = 0;
    for (const sel of sels) {
      for (const el of Array.from(document.querySelectorAll(sel))) {
        if (el.childElementCount === 0) continue;
        el.remove();
        n++;
      }
    }
    return n;
  }).catch(() => 0);
}
