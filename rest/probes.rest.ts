// The browserless REST/hook lane. One Playwright test per declared probe (rest/probes/<app>.ts), in
// the `rest` project — no page/context fixture is used, so no browser is launched.
//
//   runner:   HARNESS_APP=<app> HARNESS_ENV=<env>  (scripts/run-app.mjs sets both)
//   manual:   npx playwright test --project=rest                 → every app's probes on development
//
// A probe whose door is absent in the env is SKIPPED with the reason in the report; that is the
// Runs-on-Atlassian production fallback, not a gap.
import { test } from "@playwright/test";
// @ts-ignore - plain ESM JS helper
import { APPS, resolveEnv } from "../config/apps.mjs";
import { availability, runProbe, type Env } from "./probe";
import { probesFor } from "./probes/index";

const env = resolveEnv(process.env.HARNESS_ENV || "development") as Env;
const apps = process.env.HARNESS_APP ? [process.env.HARNESS_APP] : Object.keys(APPS);

// Probes are independent reads/self-restoring round trips: safe to run in parallel.
test.describe.configure({ mode: "parallel", retries: 0, timeout: 90_000 });

for (const app of apps) {
  test.describe(`${app} [${env}]`, () => {
    for (const p of probesFor(app)) {
      test(`${p.name} @rest @${p.door}`, async ({}, testInfo) => {
        const a = availability(app, env, p);
        testInfo.annotations.push({ type: "door", description: p.door }, { type: "effect", description: p.effect });
        test.skip(!a.run, a.reason);
        const file = await runProbe(app, env, p);
        testInfo.annotations.push({ type: "evidence", description: file });
      });
    }
  });
}
