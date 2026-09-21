import { loadEnv } from "../../data/env.mjs";
import fs from "node:fs";
loadEnv();
const tok = JSON.parse(fs.readFileSync("/tmp/lz790tok", "utf8"));
const P = "plan-test-muas0boj-ttkdmu";
const RID = "d61b7717-5586-4dac-899f-fc96df1fbd01";
const call = async (qs) => { const r = await fetch(`${tok.u}?${qs}`, { headers: { Authorization: `Bearer ${tok.t}` } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t), raw: t }; } catch { return { s: r.status, b: null, raw: t }; } };
for (const qs of [`resource=reports&planId=${P}&id=${RID}`, `resource=reports&planId=${P}&reportId=${RID}`, `resource=reports&planId=${P}&action=get&id=${RID}`]) {
  const r = await call(qs);
  console.log("---", qs, r.s, r.raw.length);
  if (r.s === 200 && r.raw.length > 500) { fs.writeFileSync("/tmp/lz790report.json", r.raw); console.log("saved"); break; }
  console.log(r.raw.slice(0, 200));
}
