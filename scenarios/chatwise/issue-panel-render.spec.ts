// LIVE: ChatWise "AI Assistant" jira:issuePanel on wolfaenpak.
// jira:issuePanel is NOT deep-linkable (the CDN strips URL params), so this goes
// through forge/host.ts openIssuePanel: open a real issue, expand the named
// glance, then assert the panel's Forge iframe mounted with real content.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { checkIssuePanelRenders } from "../_support/renderCheck";

const T = getTarget("chatwise-issue-panel");
// Any real wolfaenpak issue reaches the panel — the panel is not project-scoped,
// so no fixture issue is needed (the harness has no issue-fixture helper for a
// pure render smoke; `data/jira-build.mjs` createIssue exists if one is ever
// wanted). WFH-1 verified live over REST. Override with CHATWISE_PANEL_ISSUE.
const ISSUE = process.env.CHATWISE_PANEL_ISSUE || "WFH-1";
const PANEL_TITLE = "AI Assistant";

// Issue-panel visibility depends on host-page glance timing; retry transient flaps.
test.describe.configure({ retries: 3 });

test("ChatWise issue panel renders content inside the Forge iframe", async ({ page, recorder }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved — run `npm run discover` or set it in .env.");
  await checkIssuePanelRenders(page, recorder, T, ISSUE, PANEL_TITLE);
});
