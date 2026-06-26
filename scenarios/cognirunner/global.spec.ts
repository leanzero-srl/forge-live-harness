// LIVE: CogniRunner Jira global page (admin panel) on wolfaenpak.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { checkForgeRenders } from "../_support/renderCheck";

const T = getTarget("cognirunner-global");

// Browser/iframe render smoke — retry transient iframe-load flakes (deep REST suites stay at 0 retries).
test.describe.configure({ retries: 3 });

test("CogniRunner global page renders content inside the Forge iframe", async ({ page, recorder }) => {
  test.skip(!T.envId, "COGNI_ENV_ID unresolved — run `npm run discover` or set it in .env.");
  await checkForgeRenders(page, recorder, T);
});
