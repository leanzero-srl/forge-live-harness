import { loadEnv } from "../../data/env.mjs";
import fs from "node:fs";
loadEnv();
const tok = JSON.parse(fs.readFileSync("/tmp/lz790tok", "utf8"));
const P = "plan-test-muas0boj-ttkdmu";
const ver = fs.readFileSync("/tmp/lz790ver", "utf8").trim();
const call = async (qs, body, method = "POST") => {
  const r = await fetch(`${tok.u}?${qs}`, { method, headers: { Authorization: `Bearer ${tok.t}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; }
};
// 1) save a RELEASE-scoped target with one undated member
const st = await call(`resource=call&name=saveTarget`, { payload: { planId: P, target: { name: "LZ790 release gate", date: "2026-12-31", scope: { type: "release", id: ver } }, expectedVersion: 34 } });
console.log("saveTarget", st.s, JSON.stringify(st.b).slice(0, 700));
