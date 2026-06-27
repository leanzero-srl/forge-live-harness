// License Leash reactivation webtrigger — HMAC-gated. A missing token is rejected 400; a forged
// token is rejected (403 when the HMAC secret is configured, otherwise 500) — never 200. This
// proves no unsigned link can reactivate a license. NO valid token is ever minted.
// NOTE: requires the app's Forge SQL to be migrated first (the reactivation page render smoke
// triggers ensureMigrations); before that the platform returns 424.
import { test, expect } from "@playwright/test";
import { callReactivationWebtrigger, hasReactivationWebtrigger } from "../../testhook/licenseleash";

test.describe.configure({ timeout: 60_000, retries: 2 });

test.describe("License Leash reactivation webtrigger (token rejection)", () => {
  test.skip(!hasReactivationWebtrigger(), "LICENSELEASH_REACTIVATION_WEBTRIGGER not set (.env)");

  // The webtrigger function reads Forge SQL config at startup; until the app's SQL is provisioned
  // the PLATFORM returns 424 before the handler runs. Skip (don't fail) in that state.
  test.beforeAll(async () => {
    const probe = await callReactivationWebtrigger("probe");
    test.skip(probe.status === 424, `Forge SQL not provisioned (webtrigger → 424). Resolve the app's SQL/migrations, then re-run. body=${probe.body}`);
  });

  test("🔒 a missing token is rejected with 400", async () => {
    const r = await callReactivationWebtrigger(undefined);
    console.log(`no-token → HTTP ${r.status}`);
    expect(r.status, `missing token must be 400; got ${r.status}: ${r.body}`).toBe(400);
  });

  test("🔒 a forged/garbage token never reactivates (rejected, not 200)", async () => {
    const r = await callReactivationWebtrigger("not-a-real-signed-token");
    console.log(`bad-token → HTTP ${r.status}`);
    expect(r.status, `forged token must NOT succeed; got ${r.status}: ${r.body}`).not.toBe(200);
    expect(r.status, `forged token must be rejected (403 if HMAC configured, else 500); got ${r.status}`).toBeGreaterThanOrEqual(400);
  });
});
