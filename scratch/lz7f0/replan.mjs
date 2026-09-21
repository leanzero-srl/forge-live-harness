// Delete the contaminated LZ7F0 plan and create a FRESH one over the same four
// issues, so the "does a Discard-All-without-Save also persist the measured
// duration?" question is asked on a clean plan.
import fs from "fs";
const HOOK = process.env.LZ_PPM_TESTHOOK_URL, SEC = process.env.HARNESS_SECRET;
const hook = async (qs) => { const r = await fetch(`${HOOK}?${qs}`, { headers: { Authorization: `Bearer ${SEC}` } }); const t = await r.text(); try { return JSON.parse(t); } catch { return { status: r.status, text: t.slice(0, 300) }; } };
const bedUrl = new URL("./bed.json", import.meta.url);
const bed = JSON.parse(fs.readFileSync(bedUrl, "utf8"));
if (bed.planId) console.log("DELETE_OLD", JSON.stringify(await hook(`what=deleteFixture&planId=${bed.planId}`)).slice(0, 200));
const admin = await hook(`what=mintApiToken&accountId=${encodeURIComponent(bed.accountId)}&name=lz7f0b&role=admin`);
const api = async (method, query, body) => {
  const url = new URL(admin.url); for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { method, headers: { Authorization: `Bearer ${admin.token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const t = await res.text(); let j = null; try { j = JSON.parse(t); } catch {} return { status: res.status, json: j, text: t };
};
const planName = `LZ7F0b bulk F1 bed`;
const c = await api("POST", { resource: "plans" }, { name: planName, jql: bed.jql, protectionEnabled: false, defaultAccess: "none", wait: 120 });
console.log("CREATE", c.status, c.json?.plan?.id);
const planId = c.json?.plan?.id;
for (let i = 0; i < 30; i++) { const p = await api("GET", { resource: "plans", id: planId }); if (p.json?.plan?.issueCount > 0) { console.log("INDEXED", p.json.plan.issueCount); break; } await new Promise(r => setTimeout(r, 5000)); }
const rows = await hook(`what=plan&planId=${planId}`);
console.log((rows.issues || []).map(i => `${i.key} ${i.startDate}|${i.dueDate}|${i.duration}|${i.buffer} orig ${i._original.duration}|${i._original.buffer}`).join("\n"));
fs.writeFileSync(bedUrl, JSON.stringify({ ...bed, planId, planName }, null, 2));
console.log("TOKENS_LIVE", JSON.stringify((await hook("what=apiTokens")).tokens.filter(t => !t.revokedAt).map(t => t.id)));
