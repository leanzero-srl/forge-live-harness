// LIVE: CogniRunner Jira global page (admin panel) on wolfaenpak.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { checkForgeRenders } from "../_support/renderCheck";

const T = getTarget("cognirunner-global");

test("CogniRunner global page renders content inside the Forge iframe", async ({ page, recorder }) => {
  test.skip(!T.envId, "COGNI_ENV_ID unresolved — run `npm run discover` or set it in .env.");
  await checkForgeRenders(page, recorder, T);
});
