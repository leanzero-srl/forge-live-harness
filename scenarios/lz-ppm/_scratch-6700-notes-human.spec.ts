// SCRATCH 6.70.0 — item 8, the half LZPT cannot answer on its own.
// Every comment on LZPT is APP-authored (CogniRunner tool logs / our own guard
// warnings), so the notes layer correctly extracts NOTHING and the question
// "does the model say something TRUE about the comments" is unanswerable.
// This posts three HUMAN comments (as the admin, via REST) on three candidate
// tickets, runs ONE real build on an owned throwaway plan, prints the notes for
// judgement, then DELETES every comment it wrote and the plan.
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { post, request, get } from "../../data/jira.mjs";
import * as fs from "fs";

const OUT = "/Users/mihaiperdum/Projects/forge-live-harness/scratchpad/live-6700";
const STATE = `${OUT}/notes-human-state.json`;
const tokenFile = `${OUT}/token.json`;
test.describe.configure({ retries: 0, timeout: 900_000, mode: "serial" });

async function rest(method: string, query: Record<string, string>, body?: any) {
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
const adf = (text: string) => ({ type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

// Three DIFFERENT, checkable facts. The judgement is whether the extracted note
// repeats THESE facts for THESE keys and invents nothing.
const SEED: Array<[string, string[]]> = [
  ["LZPT-191", [
    "Still blocked on the vendor: their API sandbox has been down since Monday and support has not given us a restore date.",
    "Chasing again today. If we do not have the sandbox by Friday this slips another two weeks.",
  ]],
  ["LZPT-196", [
    "We finished the migration script over the weekend and it ran clean on the copy. Waiting on a change window to run it for real.",
  ]],
  ["LZPT-201", [
    "Scope changed - finance now want the quarterly breakdown as well, so this is bigger than the original estimate.",
  ]],
];

test("NH-A post three human comments and create an owned plan with aiView on", async () => {
  const posted: Array<{ key: string; id: string }> = [];
  for (const [key, bodies] of SEED) {
    for (const b of bodies) {
      const r: any = await post(`/rest/api/3/issue/${key}/comment`, { body: adf(b) });
      posted.push({ key, id: r.id });
    }
  }
  console.log("POSTED:", JSON.stringify(posted));
  const name = `[harness-test] 6700 notes-human ${Date.now().toString(36)}`;
  const created = await rest("POST", { resource: "plans", wait: "20" }, { name, jql: "project = LZPT", index: true });
  const planId = created.body?.plan?.id;
  fs.writeFileSync(STATE, JSON.stringify({ planId, posted }, null, 2));
  expect(planId, JSON.stringify(created.body).slice(0, 300)).toBeTruthy();
  for (let i = 0; i < 30; i++) {
    const p: any = await getTestState("lz-ppm", { what: "plan", planId });
    if (p.meta?.status === "indexed" && (p.issues || []).length > 40) break;
    await new Promise((r) => setTimeout(r, 4000));
  }
  const on = await rest("PUT", { resource: "plans", id: planId }, { changes: { aiView: { enabled: true } } });
  console.log("ENABLE aiView ->", on.status);
  const meta: any = await getTestState("lz-ppm", { what: "plan", planId });
  expect(meta.meta?.aiView?.enabled).toBe(true);
});

test("NH-B dry=1 then ONE real build; print the notes for judgement", async () => {
  const st = JSON.parse(fs.readFileSync(STATE, "utf8"));
  const d: any = await getTestState("lz-ppm", { what: "aiNotes", planId: st.planId, dry: "1" });
  console.log("DRY dropped:", JSON.stringify(d.dropped), "| promptBytes:", d.promptBytes, "| jiraReads:", d.jiraReads);
  console.log("DRY payload:\n" + JSON.stringify(d.payload, null, 1).slice(0, 4000));
  fs.writeFileSync(`${OUT}/notes-human-dry.json`, JSON.stringify(d, null, 2));

  const r: any = await getTestState("lz-ppm", { what: "aiNotes", planId: st.planId, dry: "0" });
  fs.writeFileSync(`${OUT}/notes-human-real.json`, JSON.stringify(r, null, 2));
  console.log("CALLS:", r.calls, "| wrote:", r.wrote, "| bytes:", r.bytes, "| usage:", JSON.stringify(r.usage), "| failed:", JSON.stringify(r.failed), "| partial:", r.partial);
  console.log("DROPPED:", JSON.stringify(r.dropped));
  console.log("NOTES:\n" + JSON.stringify(r.notes, null, 1));
  expect(r.calls).toBe(1);
});

test("NH-Z delete every comment written and the plan", async () => {
  const st = JSON.parse(fs.readFileSync(STATE, "utf8"));
  let del = 0;
  for (const c of st.posted) {
    try { await request("DELETE", `/rest/api/3/issue/${c.key}/comment/${c.id}`, { raw: true }); del++; }
    catch (e) { console.log("comment delete failed", c.key, c.id, String(e).slice(0, 100)); }
  }
  console.log(`COMMENTS DELETED: ${del}/${st.posted.length}`);
  for (const [key] of SEED) {
    const j: any = await get(`/rest/api/3/issue/${key}/comment?maxResults=50`);
    const mine = (j.comments || []).filter((c: any) => st.posted.some((p: any) => p.id === c.id));
    console.log(`${key}: ${j.total} comment(s) left, ${mine.length} of mine`);
    expect(mine.length).toBe(0);
  }
  const d = await rest("DELETE", { resource: "plans", id: st.planId });
  console.log("PLAN DELETE ->", d.status);
  const plans: any = await getTestState("lz-ppm", { what: "plans" });
  const still = (plans.plans || []).some((p: any) => p.id === st.planId);
  console.log("STILL_EXISTS:", still);
  expect(still).toBe(false);
});
