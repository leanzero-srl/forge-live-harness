// TESTER scratch: read the stored AI view + OVERLAY through the app's own REST door.
import { test } from "@playwright/test";
import { getTestState } from "../../testhook/client";
const PLAN = process.env.OVL_PLAN || "plan-msq9dg8l-gz6mz1";
test.describe.configure({ timeout: 120_000 });
test("read overlay", async () => {
  const BASE = process.env.JIRA_BASE_URL!;
  const AUTH = "Basic " + Buffer.from(`${process.env.JIRA_ADMIN_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");
  const me: any = await (await fetch(`${BASE}/rest/api/3/myself`, { headers: { Authorization: AUTH, Accept: "application/json" } })).json();
  const admin: any = await getTestState("lz-ppm", { what: "mintApiToken", accountId: me.accountId, name: "tester-overlay", role: "admin" });
  const url = new URL(admin.url);
  url.searchParams.set("resource", "ai"); url.searchParams.set("action", "view"); url.searchParams.set("planId", PLAN);
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${admin.token}` } });
  const body: any = await res.json();
  console.log("STATUS", res.status);
  console.log("OVERLAY =", JSON.stringify(body?.overlay ?? null, null, 1));
  console.log("VIEW SEGMENTS =", JSON.stringify((body?.view?.segments || []).map((s: any) => ({ detId: s.detId, name: s.name, n: s.stats?.n })), null, 1));
  console.log("TOP KEYS =", Object.keys(body || {}));
  if (process.env.REVOKE === "1") await getTestState("lz-ppm", { what: "revokeApiToken", id: admin.row.id }).catch((e) => console.log("revoke failed", String(e)));
});
