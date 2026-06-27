// License Leash DEEP — Forge SQL state + the activity-tracking pipeline, via the dev READ-ONLY hook.
// Proves the 8 SQL tables migrated, user_activity's schema is correct, and the 11 confluence:* activity
// triggers land the acting user in user_activity. Read-only — no license mutation.
import { test, expect } from "@playwright/test";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage } from "../../data/confluence.mjs";
// @ts-ignore
import { get } from "../../data/jira.mjs";
import { licenseLeashState, hasTestHook } from "../../testhook/licenseleash";
import { waitForTerminal } from "../_support/wait";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
test.describe.configure({ timeout: 120_000 });

test.describe("License Leash — Forge SQL + activity tracking (dev read-hook)", () => {
  test.skip(!hasTestHook(), "LICENSELEASH_TESTHOOK_URL/SECRET not set (.env)");

  test("🔎 the 8 Forge SQL tables migrated (no table missing)", async () => {
    const { counts } = await licenseLeashState("counts");
    console.log(`counts → ${JSON.stringify(counts)}`);
    const tables = ["user_activity", "deactivation_log", "app_config", "sync_pending_users",
      "sync_discovery_groups", "sync_discovery_members", "groups_cache", "funnel_reconcile"];
    for (const t of tables) {
      expect(counts[t], `table ${t} should exist (-1 = missing)`).toBeGreaterThanOrEqual(0);
    }
  });

  test("🔎 user_activity carries its core schema columns", async () => {
    const { columns } = await licenseLeashState("schema", { table: "user_activity" });
    const names = (columns || []).map((c: any) => String(c.COLUMN_NAME).toLowerCase());
    console.log(`user_activity columns → ${names.join(", ")}`);
    for (const need of ["account_id", "last_active_at", "event_type", "has_confluence_access"]) {
      expect(names.includes(need), `user_activity must have ${need}; got [${names.join(",")}]`).toBe(true);
    }
  });

  test("🔎 a Confluence page event records the actor in user_activity (11-trigger pipeline)", async () => {
    const me = (await get("/rest/api/3/myself")).accountId;
    const spaceId = await spaceIdByKey(SPACE);
    const page = await createPage({
      spaceId,
      title: `HARNESS ll-activity ${Date.now()}`,
      adf: { version: 1, type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "activity probe" }] }] },
    });
    try {
      const row: any = await waitForTerminal(async () => {
        const r = await licenseLeashState("activity", { accountId: me });
        return r.row || false;
      }, { timeout: 45_000, interval: 3_000, label: "user_activity row for the actor" });
      console.log(`activity row → account=${row.account_id} event=${row.event_type} access=${row.has_confluence_access}`);
      expect(row.account_id, "the acting user is tracked in user_activity").toBe(me);
      expect(String(row.event_type).startsWith("avi:confluence:"), `event_type is a confluence activity event; got ${row.event_type}`).toBe(true);
    } finally {
      await deletePage(page.id).catch(() => {});
    }
  });
});
