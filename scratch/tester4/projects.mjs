import { get, request } from "/Users/mihaiperdum/Projects/forge-live-harness/data/jira.mjs";
const plain = await get("/rest/api/3/project/search?maxResults=25");
console.log("PLAIN total:", plain.total, "returned:", plain.values.length);
console.log("PLAIN keys:", plain.values.map(p=>p.key).join(","));
for (const ob of ["-lastIssueUpdatedDate","lastIssueUpdatedDate","-lastIssueUpdatedTime"]) {
  try {
    const r = await get(`/rest/api/3/project/search?maxResults=25&orderBy=${encodeURIComponent(ob)}`);
    console.log(`ORDER ${ob}: OK total=${r.total} keys=${r.values.map(p=>p.key).join(",")}`);
  } catch (e) {
    console.log(`ORDER ${ob}: FAIL ${e.message?.slice(0,200)}`);
  }
}
const all = await get("/rest/api/3/project/search?maxResults=100");
console.log("ALL total:", all.total);
console.log(JSON.stringify(all.values.map(p=>({key:p.key,name:p.name})), null, 0));
