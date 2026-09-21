import { loadEnv } from "../../data/env.mjs";
loadEnv();
const URL = process.env.LZ_PPM_TESTHOOK_URL, S = process.env.HARNESS_SECRET;
const hook = async (q) => {
  const r = await fetch(`${URL}?${new URLSearchParams(q)}`, { headers: { Authorization: `Bearer ${S}` } });
  const t = await r.text();
  try { return { status: r.status, body: JSON.parse(t) }; } catch { return { status: r.status, body: t }; }
};
const want = ["WFH-3729","WFH-3730","WFH-3731","WFH-3732","WFH-3733","WFH-3734","WFH-3735","WFH-3736","WFH-3737"];
for (let i = 0; i < 10; i++) {
  const cf = await hook({ what: "createFixture", name: "LZ790 retest bed", jql: 'project = WFH AND summary ~ "LZ790"' });
  const keys = (cf.body.issues || []).map((x) => x.key);
  console.log("attempt", i, cf.status, "planId", cf.body.planId, "n", keys.length);
  if (want.every((k) => keys.includes(k)) && keys.length === want.length) { console.log("PLAN=" + cf.body.planId); process.exit(0); }
  console.log("  got", keys.join(","));
  if (cf.body.planId) await hook({ what: "deleteFixture", planId: cf.body.planId });
  await new Promise((r) => setTimeout(r, 4000));
}
process.exit(1);
