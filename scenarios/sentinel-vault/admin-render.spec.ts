// LIVE: Sentinel Vault admin page (confluence:globalSettings "steward-console") under Confluence
// administration → Settings → Apps. Deep-linked via /wiki/admin/forge/apps/{uuid}/{env}/{module}.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { checkForgeRenders } from "../_support/renderCheck";

const T = getTarget("sentinel-steward-console");
test.describe.configure({ retries: 3 });

test("Sentinel steward-console admin page renders content in its Forge iframe", async ({ page, recorder }) => {
  test.skip(!T.envId, "SENTINEL_ENV_ID unresolved");
  await checkForgeRenders(page, recorder, T);
});
