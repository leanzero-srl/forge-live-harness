// DEEP page-context OPERATOR journey: open the doc-ribbon's "Manage Attachments" overlay (a Forge
// Modal) on the fixture page and drive the real seal lifecycle END-TO-END — Relinquish the sealed
// attachment (unseal-artifact), assert the card flips to a "Seal" action, then re-Seal it
// (seal-artifact) and assert it flips back to "Relinquish". Reversible → leaves the fixture in its
// original sealed state. Proves the core operator loop through real resolvers (not the mock).
// Dev-scoped throughout (env 17516615) so the prod install can't confound.
import { test, expect } from "../../fixtures/forge";
const PAGE = "https://wolfaenpak.atlassian.net/wiki/pages/viewpage.action?pageId=265912321";
const DEV = "17516615";
const OUT = "/tmp/sv-seal-journey";
import { mkdirSync } from "node:fs";
test.describe.configure({ retries: 1 });

test("Manage Attachments overlay: relinquish → re-seal round-trip (core operator journey)", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await page.goto(PAGE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);

  // 1) open the DEV banner's Manage Attachments overlay
  const ifr = page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"], iframe[src*="atlassian-dev.net"]');
  const n = await ifr.count(); let bannerIdx = -1;
  for (let i = 0; i < n; i++) { const src = (await ifr.nth(i).getAttribute("src").catch(() => "")) || ""; if (!src.includes(DEV)) continue; const t = (await ifr.nth(i).contentFrame().locator("body").innerText().catch(() => "")) || ""; if (/Manage Attachments/i.test(t)) { bannerIdx = i; break; } }
  expect(bannerIdx, "dev doc-ribbon banner found").toBeGreaterThanOrEqual(0);
  await ifr.nth(bannerIdx).contentFrame().locator(".ribbon-action", { hasText: "Manage" }).click();
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${OUT}/1-overlay-open.png` });

  // 2) locate the DEV overlay MODAL iframe. NOTE: the inline-panel macro (embedded in the page
  // body, BEHIND the modal) also renders artifact cards — so pick the LARGEST matching iframe:
  // the Manage Attachments modal (~1320x781) dwarfs the panel (~760x445). Grabbing the panel
  // instead makes the click land behind the modal → pointer-interception timeout.
  const all = page.locator("iframe");
  const m = await all.count(); let overlay: any = null; let bestArea = 0;
  for (let i = 0; i < m; i++) {
    const src = (await all.nth(i).getAttribute("src").catch(() => "")) || "";
    if (!src.includes(DEV)) continue;
    const cf = all.nth(i).contentFrame();
    const hasCard = await cf.locator(".artifact-card .action-btn").count().catch(() => 0);
    if (hasCard <= 0) continue;
    const box = await all.nth(i).boundingBox().catch(() => null);
    const area = box ? box.width * box.height : 0;
    if (area > bestArea) { bestArea = area; overlay = cf; }
  }
  expect(overlay, "dev overlay modal with an artifact card").toBeTruthy();

  const seal = overlay.locator(".action-btn.lock");        // shown when UNSEALED
  const relinquish = overlay.locator(".action-btn.unlock"); // shown when SEALED-BY-ME

  const startedSealed = (await relinquish.count()) > 0 && await relinquish.first().isVisible().catch(() => false);
  const startedUnsealed = (await seal.count()) > 0 && await seal.first().isVisible().catch(() => false);
  console.log("### start:", startedSealed ? "SEALED (Relinquish shown)" : startedUnsealed ? "UNSEALED (Seal shown)" : "NEITHER (sealed by other?)");
  expect(startedSealed || startedUnsealed, "the attachment has an actionable seal/relinquish button (owned by test user)").toBeTruthy();

  if (startedSealed) {
    // Relinquish → expect Seal
    await relinquish.first().click();
    await expect(seal.first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${OUT}/2-relinquished.png` });
    console.log("### relinquish → card now shows Seal ✓");
    // re-Seal → expect Relinquish (restores original state)
    await seal.first().click();
    await expect(relinquish.first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${OUT}/3-resealed.png` });
    console.log("### re-seal → card now shows Relinquish ✓ (state restored)");
  } else {
    // Seal → expect Relinquish
    await seal.first().click();
    await expect(relinquish.first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${OUT}/2-sealed.png` });
    console.log("### seal → card now shows Relinquish ✓");
    // Relinquish → expect Seal (restores original state)
    await relinquish.first().click();
    await expect(seal.first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: `${OUT}/3-relinquished.png` });
    console.log("### relinquish → card now shows Seal ✓ (state restored)");
  }
});
