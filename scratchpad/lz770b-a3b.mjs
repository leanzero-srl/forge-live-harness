import { hook, bed } from "./lz770b-lib.mjs";
const b = bed(); const P=b.planId;
const m = async () => { const p=await hook({what:"plan",planId:P}); const i=(p.issues||[]).find(x=>x.key===b.c1); return {hash:p.meta?.contentHash, ver:p.meta?.version, due:i.dueDate, dur:i.duration}; };
console.log("PRE", JSON.stringify(await m()));
await hook({what:"refreshPlan",planId:P});
console.log("POST1", JSON.stringify(await m()));
await hook({what:"refreshPlan",planId:P});
console.log("POST2", JSON.stringify(await m()));
