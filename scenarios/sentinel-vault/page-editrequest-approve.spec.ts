// DEEP page-context journey (owner priority 1): the OWNER approves a pending edit request in the
// inline-panel. A pending request is SEEDED via the dev testhook (no 2nd real user needed), then we
// navigate to the page as the seal owner, find the request in the panel's "Edit requests" inbox on
// the sealed fixture card, click Approve, and assert (a) the request disappears from the UI and
// (b) an edit-grant KVS record was created. Reversible + self-cleaning (deletes the seeded request
// and the grant), so the fixture is left exactly as found. Dev-scoped (env 17516615).
import { test, expect } from "../../fixtures/forge";
import { getTestState } from "../../testhook/client";
const PAGE = "https://wolfaenpak.atlassian.net/wiki/pages/viewpage.action?pageId=265912321";
const DEV = "17516615";
const ATT = "att265945089";
const OWNER = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086"; // Mihai Perdum (harness auth = seal owner)
const REQ = "712020:aql-editreq-fake-requester";
const REQ_KEY = `edit-request-${ATT}-${REQ}`;
const GRANT_KEY = `edit-grant-${ATT}-${REQ}`;
const OUT = "/tmp/sv-editreq";
import { mkdirSync } from "node:fs";
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
test.describe.configure({ retries: 1 });

test("owner approves a seeded edit request → grant created, request cleared (inline-panel)", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await delKvs(REQ_KEY); await delKvs(GRANT_KEY); // clear any leftover from a prior run
  await setKvs(REQ_KEY, {
    artifactId: ATT, requesterAccountId: REQ, requesterName: "AQL Test Requester",
    ownerAccountId: OWNER, contentId: "265912321", spaceKey: "WFH",
    attachmentName: "sv-aql-sealed-fixture.txt", reason: "AQL edit-request journey",
    status: "pending", requestedAt: new Date().toISOString(),
  });
  try {
    await page.goto(PAGE, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    // find the DEV inline-panel (has .sv-panel-container)
    const iframes = page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"], iframe[src*="atlassian-dev.net"]');
    const n = await iframes.count(); let panel: any = null;
    for (let i = 0; i < n; i++) {
      const src = (await iframes.nth(i).getAttribute("src").catch(() => "")) || "";
      if (!src.includes(DEV)) continue;
      const cf = iframes.nth(i).contentFrame();
      if ((await cf.locator(".sv-panel-container").count().catch(() => 0)) > 0) { panel = cf; break; }
    }
    expect(panel, "dev inline-panel present").toBeTruthy();

    // the sealed fixture card shows the seeded request in its "Edit requests" inbox
    const inbox = panel.locator(".card-editreq-inbox", { hasText: "Edit requests" });
    await expect(inbox).toBeVisible({ timeout: 15000 });
    await expect(inbox).toContainText("AQL Test Requester");
    await expect(inbox).toContainText("AQL edit-request journey");
    await page.screenshot({ path: `${OUT}/1-request-visible.png` });
    console.log("### request visible in inbox ✓");

    // Approve
    await inbox.locator(".action-btn.lock", { hasText: "Approve" }).click();
    // the request row disappears (myRequests filtered on success)
    await expect(panel.locator(".card-editreq-inbox", { hasText: "Edit requests" })).toHaveCount(0, { timeout: 15000 });
    await page.screenshot({ path: `${OUT}/2-approved.png` });
    console.log("### request cleared from UI after Approve ✓");

    // the grant KVS record was created for the requester (strongly-consistent get)
    const grant = await getKvs(GRANT_KEY);
    console.log("### grant:", grant ? JSON.stringify({ editorAccountId: grant.editorAccountId, grantedBy: grant.grantedBy }) : "NULL");
    expect(grant, "an edit-grant was created for the approved requester").toBeTruthy();
    expect(grant.editorAccountId, "grant is for the requester").toBe(REQ);
    expect(grant.grantedBy, "grant recorded the owner as grantor").toBe(OWNER);
    // the request record was deleted by approve
    const leftover = await getKvs(REQ_KEY);
    expect(leftover, "the pending request was consumed by approve").toBeFalsy();
  } finally {
    await delKvs(REQ_KEY); await delKvs(GRANT_KEY); // restore fixture to no-requests / no-grants
  }
});
