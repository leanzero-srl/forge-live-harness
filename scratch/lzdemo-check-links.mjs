// List ATLAS issue links (blocks/is blocked by etc) to find a real predecessor→successor
// pair to schedule for a dependency-connector demo.
import { chromium } from "@playwright/test";

const PROFILE_PATH = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-lz-ppm";
const BASE = "https://leanzero-demo.atlassian.net";

const context = await chromium.launchPersistentContext(PROFILE_PATH, { headless: true, viewport: { width: 1440, height: 900 } });
try {
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(`${BASE}/jira/your-work`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1000);

  const result = await page.evaluate(async () => {
    const sRes = await fetch("/rest/api/3/search/jql", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ jql: "project = ATLAS ORDER BY key ASC", maxResults: 50, fields: ["summary", "issuelinks", "duedate", "issuetype", "parent"] }),
    });
    const d = await sRes.json();
    return (d.issues || []).map((i) => ({
      key: i.key,
      type: i.fields.issuetype?.name,
      summary: i.fields.summary,
      duedate: i.fields.duedate,
      parent: i.fields.parent?.key,
      links: (i.fields.issuelinks || []).map((l) => ({
        type: l.type?.name,
        inward: l.type?.inward,
        outward: l.type?.outward,
        inwardIssue: l.inwardIssue?.key,
        outwardIssue: l.outwardIssue?.key,
      })),
    }));
  });

  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
}
