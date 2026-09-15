import { chromium } from "@playwright/test";
const PROFILE_PATH = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-lz-ppm";
const BASE = "https://leanzero-demo.atlassian.net";

const context = await chromium.launchPersistentContext(PROFILE_PATH, { headless: true, viewport: { width: 1440, height: 900 } });
try {
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(`${BASE}/jira/your-work`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1000);
  const out = await page.evaluate(async () => {
    const res = {};
    for (const proj of ["HELIOS", "LEDGER"]) {
      const sRes = await fetch("/rest/api/3/search/jql", {
        method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ jql: `project = ${proj} ORDER BY key ASC`, maxResults: 50, fields: ["summary","issuelinks","duedate","issuetype"] }),
      });
      const d = await sRes.json();
      const issues = (d.issues || []).map((i) => ({
        key: i.key, type: i.fields.issuetype?.name, duedate: i.fields.duedate,
        links: (i.fields.issuelinks || []).map((l) => ({ type: l.type?.name, out: l.outwardIssue?.key, in: l.inwardIssue?.key, outward: l.type?.outward, inward: l.type?.inward })),
      }));
      const blocksLinks = issues.flatMap(i => i.links.filter(l => l.type !== "Relates").map(l => ({from: i.key, ...l})));
      const withDue = issues.filter(i => i.duedate).map(i => ({key: i.key, due: i.duedate}));
      res[proj] = { total: issues.length, nonRelatesLinks: blocksLinks, withDue };
    }
    return res;
  });
  console.log(JSON.stringify(out, null, 2));
} finally {
  await context.close();
}
