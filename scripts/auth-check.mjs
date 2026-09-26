#!/usr/bin/env node
// `npm run auth:check` — is the saved login still alive? Headless, on a throwaway CLONE of the saved
// profile (the saved profile itself is only read), so it is safe while other runs are using it.
// Exit 0 alive · 3 expired (the owner must run `npm run auth`, headed, with 2FA) · 1 error.
import crypto from "node:crypto";
import path from "node:path";
import { harnessHome } from "../config/home.mjs";
import { cloneProfile, checkSession, removeOwnedRun, runsRoot } from "../forge/auth-clone.mjs";
import { loadEnv } from "../data/env.mjs";

loadEnv();
const authDir = path.join(harnessHome(), ".auth");
const source = process.env.HARNESS_AUTH_SOURCE ? path.resolve(process.env.HARNESS_AUTH_SOURCE) : path.join(authDir, "profile");
const runDir = path.join(runsRoot(authDir), `auth-check-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`);
try {
  const cl = cloneProfile(source, path.join(runDir, "base"), { purpose: "auth-check" });
  const { chromium } = await import("@playwright/test");
  const s = await checkSession({ chromium, profileDir: path.join(runDir, "base"), baseUrl: (process.env.JIRA_BASE_URL || "https://wolfaenpak.atlassian.net").replace(/\/+$/, "") });
  if (s.ok) { console.log(`auth: ALIVE — ${s.displayName} (clone ${cl.ms}ms, source ${source})`); process.exitCode = 0; }
  else { console.error(`auth: EXPIRED (HTTP ${s.status}, ${s.reason}). The owner must run \`npm run auth\` in ${harnessHome()} — headed, email + password + 2FA.`); process.exitCode = 3; }
} catch (e) {
  console.error(`auth: check failed — ${e.message}`); process.exitCode = 1;
} finally {
  try { removeOwnedRun(authDir, runDir); } catch (e) { console.error(`(clone left at ${runDir}: ${e.message})`); }
}
