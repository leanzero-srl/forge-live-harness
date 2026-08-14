// Confluence-UI drive helpers for Sentinel Vault media specs (incident 2026-07-22).
// The point of uiDeleteAttachment is the EVENT SHAPE: a delete performed through the real
// Confluence UI emits the trashed:attachment payload the app actually receives in production
// (which on 07-22 omitted version/container and silently defeated the trash handler) — a v1
// REST DELETE's event shape is known-good and proves nothing about that path.
import type { Page } from "@playwright/test";

const BASE = "https://wolfaenpak.atlassian.net";

/**
 * Delete an attachment through the Confluence attachments screen as the signed-in user.
 * Tries the row's actions menu first (current skin), then a direct Delete link (old skin).
 * Screenshots into `outDir` on failure so selector drift is diagnosable.
 */
export async function uiDeleteAttachment(page: Page, pageId: string, filename: string, outDir: string): Promise<void> {
  await page.goto(`${BASE}/wiki/pages/viewpageattachments.action?pageId=${pageId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);

  const row = page.locator(`tr:has-text("${filename}")`).first();
  if (!(await row.count())) {
    await page.screenshot({ path: `${outDir}/ui-delete-no-row.png`, fullPage: true });
    throw new Error(`uiDeleteAttachment: no row for "${filename}" on the attachments screen`);
  }

  // Current skin: per-row "…" actions menu → Delete. Old skin: a plain Delete link in the row.
  const menuBtn = row.locator('button[aria-label*="more" i], button[aria-haspopup="true"], [data-testid*="more"]').first();
  if (await menuBtn.count()) {
    await menuBtn.click();
    await page.waitForTimeout(800);
    const deleteItem = page.locator('[role="menuitem"]:has-text("Delete"), a:has-text("Delete")').first();
    if (await deleteItem.count()) {
      await deleteItem.click();
    } else {
      await page.screenshot({ path: `${outDir}/ui-delete-no-menuitem.png`, fullPage: true });
      throw new Error("uiDeleteAttachment: actions menu opened but no Delete item");
    }
  } else {
    const link = row.locator('a:has-text("Delete"), button:has-text("Delete")').first();
    if (!(await link.count())) {
      await page.screenshot({ path: `${outDir}/ui-delete-no-action.png`, fullPage: true });
      throw new Error("uiDeleteAttachment: no actions menu and no Delete link in the row");
    }
    await link.click();
  }

  // Confirmation dialog (either skin).
  await page.waitForTimeout(800);
  const confirm = page
    .locator('[role="dialog"] button:has-text("Delete"), #confirm-delete-attachment, button:has-text("OK")')
    .first();
  if (await confirm.count()) await confirm.click();
  await page.waitForTimeout(2000);
}

/**
 * Assert an image attachment actually RENDERS in the page view — the assertion the 07-22
 * incident proved necessary: the ADF can contain the media node (and the "reverted" comment
 * can be posted) while the file itself sits in trash and the reader sees nothing.
 * Checks a loaded <img> (naturalWidth>0) inside the renderer and no error-placeholder copy.
 */
export async function assertImageRenders(page: Page, pageId: string, outDir: string): Promise<void> {
  await page.goto(`${BASE}/wiki/pages/viewpage.action?pageId=${pageId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);

  const verdict = await page.evaluate(() => {
    const root =
      document.querySelector('[data-testid="page-content"]') ||
      document.querySelector(".ak-renderer-document") ||
      document.getElementById("content") ||
      document.body;
    const text = (root.textContent || "").toLowerCase();
    const errorCopy = ["preview unavailable", "couldn't load", "could not load", "failed to load"].find((s) =>
      text.includes(s),
    );
    const imgs = Array.from(root.querySelectorAll("img"));
    const loaded = imgs.filter((i) => i.complete && i.naturalWidth > 0).length;
    return { errorCopy: errorCopy || null, imgCount: imgs.length, loaded };
  });

  if (verdict.errorCopy || verdict.loaded === 0) {
    await page.screenshot({ path: `${outDir}/image-not-rendering.png`, fullPage: true });
    throw new Error(
      `assertImageRenders: ${verdict.loaded}/${verdict.imgCount} images loaded` +
        (verdict.errorCopy ? `; error copy present: "${verdict.errorCopy}"` : ""),
    );
  }
}
