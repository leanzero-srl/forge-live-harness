// LIVE: lz-ppm-forge "LeanZero Management" jira:adminPage on wolfaenpak.
// Closes the coverage gap noted in the app's quality loop (iter 12): the admin
// settings page was build-only verified. jira:adminPage deep-linking is NOT
// officially documented, so the URL is inferred — treated as best-effort.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { checkForgeRenders } from "../_support/renderCheck";

const T = getTarget("lz-ppm-admin");

test.describe.configure({ retries: 3 });

test("lz-ppm admin settings renders content inside the Forge iframe", async ({ page, recorder }) => {
  test.skip(!T.envId, "LZ_PPM_ENV_ID unresolved — run `npm run discover` or set it in .env.");
  await checkForgeRenders(page, recorder, T);
});
