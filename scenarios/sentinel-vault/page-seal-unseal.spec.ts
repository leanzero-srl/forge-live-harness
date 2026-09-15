// DEEP page-context OPERATOR journey: open the attachments overlay (a Forge Modal; the door is the
// byline chip → page-details modal → Attachments tab, see _door.ts — the ribbon's "Manage
// Attachments" action is retired) on the fixture page and drive the real seal lifecycle END-TO-END —
// Release the sealed attachment (unseal-artifact), assert the card flips to a "Seal" primary, then
// re-Seal it (seal-artifact) and assert it flips back to "Release". Reversible → leaves the fixture in its
// original sealed state. Proves the core operator loop through real resolvers (not the mock).
// Dev-scoped throughout (env 17516615) so the prod install can't confound.
// @covers resolver:enumerate-doc-artifacts
import { test, expect } from "../../fixtures/forge";
const PAGE = "https://wolfaenpak.atlassian.net/wiki/pages/viewpage.action?pageId=265912321";
const DEV = "17516615";
const OUT = "/tmp/sv-seal-journey";
import { mkdirSync } from "node:fs";
import { openOverlayViaChip } from "./_door";
test.describe.configure({ retries: 1, timeout: 240_000 });

test("attachments overlay (via the byline chip): release → re-seal round-trip (core operator journey)", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await page.goto(PAGE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);

  // 1) the door: byline chip → details modal → Attachments → the overlay MODAL frame
  const overlay = await openOverlayViaChip(page);
  await page.screenshot({ path: `${OUT}/1-overlay-open.png` });
  expect(overlay, "dev overlay modal with an artifact card").toBeTruthy();

  // One primary per row (mockup decision 5): Seal when unsealed, Release when sealed by me.
  // Scoped to the FIXTURE card: the page also carries an available attachment whose Seal
  // primary would otherwise satisfy `seal.first()` and get sealed by mistake.
  const fixture = overlay.locator(".artifact-card", { hasText: "sv-aql-sealed-fixture" });
  const seal = fixture.locator('[data-primary="seal"]');
  const relinquish = fixture.locator('[data-primary="release"]');

  const startedSealed = (await relinquish.count()) > 0 && await relinquish.first().isVisible().catch(() => false);
  const startedUnsealed = (await seal.count()) > 0 && await seal.first().isVisible().catch(() => false);
  console.log("### start:", startedSealed ? "SEALED (Release shown)" : startedUnsealed ? "UNSEALED (Seal shown)" : "NEITHER (sealed by other?)");
  expect(startedSealed || startedUnsealed, "the attachment has an actionable seal/release button (owned by test user)").toBeTruthy();

  if (startedSealed) {
    // Relinquish → expect Seal
    await relinquish.first().click();
    await expect(seal.first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${OUT}/2-relinquished.png` });
    console.log("### release → card now shows Seal ✓");
    // re-Seal → expect Relinquish (restores original state)
    await seal.first().click();
    await expect(relinquish.first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${OUT}/3-resealed.png` });
    console.log("### re-seal → card now shows Release ✓ (state restored)");
  } else {
    // Seal → expect Relinquish
    await seal.first().click();
    await expect(relinquish.first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${OUT}/2-sealed.png` });
    console.log("### seal → card now shows Release ✓");
    // Relinquish → expect Seal (restores original state)
    await relinquish.first().click();
    await expect(seal.first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${OUT}/3-relinquished.png` });
    console.log("### release → card now shows Seal ✓ (state restored)");
  }
});
