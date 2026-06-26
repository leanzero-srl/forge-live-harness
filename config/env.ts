// Typed, centralized harness configuration. Loads .env via the zero-dep loader.
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-ignore - plain ESM JS helper, resolved at runtime by tsx/esbuild
import { loadEnv } from "../data/env.mjs";

loadEnv();

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const BASE_URL = (process.env.JIRA_BASE_URL ?? "https://wolfaenpak.atlassian.net").replace(/\/+$/, "");
export const SITE_HOST = new URL(BASE_URL).host;
/** Confluence lives under /wiki on the same host. */
export const WIKI_BASE = `${BASE_URL}/wiki`;

export const AUTH_DIR = path.join(REPO_ROOT, ".auth");
/** Persistent Chrome profile — preserves device identity so Atlassian doesn't see a "new device". */
export const USER_DATA_DIR = path.join(AUTH_DIR, "profile");
/** Exported storageState (portability / inspection). Primary reuse is the profile above. */
export const STORAGE_STATE = path.join(AUTH_DIR, "storage-state.json");

export const EVIDENCE_DIR = process.env.EVIDENCE_DIR ?? path.join(REPO_ROOT, "evidence");

export const HEADLESS = process.env.HEADLESS === "1";
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
