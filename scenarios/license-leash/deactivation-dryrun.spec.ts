// License Leash DEEP — the deactivation flow (the app's core revoke logic), driven in DRY-RUN via the
// dev hook so NO real user is affected: it records the audit INTENT (DRY_RUN_DEACTIVATE) with NO group
// change, NO access change, NO email. Proves the revoke-decision + audit-logging path end-to-end
// without consuming a real revocation (per "don't affect the actual functionality").
import { test, expect } from "@playwright/test";
import { licenseLeashState, hasTestHook } from "../../testhook/licenseleash";

test.describe.configure({ timeout: 90_000 });

test.describe("License Leash deactivation flow (dry-run, safe)", () => {
  test.skip(!hasTestHook(), "LICENSELEASH_TESTHOOK_URL/SECRET not set (.env)");

  test("🔎 a dry-run deactivation records the audit intent without revoking anyone", async () => {
    const acc = `557058:harness-dryrun-${Date.now()}`;
    const inv = await licenseLeashState("invoke", { fn: "deactivateDryRun", accountId: acc, reason: "harness dry-run" });
    console.log(`invoke → ${JSON.stringify(inv)}`);
    expect(inv.invoked, "the dry-run deactivation ran").toBe("deactivateDryRun");
    expect(inv.result, "dry-run returns false (no real revoke happened)").toBe(false);

    const log = await licenseLeashState("deactivationLog", { accountId: acc });
    const entry = (log.rows || [])[0];
    console.log(`audit → ${JSON.stringify(entry)}`);
    expect(entry?.action, "a DRY_RUN_DEACTIVATE audit entry was written").toBe("DRY_RUN_DEACTIVATE");
    expect(entry?.performed_by, "performed_by marks it a dry-run (not a real revoke)").toBe("DRY_RUN");
  });
});
