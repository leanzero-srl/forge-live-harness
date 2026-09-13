import { post } from "../../data/jira.mjs";
const WS = "be9cca2f-5f41-446f-8f5c-76cda0be8417";
const B = `/gateway/api/jsm/assets/workspace/${WS}/v1`;
const q = process.argv[2];
const r = await post(`${B}/object/aql?startAt=0&maxResults=50&includeAttributes=true`, { qlQuery: q, startAt:0, maxResults:50, includeAttributes:true });
console.log("total:", r.total, "returned:", r.values?.length, "maxResults echo:", r.maxResults);
for (const o of r.values||[]) console.log(` ${o.id}\t${o.objectKey}\t${o.label}\t(${o.objectType?.name})`);
