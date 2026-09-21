// Unasked probe: does the issue-updated TRIGGER alone drop a saved edit silently?
import { hook, sleep } from "./rest.mjs";
import { put } from "../../data/jira.mjs";
const PLAN = process.env.PLAN_ID, KEY = "WFH-3714";
await put(`/rest/api/3/issue/${KEY}`, { fields: { duedate: "2026-10-23" } });
await hook(`what=refreshPlan&planId=${PLAN}`);
const meta0 = await hook(`what=planMeta&planId=${PLAN}`);
console.log("editDrops at start:", JSON.stringify((meta0.meta||meta0).editDrops));
console.log("applyEdit:", JSON.stringify(await hook(`what=applyEdit&planId=${PLAN}&key=${KEY}&field=dueDate&value=2026-11-06`)).slice(0,140));
await put(`/rest/api/3/issue/${KEY}`, { fields: { duedate: "2026-12-04" } });
console.log("jira moved to 2026-12-04; waiting 25s for the issue-updated trigger only (NO index)");
await sleep(25000);
const meta1 = await hook(`what=planMeta&planId=${PLAN}`);
console.log("savedEdits:", JSON.stringify((meta1.meta||meta1).savedEdits), "editDrops:", JSON.stringify((meta1.meta||meta1).editDrops));
const p = await hook(`what=plan&planId=${PLAN}`);
const row = (p.issues||[]).find(i=>i.key===KEY);
console.log("stored row due:", row && row.dueDate, "_savedEdit:", JSON.stringify(row && row._savedEdit));
// restore
await put(`/rest/api/3/issue/${KEY}`, { fields: { duedate: "2026-10-23" } });
await sleep(3000);
console.log("refresh:", (await hook(`what=refreshPlan&planId=${PLAN}`)).ok);
const meta2 = await hook(`what=planMeta&planId=${PLAN}`);
console.log("after restore editDrops:", JSON.stringify((meta2.meta||meta2).editDrops), "savedEdits:", JSON.stringify((meta2.meta||meta2).savedEdits));
