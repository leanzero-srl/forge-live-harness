// License Leash revoke → reactivate flow — MAPPED, NOT EXECUTED.
//
// Per the locked decision ("map the reactivation flow but do not consume/execute it yet"), this
// spec documents the end-to-end live scenario so it can be enabled later by removing the .skip,
// but it performs NO live license revocation. As an additional guard, the two revoke-causing
// scheduled triggers (daily-inactivity-check, daily-full-sync) are disabled in the deployed
// wolfaenpak manifest. To run this for real you would: re-enable those triggers, provision a
// disposable MANAGED test user, configure the license group + HMAC secret, then unskip.
import { test, expect } from "@playwright/test";

test.describe("License Leash revoke → reactivate (MAPPED — intentionally not run)", () => {
  test.skip(true, "Not executed — would revoke a real license on wolfaenpak. Documented map only.");

  test("revoke via checkInactivity, then reactivate via the HMAC webtrigger", async () => {
    // STEP 1 — REVOKE (checkInactivity → deactivateUser):
    //   precondition: a managed, inactive test user past the inactivity threshold.
    //   effect: removed from every license group + added to confluence-guests-{site};
    //           user_activity.has_confluence_access → 0, event_type → 'license-revoked';
    //           a deactivation_log row with action='DEACTIVATED'.
    //
    // STEP 2 — REACTIVATE (handleWebReactivation):
    //   generateReactivationToken(accountId, HMAC_SECRET) → GET reactivation-webtrigger?token=<signed>.
    //   effect: HMAC verified (timing-safe; 403 if forged/expired), eligibility re-checked,
    //           reactivateUser() re-adds to the license group; user_activity.has_confluence_access → 1,
    //           last_active_at → now; a deactivation_log row action='REACTIVATED', performed_by='EMAIL_LINK'.
    //
    // ORACLE — assert the transition via the admin resolver getUsers(filter:'revoked' then 'active')
    //   or by reading the deactivation_log DEACTIVATED→REACTIVATED pair for the test account.
    expect(true).toBe(true);
  });
});
