import { defineConfig } from "@playwright/test";
import { BASE_URL, VIEWPORT } from "./config/env";

// We drive a PERSISTENT browser context (see forge/browser.ts) to preserve the
// device identity that one-time interactive login established — so reuse doesn't
// trip Atlassian's "new device" 2FA. Because the context is launched manually,
// Playwright's auto video/trace `use` flags don't apply; the recorder captures
// video/trace/screenshots itself. headed/headless is controlled by HEADLESS env
// (the persistent-context launch reads it), not by the runner's --headed flag.
export default defineConfig({
  testDir: ".",
  testMatch: ["auth/*.setup.ts", "scenarios/**/*.spec.ts"],
  fullyParallel: false,
  workers: 1, // single live session + shared Jira data → no parallel state races / 429s
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    viewport: VIEWPORT,
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
  },
  projects: [
    { name: "setup", testMatch: /auth\/.*\.setup\.ts/ },
    { name: "chromium", testMatch: /scenarios\/.*\.spec\.ts/ },
  ],
});
