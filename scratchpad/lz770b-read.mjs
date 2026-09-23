import { hook, bed } from "./lz770b-lib.mjs";
const b = bed();
const p = await hook({ what: "plan", planId: b.planId });
const rows = (p.issues||p.rows||[]).map?.(x=>x) || [];
console.log("META", JSON.stringify({ issueCount: p.meta?.issueCount, savedEdits: p.meta?.savedEdits, editDrops: p.meta?.editDrops, contentHash: p.meta?.contentHash, version: p.meta?.version, summary: p.meta?.summary && { finish: p.meta.summary.finish, schedDigest: p.meta.summary.schedDigest, at: p.meta.summary.at, verdict: p.meta.summary.verdict } }, null, 2));
console.log("KEYS", Object.keys(p));
for (const i of (p.issues||[])) console.log(i.key, i.summary?.slice(0,40), "|start",i.startDate,"due",i.dueDate,"dur",i.duration,"buf",i.buffer,"| _orig", JSON.stringify(i._original), "| pred", JSON.stringify(i.predecessors), "parent", i.parentKey||i.parent);
