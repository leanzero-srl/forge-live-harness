import { setDates } from "../../data/jira-build.mjs";
import { rest, hook, sleep } from "./rest.mjs";
import fs from "fs";
const bed = JSON.parse(fs.readFileSync(new URL("./bed.json", import.meta.url)));
const fc = { startDate:"customfield_10015", dueDate:"duedate", duration:"customfield_10180", buffer:"customfield_10181" };
const S13 = bed.S[12];
await setDates(S13, { start:"2026-11-16", due:"2026-11-20", duration:5, buffer:"No" }, fc);
console.log("S13", S13, "moved to 2026-11-16..2026-11-20");
// P1 must be the 9-issue epic subtree only
const del = await rest(`resource=plans&id=${bed.p1}`, { method:"DELETE" });
console.log("deleted old P1", del.status);
const jql9 = `key in (${[bed.epic,bed.A,bed.B,bed.C,bed.D,bed.Q,bed.P,bed.U,bed.R].join(",")})`;
const p1 = await rest("resource=plans", { method:"POST", body:{ name:"LZ780 Rollout programme (tester)", jql: jql9, protectionEnabled:false, wait:30 }});
console.log("P1", p1.status, p1.plan?.id);
bed.p1 = p1.plan?.id; bed.jql9 = jql9;
fs.writeFileSync(new URL("./bed.json", import.meta.url), JSON.stringify(bed,null,2));
await sleep(4000);
const ix = await hook(`what=refreshPlan&planId=${bed.p2}`);
console.log("reindex P2", ix.ok ?? ix.status ?? Object.keys(ix).slice(0,5));
