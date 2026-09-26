import { defineConfig } from "@playwright/test";
import { BASE_URL, VIEWPORT } from "./config/env";

// We drive a PERSISTENT browser context (see forge/browser.ts) to preserve the
// device identity that one-time interactive login established — so reuse doesn't
// trip Atlassian's "new device" 2FA. Because the context is launched manually,
// Playwright's auto video/trace `use` flags don't apply; the recorder captures
// video/trace/screenshots itself. headed/headless is controlled by HEADLESS env
// (the persistent-context launch reads it), not by the runner's --headed flag.
//
// PER-RUN ISOLATION (scripts/run-app.mjs, 2026-09-26). Playwright WIPES `outputDir` at the start
// of every run, so two concurrent runs sharing `test-results/` destroy each other's traces. The
// runner points every output at the run's own folder through these env vars; a plain
// `npx playwright test` keeps the historical defaults.
//   HARNESS_OUTPUT_DIR   test-results for this run
//   HARNESS_REPORT_DIR   html report for this run
//   HARNESS_JSON_REPORT  machine-readable results (the runner builds summary.json from it)
//   HARNESS_WORKERS      worker count (default 1: one live session + shared Jira data)
const WORKERS = Number(process.env.HARNESS_WORKERS || 1);
const reporters: any[] = [["list"], ["html", { open: "never", ...(process.env.HARNESS_REPORT_DIR ? { outputFolder: process.env.HARNESS_REPORT_DIR } : {}) }]];
if (process.env.HARNESS_JSON_REPORT) reporters.push(["json", { outputFile: process.env.HARNESS_JSON_REPORT }]);

export default defineConfig({
  testDir: ".",
  testMatch: ["auth/*.setup.ts", "scenarios/**/*.spec.ts", "rest/**/*.rest.ts"],
  ...(process.env.HARNESS_OUTPUT_DIR ? { outputDir: process.env.HARNESS_OUTPUT_DIR } : {}),
  fullyParallel: false,
  // Default 1: single live session + shared Jira data → no parallel state races / 429s. The runner
  // raises it only for an app whose selected specs are read-only (config/apps.mjs smokeWorkers);
  // every worker then gets its OWN profile clone (config/env.ts USER_DATA_DIR).
  workers: WORKERS,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: reporters,
  use: {
    baseURL: BASE_URL,
    viewport: VIEWPORT,
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
  },
  projects: [
    { name: "setup", testMatch: /auth\/.*\.setup\.ts/ },
    { name: "chromium", testMatch: /scenarios\/.*\.spec\.ts/ },
    // Browserless REST/hook probes (rest/probes/<app>.ts). No page fixture → no browser launch.
    { name: "rest", testMatch: /rest\/.*\.rest\.ts/ },
  ],
});
