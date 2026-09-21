import { loadEnv } from "../../data/env.mjs";
import fs from "node:fs";
loadEnv();
const tok = JSON.parse(fs.readFileSync("/tmp/lz790tok", "utf8"));
const P = "plan-test-muas0boj-ttkdmu";
const call = async (qs, body, method = "POST") => {
  const r = await fetch(`${tok.u}?${qs}`, { method, headers: { Authorization: `Bearer ${tok.t}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; }
};
const c = await call(`resource=reports&planId=${P}`, { name: "LZ790 coverage receipt", template: "sponsor" });
console.log("create", c.s, JSON.stringify(c.b).slice(0, 400));
const jobId = c.b?.job?.id;
let done = null;
for (let i = 0; i < 40; i++) {
  const r = await call(`resource=reports&planId=${P}&action=run&jobId=${jobId}`);
  const st = r.b?.job || r.b;
  console.log("run", i, r.s, JSON.stringify({ done: st?.done, stage: st?.stage, stop: st?.stopReason, reportId: st?.reportId }));
  if (st?.done) { done = st; break; }
  await new Promise((x) => setTimeout(x, 2000));
}
fs.writeFileSync("/tmp/lz790job", JSON.stringify(done || {}));
const list = await call(`resource=reports&planId=${P}`, null, "GET");
console.log("list", list.s, JSON.stringify(list.b).slice(0, 800));
