// LIVE: lz-ppm-forge "LeanZero Management" Jira global page on wolfaenpak.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { checkForgeRenders } from "../_support/renderCheck";

const T = getTarget("lz-ppm-dashboard");

test("lz-ppm dashboard renders content inside the Forge iframe", async ({ page, recorder }) => {
  test.skip(!T.envId, "LZ_PPM_ENV_ID unresolved — run `npm run discover` or set it in .env.");
  await checkForgeRenders(page, recorder, T);
});
