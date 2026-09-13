import { request } from "/Users/mihaiperdum/Projects/forge-live-harness/data/jira.mjs";
for (const ob of ["-lastIssueUpdatedDate","-lastIssueUpdatedTime","-issueCount","-name"]) {
  const r = await request("GET", `/rest/api/3/project/search?maxResults=25&orderBy=${encodeURIComponent(ob)}`, { raw: true });
  console.log("=====", ob, "status", r.status);
  if (r.status >= 400) { console.log(r.text.slice(0,500)); continue; }
  const j = JSON.parse(r.text);
  console.log(j.values.map(p=>p.key).join(","));
}
