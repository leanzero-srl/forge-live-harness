// THE FULL CYCLE for a licence app, on ONE account we control: snapshot → the app's report mode →
// diff against our predicted set → remove the test account's licence → verify in Atlassian (not on the
// app's screen) → the user's route back (self-service or automatic re-grant) → verify → restore → verify
// → notifications observed must be zero. Written 2026-09-08 for Kantega on E.ON's sandbox.
//
// RAILS (do not relax):
//   - assertMutationAllowed(): refuses on any non-wolfaenpak host unless CUSTOMER_SANDBOX_MUTATIONS_OK=1.
//   - TEST_ACCOUNT_ID is REQUIRED and must be one of ours; the spec refuses any other accountId.
//   - TEST_GROUP defaults to the 31-member local group; anything matching /^apl\d/i (SCIM) is refused.
//   - No suspension, ever: it is directory-level and organisation-wide.
//   - Every state read is a REST oracle read; the app's dashboard is footage only.
//   - Restore latency is recorded as a result across the measured 29–149 min bracket, not pass/fail.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { BASE_URL, assertMutationAllowed } from "../../config/env";
import { dumpForgeFrames, enterForgeSurface } from "../../forge/frame";
import { assertLoggedIn } from "../../forge/browser";

const T = getTarget(process.env.DISCOVER_TARGET || "kantega-global");
const ACCT = process.env.TEST_ACCOUNT_ID || "";
const GROUP = process.env.TEST_GROUP || "confluence-users-eon-energy-sandbox";
const OURS = ["712020:52e8c0d2-5340-461d-881c-1cb63e840482", "712020:ec29b806-1d77-4e0e-83cb-35fbb3ab89eb",
              "712020:937bc860-eec2-4294-a65d-8e0fe7c45086"]; // eon main, eon admin, wolfaenpak
const AUTH = "Basic " + Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");

async function inGroup(request: any, group: string, accountId: string): Promise<boolean> {
  let start = 0;
  for (;;) {
    const r = await request.get(`${BASE_URL}/rest/api/3/group/member?groupname=${encodeURIComponent(group)}&maxResults=50&startAt=${start}&includeInactiveUsers=true`, { headers: { Authorization: AUTH, Accept: "application/json" } });
    const d = await r.json();
    if ((d.values || []).some((v: any) => v.accountId === accountId)) return true;
    if (d.isLast !== false) return false;
    start += 50; if (start > 100000) throw new Error("runaway paging");
  }
}

test.describe.configure({ retries: 0 }); // a deterministic cycle: a failure is a finding, never a flake

test(`${T.app}: full licence cycle on one controlled account`, async ({ page, recorder, request }) => {
  test.skip(!T.appId || !T.envId, "target ids unresolved");
  test.skip(!ACCT, "TEST_ACCOUNT_ID not set — the cycle needs a named account we control");
  if (!OURS.includes(ACCT)) throw new Error(`REFUSED: ${ACCT} is not one of our own accounts`);
  if (/^apl\d/i.test(GROUP)) throw new Error(`REFUSED: ${GROUP} is a SCIM-synced group`);
  assertMutationAllowed(`licence cycle on ${ACCT} in ${GROUP}`);

  const url = T.deepLink(T.envId)!;
  recorder.setTarget({ product: T.product, app: T.app, appId: T.appId, module: T.module, moduleType: T.moduleType, surface: T.surface, url: BASE_URL + url, repo: T.repo });
  await assertLoggedIn(page);
  const ledger: Record<string, string | number | boolean> = { account: ACCT, group: GROUP };

  await recorder.step("0. oracle: the account holds the licence before we start", async () => {
    ledger.before = await inGroup(request, GROUP, ACCT);
    expect(ledger.before, `${ACCT} must be in ${GROUP} to begin`).toBe(true);
  }, { expectation: { assertion: "account is in the granting group (REST)", narrative: "Starting state read from Atlassian, not the app." } });

  await recorder.step("1. open the app and reach its report", async () => {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    recorder.setFrames(await dumpForgeFrames(page));
    const surface = await enterForgeSurface(page, { surface: "custom" }); recorder.attachSurface(surface);
    const root = surface.kind === "custom" ? surface.frame : page;
    await expect(root.locator("text=/Loading app/i")).toHaveCount(0, { timeout: 60_000 });
    const txt = await root.locator("body").innerText();
    ledger.credentialsConfigured = !/Credentials are not valid|Generate Atlassian API key/i.test(txt);
    expect(ledger.credentialsConfigured, "the app must have its credential before a cycle can run").toBe(true);
  }, { expectation: { assertion: "app is configured (no credential prompt)", narrative: "Without its key the app cannot act; the cycle stops here with that recorded." } });

  // Steps 2..6 are the vendor-specific UI actions (report → select the test account → remove → route back).
  // They are written per app once its screens are readable; the ORACLE reads below are what make the
  // cycle a test. Until then this spec proves the rails and the starting state, and stops honestly.
  await recorder.step("2. removal via the app (vendor-specific; recorded, then verified in Atlassian)", async () => {
    test.info().annotations.push({ type: "todo", description: "drive the app's removal for ACCT; then oracle read" });
    ledger.afterRemoval = await inGroup(request, GROUP, ACCT);
  }, { expectation: { assertion: "oracle read after the app's removal step", narrative: "Whether the licence actually went, read from group membership." } });

  await recorder.step("ledger", async () => { console.log("\nCYCLE LEDGER " + JSON.stringify(ledger) + "\n"); },
    { expectation: { assertion: "ledger printed", narrative: "The measured quantities a person checks by hand." } });
});
