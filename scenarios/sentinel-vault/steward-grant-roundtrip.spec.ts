// DEEP privilege-grant journey (COVERAGE-MATRIX worklist #2 — steward-access request approve/deny,
// unguarded persistence). A steward APPROVES a seeded steward-access request → the requester is added
// to admin-settings-space-WFH.adminUsers (privilege escalation) and it PERSISTS across reload; and
// DENIES another → the record is marked "denied" + deniedAt (48h cooldown) and NOT granted. Seeds the
// pending request via testhook; the harness user (Mihai) is a WFH steward so drives Approve/Deny in
// the realm-console Access Control tab. PRESERVES + restores the space policy exactly (the grant is a
// real adminUsers mutation). Dev-scoped.
import { test, expect } from "../../fixtures/forge";
import { getTestState } from "../../testhook/client";
import { getTarget } from "../../config/targets";
import { enterForgeSurface } from "../../forge/frame";
const T = getTarget("sentinel-vault-realm");
const SPACE_KEY = "WFH";
const SYNTH_A = "712020:aql-grant-requester-a";
const SYNTH_B = "712020:aql-grant-requester-b";
const POLICY = `admin-settings-space-${SPACE_KEY}`;
const K_REQ_A = `steward-request-${SPACE_KEY}-${SYNTH_A}`;
const K_REQ_B = `steward-request-${SPACE_KEY}-${SYNTH_B}`;
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const adminIds = (p: any) => (p?.adminUsers || []).map((u: any) => (typeof u === "string" ? u : u?.accountId));
const seedReq = (key: string, acct: string, name: string) => setKvs(key, { accountId: acct, displayName: name, spaceKey: SPACE_KEY, requestedAt: new Date().toISOString(), status: "pending" });
async function openAccessControl(page: any) {
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  const s = await enterForgeSurface(page, { surface: "custom", readySelector: ".space-admin-title", timeout: 45000 });
  const app = (s as any).frame;
  await expect(app.locator(".space-admin-title")).toBeVisible({ timeout: 15000 });
  await app.locator(".tab-navigation .tab-button", { hasText: "Access Control" }).click();
  await page.waitForTimeout(1800);
  return app;
}
test.describe.configure({ retries: 2 });

test("steward APPROVES a steward-access request → requester granted (adminUsers) + persists", async ({ page }) => {
  const original = await getKvs(POLICY);
  await delKvs(K_REQ_A);
  await seedReq(K_REQ_A, SYNTH_A, "AQL Grant Requester A");
  try {
    const app = await openAccessControl(page);
    const card = app.locator(".steward-card", { hasText: "AQL Grant Requester A" });
    await expect(card, "pending request visible to the steward").toBeVisible({ timeout: 15000 });
    await card.locator(".action-btn.lock", { hasText: "Approve" }).click();
    await expect.poll(async () => await getKvs(K_REQ_A), { timeout: 15000, message: "request consumed by approve" }).toBeFalsy();
    await expect.poll(async () => adminIds(await getKvs(POLICY)).includes(SYNTH_A), { timeout: 15000, message: "requester added to adminUsers (privilege granted)" }).toBe(true);
    console.log("### approved → adminUsers now includes the requester ✓");
    // reload → the GRANT persists in the space policy (KVS, durable). NOTE (audit KVS-eventual-
    // consistency lead, CONFIRMED here): the request CARD can transiently reappear on a fast reload
    // because list-steward-requests uses an eventually-consistent kvs.query that lags the per-key
    // delete — a minor UX artifact, NOT a persistence failure. So assert the durable grant, not the
    // lagged list.
    const app2 = await openAccessControl(page);
    await expect(app2.locator(".space-admin-title")).toBeVisible({ timeout: 15000 });
    expect(adminIds(await getKvs(POLICY)), "grant persists across reload").toContain(SYNTH_A);
    console.log("### grant persists after reload ✓");
  } finally {
    if (original) await setKvs(POLICY, original); else await delKvs(POLICY);
    await delKvs(K_REQ_A);
  }
});

test("steward DENIES a steward-access request → marked denied (48h cooldown), NOT granted", async ({ page }) => {
  const original = await getKvs(POLICY);
  await delKvs(K_REQ_B);
  await seedReq(K_REQ_B, SYNTH_B, "AQL Grant Requester B");
  try {
    const app = await openAccessControl(page);
    const card = app.locator(".steward-card", { hasText: "AQL Grant Requester B" });
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.locator(".action-btn.unlock", { hasText: "Deny" }).click();
    await expect.poll(async () => (await getKvs(K_REQ_B))?.status, { timeout: 15000, message: "request marked denied" }).toBe("denied");
    const rec = await getKvs(K_REQ_B);
    expect(rec?.deniedAt, "deniedAt timestamp set (48h cooldown)").toBeTruthy();
    expect(adminIds(await getKvs(POLICY)), "deny does NOT grant steward").not.toContain(SYNTH_B);
    console.log("### denied → status denied + deniedAt + not granted ✓");
  } finally {
    if (original) await setKvs(POLICY, original); else await delKvs(POLICY);
    await delKvs(K_REQ_B);
  }
});
