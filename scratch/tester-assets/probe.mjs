import { get } from "../../data/jira.mjs";
const ws = await get("/rest/servicedeskapi/assets/workspace");
console.log("workspaces:", JSON.stringify(ws));
const id = ws?.values?.[0]?.workspaceId;
if (!id) process.exit(0);
const schemas = await get(`/gateway/api/jsm/assets/workspace/${id}/v1/objectschema/list?maxResults=50&includeCounts=true`);
console.log("schemas:", JSON.stringify(schemas, null, 1).slice(0, 5000));
