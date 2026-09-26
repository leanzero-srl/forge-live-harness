import { hook, bed, api } from "./lz770b-lib.mjs";
const b = bed(); const P = b.planId; const K = b.c1;
const row = async () => { const p = await hook({what:"plan",planId:P}); const i=(p.issues||[]).find(x=>x.key===K);
  return { meta:{savedEdits:p.meta?.savedEdits, editDrops:p.meta?.editDrops, contentHash:p.meta?.contentHash, version:p.meta?.version, finish:p.meta?.summary?.finish, digest:p.meta?.summary?.schedDigest},
           row:{start:i.startDate,due:i.dueDate,dur:i.duration,orig:i._original} }; };
console.log("BEFORE", JSON.stringify(await row(),null,1));
console.log("EDIT1", JSON.stringify(await hook({what:"applyEdit",planId:P,key:K,field:"dueDate",value:"2026-10-12"})));
console.log("EDIT2", JSON.stringify(await hook({what:"applyEdit",planId:P,key:K,field:"duration",value:"2"})));
console.log("AFTER_EDIT", JSON.stringify(await row(),null,1));
const tok = { url: b.tokenUrl, token: b.token };
const t0=Date.now();
const r = await api(tok, "POST", { resource:"plans", id:P, action:"index" });
console.log("INDEX", r.status, r.text.slice(0,300));
for (let i=0;i<40;i++){ await new Promise(r=>setTimeout(r,3000)); const pr = await api(tok,"POST",{resource:"plans",id:P,action:"progress"}); const s=pr.json?.status; if(s && s!=="queued" && s!=="indexing"){ console.log("PROGRESS", JSON.stringify(pr.json)); break;} }
console.log("INDEX_MS", Date.now()-t0);
console.log("AFTER_INDEX", JSON.stringify(await row(),null,1));
