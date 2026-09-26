// Typed, centralized harness configuration. Loads .env via the zero-dep loader.
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-ignore - plain ESM JS helper, resolved at runtime by tsx/esbuild
import { loadEnv } from "../data/env.mjs";
// @ts-ignore - plain ESM JS helper
import { harnessHome } from "./home.mjs";

loadEnv();

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const BASE_URL = (process.env.JIRA_BASE_URL ?? "https://wolfaenpak.atlassian.net").replace(/\/+$/, "");
export const SITE_HOST = new URL(BASE_URL).host;
/** Confluence lives under /wiki on the same host. */
export const WIKI_BASE = `${BASE_URL}/wiki`;

/**
 * The saved login lives in the MAIN checkout's .auth/ (gitignored). A git worktree resolves to it
 * through config/home.mjs, so a parallel session never needs its own `npm run auth`.
 */
export const HARNESS_HOME: string = harnessHome();
export const AUTH_DIR = path.join(HARNESS_HOME, ".auth");
/**
 * Persistent Chrome profile — preserves device identity so Atlassian doesn't see a "new device".
 *
 * `HARNESS_PROFILE` (workhorse, 2026-09-08) is a full path override, used to run against a customer
 * sandbox with its own profile. `LZ_HARNESS_PROFILE` (laptop) names a SIBLING profile directory under
 * .auth/ so two testers can run concurrently without contending on one profile's reservation lock.
 * Default is unchanged: `.auth/profile`.
 */
/**
 * `HARNESS_RUN_AUTH_DIR` (set by scripts/run-app.mjs, 2026-09-26) wins over all of the above: the run
 * owns `<dir>/base` (a clone of the saved profile, proven alive by the preflight) and every Playwright
 * worker process gets its OWN clone `<dir>/worker-<TEST_WORKER_INDEX>`, made by the fixture
 * (forge/auth-clone.mjs). No two runs, and no two workers, ever open the same profile directory.
 */
export const RUN_AUTH_DIR: string | undefined = process.env.HARNESS_RUN_AUTH_DIR || undefined;
export const USER_DATA_DIR = RUN_AUTH_DIR
  ? path.join(RUN_AUTH_DIR, `worker-${process.env.TEST_WORKER_INDEX ?? "0"}`)
  : process.env.HARNESS_PROFILE ?? path.join(AUTH_DIR, process.env.LZ_HARNESS_PROFILE ?? "profile");

/**
 * Customer-tenant gate. wolfaenpak is THE testbed (AI-GUIDE rule 1). Pointing the harness at any other
 * host — e.g. a client's sandbox, first done 2026-09-08 for E.ON — is allowed ONLY for read-only specs
 * (render, discovery, full-text). A spec that mutates anything must call assertMutationAllowed(), which
 * refuses on a customer host unless CUSTOMER_SANDBOX_MUTATIONS_OK=1 is set deliberately for that run.
 */
export const IS_TESTBED = /(^|\.)wolfaenpak\.atlassian\.net$/.test(SITE_HOST);
export function assertMutationAllowed(what: string): void {
  if (IS_TESTBED) return;
  if (process.env.CUSTOMER_SANDBOX_MUTATIONS_OK === "1") return;
  throw new Error(
    `REFUSED: "${what}" would change state on ${SITE_HOST}, which is not the wolfaenpak testbed. ` +
    `Read-only specs may run here; a mutation needs CUSTOMER_SANDBOX_MUTATIONS_OK=1 set on purpose for this run.`);
}
/** Exported storageState (portability / inspection). Primary reuse is the profile above. */
export const STORAGE_STATE = path.join(AUTH_DIR, "storage-state.json");

export const EVIDENCE_DIR = process.env.EVIDENCE_DIR ?? path.join(REPO_ROOT, "evidence");

/**
 * Headless by DEFAULT; `HEADED=1` (or `HEADLESS=0`) opens a visible window.
 *
 * It used to be the other way round, and headed was the wrong default for a suite that
 * runs 30+ browser specs unattended. Two reasons it flipped:
 *
 *   - A headed launch on a cold profile can raise a MODAL first-run dialog ("Something
 *     went wrong when opening your profile"). Nothing is watching to click OK, so the
 *     launch sits there until the 120s fixture timeout — and because sharedContext is a
 *     WORKER fixture, that one hang took out ten specs in a row. Headless has no dialog
 *     to block on: the same spec goes from a 120s timeout to passing in 15s.
 *   - It stops the suite throwing browser windows over whatever the operator is doing.
 *
 * auth/auth.setup.ts passes `headed: true` explicitly, so an interactive login is
 * unaffected — and that is the one flow that genuinely needs a window.
 */
export const HEADLESS = process.env.HEADED === "1" ? false
  : process.env.HEADLESS === "0" ? false
  : true;
export const VIEWPORT = { width: 1440, height: 900 };

/**
 * A logged-in-only probe. The exact testid is confirmed during step-1 discovery
 * (run `npm run auth`, then a scenario logs `dumpForgeFrames`/aria). Multiple
 * candidates OR'd so a nav skin change doesn't silently break the check.
 */
export const LOGIN_PROBE =
  '[data-testid="atlassian-navigation--secondary-actions"], ' +
  '[aria-label="Your profile and settings"], ' +
  'button[aria-label*="profile" i], ' +
  '#jira-frontend, [data-testid="ak-jira-navigation"]';

/** A redirect to either of these means the session is dead → re-auth. */
export const LOGIN_URL_RE = /id\.atlassian\.com|\/login(\?|$)|\/login\//;
