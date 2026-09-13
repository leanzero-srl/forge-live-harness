import { get } from "/Users/mihaiperdum/Projects/forge-live-harness/data/jira.mjs";
const r = await get("/rest/api/3/project/search?maxResults=25&orderBy=-lastIssueUpdatedTime&expand=insight");
for (const p of r.values) console.log(`${p.key.padEnd(9)} count=${String(p.insight?.totalIssueCount ?? "?").padStart(5)}  last=${p.insight?.lastIssueUpdateTime ?? "(none)"}`);
