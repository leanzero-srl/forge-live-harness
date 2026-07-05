// LIVE: lz-ppm-forge "LeanZero Management" jira:issuePanel on wolfaenpak.
// Closes the coverage gap noted in the app's quality loop (iters 12-13): this
// module was build-only verified because it needs the Forge issue context.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { checkIssuePanelRenders } from "../_support/renderCheck";

const T = getTarget("lz-ppm-issue-panel");
// Any real wolfaenpak issue reaches the panel; the empty-state still proves the
// module renders. Override with LZ_PPM_PANEL_ISSUE to point at an in-plan issue.
const ISSUE = process.env.LZ_PPM_PANEL_ISSUE || "WFH-1";
const PANEL_TITLE = "LeanZero Management Position";

// Issue-panel visibility depends on host-page glance timing; retry transient flaps.
test.describe.configure({ retries: 3 });

test("lz-ppm issue panel renders content inside the Forge iframe", async ({ page, recorder }) => {
  test.skip(!T.envId, "LZ_PPM_ENV_ID unresolved — run `npm run discover` or set it in .env.");
  await checkIssuePanelRenders(page, recorder, T, ISSUE, PANEL_TITLE);
});
