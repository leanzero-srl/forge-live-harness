// The ONE door into the attachments overlay since 5.0: the byline CHIP (Confluence renders
// button[data-testid="byline-forge-app-button"] from the `sentinel-byline` content property; on
// dev its text carries the " (Development)" suffix) opens the page-details modal, whose
// Attachments tab has the "Open the full attachments view" button that opens the overlay Modal.
// The doc-ribbon's "Manage Attachments" action is RETIRED (doc-ribbon/index.jsx `openDetails`),
// so every spec that used to click `.ribbon-action` "Manage" enters through here now.
import { expect } from "../../fixtures/forge";

export const DEV = "17516615";

/** The dev byline chip on the current page (waits for Confluence to render the byline). */
export async function findDevChip(page: any, timeout = 60_000) {
  // Several Forge byline items can share the row (a Data-classification byline also says
  // "(Development)"); Sentinel Vault's is the one carrying img[data-testid="byline-forge-app-image"].
  // A page with no `sentinel-byline` property yet (a throwaway page) renders the manifest's static
  // title "Sentinel Vault" with NO image, so fall back to the title text.
  const withImage = page.locator('button[data-testid="byline-forge-app-button"]', { has: page.locator('img[data-testid="byline-forge-app-image"]'), hasText: "(Development)" });
  const byTitle = page.locator('button[data-testid="byline-forge-app-button"]', { hasText: /^Sentinel Vault.*\(Development\)/ });
  const chip = withImage.or(byTitle).first();
  await chip.waitFor({ state: "visible", timeout });
  return chip;
}

/** Click the chip and return the page-details modal's frame once it has booted. */
export async function openDetailsModal(page: any) {
  const chip = await findDevChip(page);
  await chip.scrollIntoViewIfNeeded();
  await chip.click();
  const ifr = page.locator(`iframe[src*="${DEV}"]`);
  let app: any = null;
  await expect.poll(async () => {
    const n = await ifr.count();
    for (let i = 0; i < n; i++) {
      const f = ifr.nth(i).contentFrame();
      if ((await f.locator('[data-testid="pd-modal"][data-ready="1"]').count().catch(() => 0)) > 0) { app = f; return true; }
    }
    return false;
  }, { timeout: 60_000, message: "the page-details modal boots past its summary load" }).toBe(true);
  return app;
}

/**
 * The dev overlay MODAL frame: a DEV iframe holding `.modal-container` (the overlay's root) and
 * NOT `.sv-panel-container` (the inline-panel macro, which sits behind the modal and also renders
 * `.artifact-card`). Largest wins when several match (a stale modal iframe during a re-mount).
 */
export async function findDevOverlay(page: any) {
  const all = page.locator("iframe");
  const m = await all.count();
  let overlay: any = null, best = 0;
  for (let i = 0; i < m; i++) {
    const src = (await all.nth(i).getAttribute("src").catch(() => "")) || "";
    if (!src.includes(DEV)) continue;
    const cf = all.nth(i).contentFrame();
    if ((await cf.locator(".sv-panel-container").count().catch(() => 0)) > 0) continue;
    if ((await cf.locator(".modal-container").count().catch(() => 0)) <= 0) continue;
    const box = await all.nth(i).boundingBox().catch(() => null);
    const area = box ? box.width * box.height : 0;
    if (area > best) { best = area; overlay = cf; }
  }
  return overlay;
}

/** Chip → details modal → Attachments tab → "Open the full attachments view" → the overlay frame. */
export async function openOverlayViaChip(page: any, { withCards = true } = {}) {
  const app = await openDetailsModal(page);
  await app.locator('[data-testid="pd-tab-attachments"]').click();
  const open = app.locator('[data-testid="pd-open-overlay"]');
  await expect(open, "the Attachments tab offers the overlay door").toBeVisible({ timeout: 20_000 });
  await open.click();
  let ov: any = null;
  await expect.poll(async () => {
    ov = await findDevOverlay(page);
    if (!ov) return false;
    if (!withCards) return true;
    return (await ov.locator(".artifact-card").count().catch(() => 0)) > 0;
  }, { timeout: 60_000, message: "the dev overlay modal opened" + (withCards ? " with artifact cards" : "") }).toBe(true);
  return ov;
}

/** The dev inline-panel macro frame on the current page, or null. */
export async function findDevPanel(page: any) {
  const ifr = page.locator(`iframe[src*="${DEV}"]`);
  const n = await ifr.count();
  for (let i = 0; i < n; i++) {
    const cf = ifr.nth(i).contentFrame();
    if ((await cf.locator(".sv-panel-container").count().catch(() => 0)) > 0) return cf;
  }
  return null;
}
