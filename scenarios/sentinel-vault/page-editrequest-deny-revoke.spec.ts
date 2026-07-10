// DEEP page-context journeys completing the edit-request trio (it33 did APPROVE). Both use the
// testhook seed pattern (no 2nd real user) and self-clean, so the fixture is left as found.
//  1) DENY: seed a pending request → owner clicks Deny in the inline-panel inbox → assert it clears
//     from the UI AND the record persists with status "denied" (denyEditRequest keeps it for the
//     48h cooldown, unlike approve which deletes it).
//  2) REVOKE: seed an active edit-grant → owner clicks Revoke in "Editors with access" → assert it
//     clears from the UI AND the grant KVS record is deleted.
// Dev-scoped (env 17516615).
import { test, expect } from "../../fixtures/forge";
import { getTestState } from "../../testhook/client";
const PAGE = "https://wolfaenpak.atlassian.net/wiki/pages/viewpage.action?pageId=265912321";
const DEV = "17516615";
const ATT = "att265945089";
const OWNER = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const REQ = "712020:aql-editreq-deny-req";
const EDITOR = "712020:aql-editreq-revoke-editor";
const REQ_KEY = `edit-request-${ATT}-${REQ}`;
const GRANT_KEY = `edit-grant-${ATT}-${EDITOR}`;
const OUT = "/tmp/sv-editreq2";
import { mkdirSync } from "node:fs";
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
test.describe.configure({ retries: 1 });

async function findDevPanel(page: any) {
  const iframes = page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"], iframe[src*="atlassian-dev.net"]');
  const n = await iframes.count();
  for (let i = 0; i < n; i++) {
    const src = (await iframes.nth(i).getAttribute("src").catch(() => "")) || "";
    if (!src.includes(DEV)) continue;
    const cf = iframes.nth(i).contentFrame();
    if ((await cf.locator(".sv-panel-container").count().catch(() => 0)) > 0) return cf;
  }
  return null;
}

test("owner DENIES a seeded edit request → cleared from UI, record marked denied", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await delKvs(REQ_KEY);
  await setKvs(REQ_KEY, { artifactId: ATT, requesterAccountId: REQ, requesterName: "AQL Deny Requester", ownerAccountId: OWNER, contentId: "265912321", spaceKey: "WFH", attachmentName: "sv-aql-sealed-fixture.txt", reason: "please let me edit", status: "pending", requestedAt: new Date().toISOString() });
  try {
    await page.goto(PAGE, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    const panel = await findDevPanel(page);
    expect(panel, "dev inline-panel present").toBeTruthy();
    const inbox = panel.locator(".card-editreq-inbox", { hasText: "Edit requests" });
    await expect(inbox).toBeVisible({ timeout: 15000 });
    await expect(inbox).toContainText("AQL Deny Requester");
    await inbox.locator(".action-btn.unlock", { hasText: "Deny" }).click();
    await expect(panel.locator(".card-editreq-inbox", { hasText: "Edit requests" })).toHaveCount(0, { timeout: 15000 });
    await page.screenshot({ path: `${OUT}/deny.png` });
    const rec = await getKvs(REQ_KEY);
    console.log("### after deny, request record status:", rec ? rec.status : "NULL");
    expect(rec, "denied request record still exists (48h cooldown)").toBeTruthy();
    expect(rec.status, "record marked denied").toBe("denied");
  } finally {
    await delKvs(REQ_KEY);
  }
});

test("owner REVOKES a seeded edit grant → cleared from UI, grant record deleted", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await delKvs(GRANT_KEY);
  await setKvs(GRANT_KEY, { artifactId: ATT, editorAccountId: EDITOR, editorName: "AQL Grant Editor", grantedBy: OWNER, grantedAt: new Date().toISOString(), expiresAt: null });
  try {
    await page.goto(PAGE, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    const panel = await findDevPanel(page);
    expect(panel, "dev inline-panel present").toBeTruthy();
    const grants = panel.locator(".card-editreq-inbox", { hasText: "Editors with access" });
    await expect(grants).toBeVisible({ timeout: 15000 });
    await expect(grants).toContainText("AQL Grant Editor");
    await grants.locator(".action-btn.unlock", { hasText: "Revoke" }).click();
    await expect(panel.locator(".card-editreq-inbox", { hasText: "Editors with access" })).toHaveCount(0, { timeout: 15000 });
    await page.screenshot({ path: `${OUT}/revoke.png` });
    const rec = await getKvs(GRANT_KEY);
    console.log("### after revoke, grant record:", rec ? "STILL EXISTS" : "deleted");
    expect(rec, "grant record deleted by revoke").toBeFalsy();
  } finally {
    await delKvs(GRANT_KEY);
  }
});
