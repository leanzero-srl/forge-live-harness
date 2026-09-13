import { request } from "/Users/mihaiperdum/Projects/forge-live-harness/data/jira.mjs";
const cases = [
  ["default (no orderBy)", "/rest/api/3/project/search?maxResults=25"],
  ["name", "/rest/api/3/project/search?maxResults=25&orderBy=name"],
  ["name + expand= (empty, as app sends)", "/rest/api/3/project/search?maxResults=25&orderBy=name&expand="],
  ["-lastIssueUpdatedTime (no expand)", "/rest/api/3/project/search?maxResults=25&orderBy=-lastIssueUpdatedTime"],
  ["-lastIssueUpdatedTime&expand=insight (WHAT THE APP NOW SENDS)", "/rest/api/3/project/search?maxResults=25&orderBy=-lastIssueUpdatedTime&expand=insight"],
  ["lastIssueUpdatedTime&expand=insight", "/rest/api/3/project/search?maxResults=25&orderBy=lastIssueUpdatedTime&expand=insight"],
  ["-lastIssueUpdatedDate (the DEAD one)", "/rest/api/3/project/search?maxResults=25&orderBy=-lastIssueUpdatedDate"],
];
for (const [label, path] of cases) {
  const r = await request("GET", path, { raw: true });
  if (r.status >= 400) { console.log(`${label}\n  HTTP ${r.status}: ${r.text.slice(0,200)}`); continue; }
  const j = JSON.parse(r.text);
  console.log(`${label}\n  HTTP ${r.status} total=${j.total} keys=${j.values.map(p=>p.key).join(",")}`);
  if (j.values[0]?.insight) console.log(`  insight[0]=${JSON.stringify(j.values[0].insight)} insight[last]=${JSON.stringify(j.values[j.values.length-1].insight)}`);
}
