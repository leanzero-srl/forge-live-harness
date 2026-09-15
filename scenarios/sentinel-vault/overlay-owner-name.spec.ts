// Overlay "Sealed by" owner name — proves identify-operator RESOLVED, not merely rendered.
// The attachments overlay (door: the byline chip → page-details modal → Attachments tab, see
// _door.ts; the ribbon's "Manage Attachments" action is retired) renders an OperatorTag per sealed card
// (overlay/index.jsx:340-345) which invokes identify-operator(lockedByAccountId) as the user
// (overlay/index.jsx:147). On ANY failure the component substitutes `User <last-4-of-accountId>`
// (index.jsx:151) — so a card that "shows a name" proves nothing; only the REAL display name does.
// Asserts, for the fixture (sealed by the harness user Mihai, 712020:937bc860-…-8e0fe7c45086):
//   - the owner cell reads "Mihai Perdum",
//   - it is NOT "User c086" (the fallback), NOT "Resolving..." (still loading), NOT "Unknown user",
//   - the tag's title carries "<displayName> (<accountId>)" (index.jsx:172) for THAT accountId —
//     the resolved record is for the right account, not a lucky string match.
// The "Held by" column is persisted in the overlay iframe's localStorage (sv-overlay-columns,
// index.jsx:731) on the shared profile; if an earlier manual session hid it, the spec turns it on
// through the Properties picker and restores it afterwards. Otherwise read-only. Dev-scoped.
// @covers resolver:identify-operator
import { test, expect } from "../../fixtures/forge";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { openOverlayViaChip, findDevOverlay } from "./_door";

const PAGE = "https://wolfaenpak.atlassian.net/wiki/pages/viewpage.action?pageId=265912321";
const DEV = "17516615";
const FIXTURE_NAME = "sv-aql-sealed-fixture.txt";
const OWNER_ACCOUNT = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const OWNER_NAME = "Mihai Perdum";
const FALLBACK = `User ${OWNER_ACCOUNT.slice(-4)}`; // exactly what OperatorTag substitutes on failure
const IFRAMES = 'iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"], iframe[src*="atlassian-dev.net"]';
const squash = (s: string) => s.replace(/\s+/g, " ").trim();
test.describe.configure({ timeout: 150_000, retries: 1 });

test("attachments overlay (via the byline chip): the fixture's 'Sealed by' resolves to the real owner name (identify-operator)", async ({ page }, testInfo) => {
  const OUT = path.join(testInfo.outputDir, "shots");
  mkdirSync(OUT, { recursive: true });

  await page.goto(PAGE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  let ov: any = await openOverlayViaChip(page);
  // Re-resolve the overlay per poll (modal iframe mounts, then re-paints with the card list).
  await expect.poll(async () => { ov = await findDevOverlay(page); return ov && (await ov.locator(".artifact-card").count()) > 0 ? 1 : 0; }, { timeout: 30_000, message: "dev overlay modal with artifact cards" }).toBe(1);
  await page.screenshot({ path: `${OUT}/1-overlay-open.png` });

  const card = () => ov.locator(".artifact-card", { hasText: FIXTURE_NAME });
  await expect(card(), "fixture card in the overlay").toBeVisible({ timeout: 15000 });

  // "Held by" column: on by default, but persisted per profile. Heal via the Properties picker if hidden.
  let toggledHeldBy = false;
  const ownerCell = () => card().locator(".card-meta-owner");
  if ((await ownerCell().count()) === 0) {
    console.log("### 'Held by' column hidden on this profile → enabling it via the Properties picker");
    await ov.locator(".column-picker .column-picker-trigger").click();
    const opt = ov.locator(".column-picker-dropdown .column-picker-option", { hasText: "Held by" }).locator('input[type="checkbox"]');
    await expect(opt).toBeVisible({ timeout: 5000 });
    if (!(await opt.isChecked())) { await opt.click(); toggledHeldBy = true; }
    await ov.locator(".modal-title, .overlay-toolbar").first().click({ force: true }).catch(() => {}); // close the picker
  }

  try {
    await expect(ownerCell(), "'Sealed by' owner cell on the fixture card").toBeVisible({ timeout: 15000 });
    // OperatorTag resolves async: "Resolving..." first, then the name (or the fallback). Poll to the
    // terminal text, and only THEN judge it — a snapshot taken mid-resolve would be a false failure.
    await expect.poll(async () => squash(await ownerCell().innerText().catch(() => "")), { timeout: 30_000, message: "owner cell leaves 'Resolving...'" })
      .not.toMatch(/Resolving/i);
    const text = squash(await ownerCell().innerText());
    console.log("### owner cell:", JSON.stringify(text));
    await page.screenshot({ path: `${OUT}/2-owner-cell.png` });

    expect(text, "cell is labelled 'Sealed by'").toMatch(/Sealed by/i);
    expect(text, `identify-operator resolved the real display name "${OWNER_NAME}"`).toContain(OWNER_NAME);
    expect(text, `NOT the failure fallback "${FALLBACK}"`).not.toContain(FALLBACK);
    expect(text, "NOT the generic fallback shape 'User xxxx'").not.toMatch(/\bUser [0-9a-f]{4}\b/i);
    expect(text, "NOT 'Unknown user'").not.toMatch(/Unknown user/i);

    // The resolved record is for THIS account: title = `${displayName} (${accountId})`.
    const tag = ownerCell().locator(`span[title="${OWNER_NAME} (${OWNER_ACCOUNT})"]`);
    await expect(tag, "OperatorTag title pairs the name with the fixture owner's accountId").toHaveCount(1);
    console.log(`### identify-operator → "${OWNER_NAME}" for ${OWNER_ACCOUNT} ✓`);
  } finally {
    if (toggledHeldBy) {
      // Leave the profile as found: hide the column again.
      await ov.locator(".column-picker .column-picker-trigger").click().catch(() => {});
      await ov.locator(".column-picker-dropdown .column-picker-option", { hasText: "Held by" }).locator('input[type="checkbox"]').click().catch(() => {});
      console.log("### restored: 'Held by' column hidden again");
    }
    await ov?.locator(".modal-close").click().catch(() => {});
  }
});
