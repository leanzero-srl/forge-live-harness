// THE APP'S EXACT readGroupMembership PROJECTION, sampled right after the write
// and again five minutes later, and diffed with the app's diffFields.
import fs from "node:fs";
import path from "node:path";
const SD = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-ChatWise/6fbc7d3d-08a3-41d3-9673-62eea36d3527/scratchpad";
const KEY = fs.readFileSync(path.join(SD, ".org_key"), "utf8").trim();
const ORGID = fs.readFileSync(path.join(SD, ".org_id"), "utf8").trim();
const { request } = await import("/Users/mihaiperdum/Projects/forge-live-harness/data/jira.mjs");
const MEMBER_PAGE = 100;
async function org(p, init) {
  const res = await fetch(`https://api.atlassian.com/admin${p.replace("{org}", ORGID)}`, {
    method: init?.method || "GET",
    headers: { Authorization: `Bearer ${KEY}`, Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });
  const t = await res.text(); let body = t; try { body = JSON.parse(t); } catch {}
  return { status: res.status, body };
}
const SUBJECT = "712020:2b9d007d-db0d-47c9-b4ae-953f55501f55";
const dirs = await org("/v2/orgs/{org}/directories");
const directoryId = dirs.body?.data?.[0]?.directoryId || dirs.body?.data?.[0]?.id;
async function readGroupMembership(groupId, accountId) {
  const r0 = await org(`/v2/orgs/{org}/directories/${directoryId}/groups/${groupId}`);
  const g = r0.body?.data || {};
  const base = {
    groupId, name: g.name || null, managedBy: g.managedBy || null,
    externalSynced: g.externalSynced === true,
    memberCount: Number.isFinite(g.counts?.users) ? g.counts.users : null,
    deletable: typeof g.managementAccess?.deletable === "boolean" ? g.managementAccess.deletable : null,
  };
  const r = await org(`/v2/orgs/{org}/directories/${directoryId}/users?groupIds=${encodeURIComponent(groupId)}&limit=${MEMBER_PAGE}`);
  const rows = Array.isArray(r.body?.data) ? r.body.data : [];
  const found = rows.some((m) => String(m.accountId || m.account_id || "") === String(accountId));
  return { ...base, accountId: String(accountId), isMember: found ? true : rows.length >= MEMBER_PAGE ? null : false, memberCount: rows.length >= MEMBER_PAGE ? null : rows.length };
}
function diffFields(a = {}, b = {}) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((n) => JSON.stringify(a[n]) !== JSON.stringify(b[n])).sort();
}
const name = `harness-lagprobe3-${Date.now()}`;
const made = await request("POST", "/rest/api/3/group", { body: { name } });
const groupId = made.groupId || made.id;
console.log(`[p3] group ${name} id=${groupId}`);
try {
  await new Promise((r) => setTimeout(r, 8000));
  const add = await org(`/v2/orgs/{org}/directories/${directoryId}/groups/${groupId}/memberships`, { method: "POST", body: { accountId: SUBJECT } });
  const t0 = Date.now();
  console.log(`[p3] POST status=${add.status}`);
  const after = await readGroupMembership(groupId, SUBJECT);
  console.log(`[p3] AFTER (+${Date.now() - t0}ms) ${JSON.stringify(after)}`);
  for (const w of [30000, 120000, 300000]) {
    const d = t0 + w - Date.now(); if (d > 0) await new Promise((r) => setTimeout(r, d));
    const now = await readGroupMembership(groupId, SUBJECT);
    console.log(`[p3] NOW   (+${Math.round((Date.now() - t0) / 1000)}s) ${JSON.stringify(now)}`);
    console.log(`[p3] DRIFT (+${Math.round((Date.now() - t0) / 1000)}s) -> [${diffFields(after, now).join(", ")}]`);
  }
} finally {
  try { await request("DELETE", `/rest/api/3/group?groupId=${groupId}`); console.log("[p3] group deleted"); } catch (e) { console.log(`[p3] CLEANUP FAILED ${e?.message}`); }
}
