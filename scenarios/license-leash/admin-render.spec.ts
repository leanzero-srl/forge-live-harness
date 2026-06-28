// LIVE: License Leash admin dashboard (confluence:globalSettings "license-manager-admin") under
// Confluence administration → Settings → Apps. Deep-linked via /wiki/admin/forge/apps/{uuid}/{env}/{module}.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { checkForgeRenders } from "../_support/renderCheck";

const T = getTarget("license-leash-admin");
test.describe.configure({ retries: 3 });

test("License Leash admin dashboard renders content in its Forge iframe", async ({ page, recorder }) => {
  test.skip(!T.envId, "LICENSELEASH_ENV_ID unresolved");
  await checkForgeRenders(page, recorder, T);
});
