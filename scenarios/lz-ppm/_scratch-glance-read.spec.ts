// TESTER scratch: read the issue-position pack for LZPT-194 / 205 / 203 through the REST door.
import { test } from "@playwright/test";
import { getTestState } from "../../testhook/client";
test.describe.configure({ timeout: 180_000 });
test("glance packs", async () => {
  const BASE = process.env.JIRA_BASE_URL!;
  const AUTH = "Basic " + Buffer.from(`${process.env.JIRA_ADMIN_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");
  const me: any = await (await fetch(`${BASE}/rest/api/3/myself`, { headers: { Authorization: AUTH, Accept: "application/json" } })).json();
  const admin: any = await getTestState("lz-ppm", { what: "mintApiToken", accountId: me.accountId, name: "tester-glance", role: "admin" });
  for (const key of ["LZPT-194", "LZPT-205", "LZPT-203", "LZPT-201"]) {
    const url = new URL(admin.url);
    url.searchParams.set("resource", "issues"); url.searchParams.set("action", "position"); url.searchParams.set("key", key);
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${admin.token}` } });
    const b: any = await res.json();
    console.log(`\n===== ${key} status=${res.status}`);
    if (b?.selected?.graph) b.selected.graph = `[${b.selected.graph.length} rows]`;
    console.log(JSON.stringify(b, null, 1));
  }
  await getTestState("lz-ppm", { what: "revokeApiToken", id: admin.row.id }).catch(() => {});
});
