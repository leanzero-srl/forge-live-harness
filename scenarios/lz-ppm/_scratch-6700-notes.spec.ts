// SCRATCH 6.70.0 — item 8: the "what the tickets say" notes layer.
// The comments layer is gated on meta.aiView.enabled, which LZPT does NOT have.
// Rather than flip that flag on the measuring instrument (and leave a p:*:notes
// key behind that only deletePlan can remove), this drives a THROWAWAY fixture
// plan over the SAME LZPT rows: deleteFixture -> deleteAllPlanData removes the
// notes key too, so the bed keeps its exact shape.
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
import * as fs from "fs";

const OUT = "/Users/mihaiperdum/Projects/forge-live-harness/scratchpad/live-6700";
const STATE = `${OUT}/notes-state.json`;
test.describe.configure({ retries: 0, timeout: 900_000, mode: "serial" });

const tokenFile = `${OUT}/token.json`;
async function restCall(name: string, payload: any) {
  const t = JSON.parse(fs.readFileSync(tokenFile, "utf8"));
  const url = new URL(t.url);
  url.searchParams.set("resource", "call");
  url.searchParams.set("name", name);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${t.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function rest(method: string, query: Record<string,string>, body?: any) {
  const t = JSON.parse(fs.readFileSync(tokenFile, "utf8"));
  const url = new URL(t.url);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    method,
    headers: { Authorization: `Bearer ${t.token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test("NT-A scope probe on LZPT-186; an OWNED throwaway plan over the LZPT rows with aiView on", async () => {
  const probe: any = await getTestState("lz-ppm", { what: "commentsProbe", key: "LZPT-186" });
  console.log("COMMENTS_PROBE LZPT-186:", JSON.stringify(probe));
  expect(probe.status).toBe(200);
  expect(probe.scopeOk).toBe(true);

  const name = `[harness-test] 6700 notes ${Date.now().toString(36)}`;
  // Created through the REST door so the token's account OWNS it: a hook fixture
  // writes members:[] and requireEdit then refuses every settings write (403).
  const created = await rest("POST", { resource: "plans", wait: "20" }, { name, jql: "project = LZPT", index: true });
  console.log("CREATE ->", created.status);
  const planId = created.body?.plan?.id;
  fs.writeFileSync(STATE, JSON.stringify({ planId, name }, null, 2));
  expect(planId, JSON.stringify(created.body).slice(0, 400)).toBeTruthy();
  for (let i = 0; i < 30; i++) {
    const p: any = await getTestState("lz-ppm", { what: "plan", planId });
    if (p.meta?.status === "indexed" && (p.issues || []).length > 40) { console.log("INDEXED", (p.issues || []).length, "issues"); break; }
    await new Promise((r) => setTimeout(r, 4000));
  }
  const on = await rest("PUT", { resource: "plans", id: planId }, { changes: { aiView: { enabled: true } } });
  console.log("ENABLE aiView ->", on.status, JSON.stringify(on.body).slice(0, 200));
  const meta: any = await getTestState("lz-ppm", { what: "plan", planId });
  console.log("meta.aiView =", JSON.stringify(meta.meta?.aiView), "| issues", (meta.issues || []).length);
  expect(meta.meta?.aiView?.enabled).toBe(true);
});

test("NT-B dry=1: which tickets would be read, and what the fetch drops", async () => {
  const st = JSON.parse(fs.readFileSync(STATE, "utf8"));
  const r: any = await getTestState("lz-ppm", { what: "aiNotes", planId: st.planId, dry: "1" });
  fs.writeFileSync(`${OUT}/notes-dry.json`, JSON.stringify(r, null, 2));
  console.log("AVAILABLE:", r.available, "| unavailable:", r.unavailable);
  console.log("CANDIDATES (" + (r.candidates || []).length + "):");
  for (const c of r.candidates || []) console.log("   " + c);
  console.log("JIRA READS:", r.jiraReads, "| DROPPED:", JSON.stringify(r.dropped), "| promptBytes:", r.promptBytes);
  console.log("PAYLOAD KEYS:", JSON.stringify((r.payload?.tickets || r.payload || []).map?.((t: any) => t.key) || Object.keys(r.payload || {})));
  fs.writeFileSync(`${OUT}/notes-payload.json`, JSON.stringify(r.payload ?? null, null, 2));
  expect(r.available).toBe(true);
});

test("NT-C dry=0 ONCE: the extracted notes", async () => {
  const st = JSON.parse(fs.readFileSync(STATE, "utf8"));
  const r: any = await getTestState("lz-ppm", { what: "aiNotes", planId: st.planId, dry: "0" });
  fs.writeFileSync(`${OUT}/notes-real.json`, JSON.stringify(r, null, 2));
  console.log("CALLS:", r.calls, "| wrote:", r.wrote, "| bytes:", r.bytes, "| usage:", JSON.stringify(r.usage), "| failed:", JSON.stringify(r.failed));
  console.log("DROPPED:", JSON.stringify(r.dropped), "| partial:", r.partial);
  console.log("NOTES:\n" + JSON.stringify(r.notes, null, 1));
  expect(r.calls).toBeGreaterThanOrEqual(0);
});

test("NT-Z delete the throwaway plan (takes p:*:notes with it)", async () => {
  const st = JSON.parse(fs.readFileSync(STATE, "utf8"));
  const d = await rest("DELETE", { resource: "plans", id: st.planId });
  console.log("DELETE via REST ->", d.status, JSON.stringify(d.body).slice(0, 200));
  if (d.status !== 200) { const del: any = await getTestState("lz-ppm", { what: "deleteFixture", planId: st.planId }); console.log("fallback deleteFixture:", JSON.stringify(del)); }
  const plans: any = await getTestState("lz-ppm", { what: "plans" });
  const still = (plans.plans || []).some((p: any) => p.id === st.planId);
  console.log("STILL_EXISTS:", still);
  expect(still).toBe(false);
});
