// LIVE: Kantega User Management & License Optimizer for Confluence — third-party Forge app under
// test for E.ON's rolling-licence assignment. First rung: does its global page render real content
// in its Forge iframe on wolfaenpak. No app code to fix — a failure here becomes a vendor report.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { checkForgeRenders } from "../_support/renderCheck";

// Any app: DISCOVER_TARGET=<id> (default kantega-global)
const T = getTarget(process.env.DISCOVER_TARGET || "kantega-global");
test.describe.configure({ retries: 2 });

test(`${T.app}: global page renders content in its Forge iframe`, async ({ page, recorder }) => {
  test.skip(!T.appId || !T.envId, "KANTEGA_APP_ID / KANTEGA_ENV_ID unresolved — run scratch/kantega_nav.mjs after install");
  await checkForgeRenders(page, recorder, T);
});
