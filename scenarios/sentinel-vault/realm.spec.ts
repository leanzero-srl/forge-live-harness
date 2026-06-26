// LIVE: Sentinel Vault Confluence space page ("realm-console") on wolfaenpak.
// Confluence target → proves cross-product coverage. Space defaults to WFH
// (override with SENTINEL_SPACE_KEY).
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { checkForgeRenders } from "../_support/renderCheck";

const T = getTarget("sentinel-vault-realm");

// Browser/iframe render smoke — retry transient iframe-load flakes (deep REST suites stay at 0 retries).
test.describe.configure({ retries: 3 });

test("Sentinel Vault space page renders content inside the Forge iframe", async ({ page, recorder }) => {
  test.skip(!T.envId, "SENTINEL_ENV_ID unresolved — run `npm run discover` or set it in .env.");
  await checkForgeRenders(page, recorder, T);
});
