// LIVE: lz-ppm-forge "LeanZero Management" Jira global page on wolfaenpak.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { checkForgeRenders } from "../_support/renderCheck";

const T = getTarget("lz-ppm-dashboard");

// Browser/iframe render smoke — transient iframe-load timing can flake; retry (the deep REST
// findings suites run at 0 retries so real flakes there still surface).
test.describe.configure({ retries: 3 });

test("lz-ppm dashboard renders content inside the Forge iframe", async ({ page, recorder }) => {
  test.skip(!T.envId, "LZ_PPM_ENV_ID unresolved — run `npm run discover` or set it in .env.");
  await checkForgeRenders(page, recorder, T);
});
