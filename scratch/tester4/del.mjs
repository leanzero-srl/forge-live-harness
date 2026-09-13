import { request, get } from "/Users/mihaiperdum/Projects/forge-live-harness/data/jira.mjs";
const k = process.argv[2];
const r = await request("DELETE", `/rest/api/3/issue/${k}?deleteSubtasks=true`, { raw: true });
console.log("DELETE", k, r.status, r.text?.slice(0,300));
const still = await get(`/rest/api/3/issue/${k}?fields=summary,status`).catch(e=>({err:String(e).slice(0,120)}));
console.log("AFTER:", JSON.stringify(still.key ? {key:still.key, summary: still.fields.summary} : still));
