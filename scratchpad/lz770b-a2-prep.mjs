import { hook, bed } from "./lz770b-lib.mjs";
import { setFields } from "../data/jira-build.mjs";
const b = bed(); const P=b.planId;
const p = await hook({what:"plan",planId:P});
console.log("STORED_BEFORE");
for (const i of p.issues) console.log(i.key, i.startDate, i.dueDate, i.duration, "| orig", i._original?.startDate, i._original?.dueDate, i._original?.duration);
console.log("META", JSON.stringify({savedEdits:p.meta?.savedEdits, editDrops:p.meta?.editDrops, ver:p.meta?.version, hash:p.meta?.contentHash, finish:p.meta?.summary?.finish, digest:p.meta?.summary?.schedDigest, at:p.meta?.summary?.at}));
await setFields(b.l1, { duedate: "2026-11-13" });
console.log("JIRA_SET", b.l1, "duedate=2026-11-13");
