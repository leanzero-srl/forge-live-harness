import { get } from "/Users/mihaiperdum/Projects/forge-live-harness/data/jira.mjs";
for (const k of ["WFH-2254","WFH-2255","WFH-2256","WFH-2257","CGL1-2","COGTEST-2684","COGTEST-2685","TPP-55"]) {
  const i = await get(`/rest/api/3/issue/${k}?fields=summary,project,status,created`).catch(()=>null);
  console.log(k.padEnd(14), i ? `EXISTS  "${i.fields.summary}" (${i.fields.project.key}, ${i.fields.status.name})` : "gone");
}
const j = await get(`/rest/api/3/search/jql?jql=${encodeURIComponent('labels = "harness-test" ORDER BY created DESC')}&fields=summary,project,created&maxResults=20`).catch(e=>({error:String(e).slice(0,150)}));
console.log("harness-test labelled remaining:", j.issues ? j.issues.map(i=>`${i.key} "${i.fields.summary}"`).join(" | ") : JSON.stringify(j));
const s = await get(`/rest/api/3/search/jql?jql=${encodeURIComponent('summary ~ "auto created" ORDER BY created DESC')}&fields=summary,project&maxResults=20`).catch(e=>({error:String(e).slice(0,150)}));
console.log('summary~"auto created":', s.issues ? s.issues.map(i=>`${i.key} (${i.fields.project.key}) "${i.fields.summary}"`).join(" | ") : JSON.stringify(s));
