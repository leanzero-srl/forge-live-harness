import { hook, bed, save, api } from "./lz770b-lib.mjs";
const b = bed(); const tok={url:b.tokenUrl,token:b.token};
if (b.planId) { const d = await api(tok,"DELETE",{resource:"plans",id:b.planId}); console.log("DELETE", d.status, d.text.slice(0,120)); }
const r = await api(tok,"POST",{resource:"plans"},{name:"[harness-test] LZ770B saved-edit bed", jql: b.jql, index:true, wait:20});
console.log("CREATE", r.status, r.json?.plan?.id, JSON.stringify(r.json?.progress));
save({ planId: r.json?.plan?.id });
const p = await hook({what:"plan",planId:r.json.plan.id});
console.log("META", JSON.stringify({count:p.meta?.issueCount, savedEdits:p.meta?.savedEdits, editDrops:p.meta?.editDrops, hash:p.meta?.contentHash, finish:p.meta?.summary?.finish, digest:p.meta?.summary?.schedDigest, ver:p.meta?.version}));
for (const i of p.issues) console.log(i.key, i.startDate, i.dueDate, i.duration, JSON.stringify(i.predecessors));
