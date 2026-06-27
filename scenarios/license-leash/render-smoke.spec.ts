// LIVE: License Leash self-service reactivation page (Confluence globalPage) on wolfaenpak.
// First load also runs ensureMigrations(), provisioning the app's Forge SQL tables — so this
// doubles as the SQL bootstrap for the webtrigger test.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { checkForgeRenders } from "../_support/renderCheck";

const T = getTarget("license-leash-reactivation");

// Browser/iframe render smoke — retry transient iframe-load flakes (deep REST suites stay at 0 retries).
test.describe.configure({ retries: 3 });

test("License Leash reactivation page renders content inside the Forge iframe", async ({ page, recorder }) => {
  test.skip(!T.envId, "LICENSELEASH_ENV_ID unresolved — set it in .env.");
  await checkForgeRenders(page, recorder, T);
});
