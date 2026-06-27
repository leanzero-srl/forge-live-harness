// LIVE: Altomata "hub" Jira global page on wolfaenpak — boots in its Forge iframe and
// renders real content (.hub-wrap root via readySelector), not a blank panel.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { checkForgeRenders } from "../_support/renderCheck";

const T = getTarget("altomata-hub");

// Browser/iframe render smoke — retry transient iframe-load flakes (deep REST suites stay at 0 retries).
test.describe.configure({ retries: 3 });

test("Altomata hub global page renders content inside the Forge iframe", async ({ page, recorder }) => {
  test.skip(!T.envId, "ALTOMATA_ENV_ID unresolved — set it in .env.");
  await checkForgeRenders(page, recorder, T);
});
