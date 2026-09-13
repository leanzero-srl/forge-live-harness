import { get } from "/Users/mihaiperdum/Projects/forge-live-harness/data/jira.mjs";
for (const k of ["COGTEST","TPP","WFH","CGL1"]) {
  const p = await get(`/rest/api/3/mypermissions?projectKey=${k}&permissions=DELETE_ISSUES,EDIT_ISSUES,TRANSITION_ISSUES`);
  console.log(k, JSON.stringify(Object.fromEntries(Object.entries(p.permissions).map(([n,v])=>[n,v.havePermission]))));
}
for (const k of ["COGTEST-2684","COGTEST-2685","TPP-55"]) {
  const i = await get(`/rest/api/3/issue/${k}?fields=summary,status,project,created,reporter`).catch(()=>null);
  console.log(k, i ? `${i.fields.project.key} "${i.fields.summary}" status=${i.fields.status.name} reporter=${i.fields.reporter?.displayName}` : "GONE");
}
// asc vs desc on the accepted parameter name
for (const ob of ["lastIssueUpdatedTime","-lastIssueUpdatedTime","issueCount","-issueCount"]) {
  const r = await get(`/rest/api/3/project/search?maxResults=25&orderBy=${encodeURIComponent(ob)}`);
  console.log(ob, "->", r.values.map(p=>p.key).join(","));
}
