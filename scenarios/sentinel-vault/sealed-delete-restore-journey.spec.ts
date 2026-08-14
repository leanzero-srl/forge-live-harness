// Sentinel Vault DEEP — the restore-from-trash UI card journey through the REAL Manage
// Attachments overlay:
//   seed a seal owned by MIHAI (the signed-in harness user — lesson: the trashed:attachment
//   event can arrive SECONDS late, and a seal owned by anyone else makes Fix 2 correctly
//   un-trash the fixture mid-test; owner-trash is allowed and STICKS) → trash via REST as
//   mihai → flip admin-settings-global.allowSealRestore=true (prior value captured; the EXACT
//   prior object is restored in finally — durable-baseline discipline) → open the doc-ribbon's
//   Manage Attachments overlay → the phase-1 seals card shows the Trash state (enumerate-page-
//   seals probes the attachment status) → click Restore → the resolver un-trashes it
//   (pollAttachmentStatus → current, REST truth) → flip allowSealRestore=false → RE-TRASH
//   (otherwise the "hidden" assert is vacuous: a current attachment has no Trash card at all)
//   → reload the overlay → the Trash card renders WITHOUT a Restore button.
// The overlay's trashed card is QUERY-backed (enumerate-page-seals kvs.query beginsWith
// "protection-") and kvs.query is EVENTUALLY consistent — the seeded seal must be
// query-visible before the overlay is opened (it45 lesson). Screenshots at every step to
// /tmp/sv-restore-journey. Self-cleaning: throwaway page + KVS keys deleted in finally.
import { test, expect } from "../../fixtures/forge";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage, uploadBinaryAttachment, TINY_PNG, trashAttachment, pollAttachmentStatus } from "../../data/confluence.mjs";
import { getTestState } from "../../testhook/client";
import { mkdirSync } from "node:fs";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const DEV = "17516615";
const OUT = "/tmp/sv-restore-journey";
const GKEY = "admin-settings-global";
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";

const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const para = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });

test.describe.configure({ timeout: 420_000 });

test("🔎 trashed sealed file: overlay Trash card → Restore → current; gate off hides Restore", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const spaceId = await spaceIdByKey(SPACE);
  const stamp = Date.now();
  const filename = `sv-restore-journey-${stamp}.png`;
  const pg = await createPage({ spaceId, title: `HARNESS sv-restore-journey ${stamp}`, adf: doc(para("restore journey seed")) });
  let att: any;
  let origGlobal: any = null;
  let globalTouched = false;

  // Trash as mihai and PROVE it stuck: the trashed event can land seconds late — with the seal
  // owner == trasher the handler returns without restoring, but we re-assert after a settle.
  const trashAndAssertStuck = async (label: string) => {
    await trashAttachment(att.attachmentId);
    await pollAttachmentStatus(att.attachmentId, "trashed", { timeoutMs: 30_000 });
    await page.waitForTimeout(8000);
    await pollAttachmentStatus(att.attachmentId, "trashed", { timeoutMs: 20_000 });
    console.log(`### ${label}: trash stuck (owner-trash) ✓`);
  };

  // Open the page, click the DEV doc-ribbon's Manage button, return the overlay MODAL frame.
  // NOTE (page-seal-unseal lesson): pick the LARGEST matching iframe — the inline-panel macro
  // also renders artifact cards behind the modal. Filter on .artifact-card PRESENCE (not
  // .action-btn): a policy-hidden Restore leaves the trashed card with no action buttons.
  const openOverlay = async (step: string) => {
    await page.goto(`https://wolfaenpak.atlassian.net/wiki/pages/viewpage.action?pageId=${pg.id}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    const ifr = page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"], iframe[src*="atlassian-dev.net"]');
    let bannerIdx = -1;
    const bannerDeadline = Date.now() + 60_000;
    while (bannerIdx < 0 && Date.now() < bannerDeadline) {
      const n = await ifr.count();
      for (let i = 0; i < n; i++) {
        const src = (await ifr.nth(i).getAttribute("src").catch(() => "")) || "";
        if (!src.includes(DEV)) continue;
        const t = (await ifr.nth(i).contentFrame().locator("body").innerText().catch(() => "")) || "";
        if (/Manage Attachments/i.test(t)) { bannerIdx = i; break; }
      }
      if (bannerIdx < 0) await page.waitForTimeout(3000);
    }
    if (bannerIdx < 0) await page.screenshot({ path: `${OUT}/${step}-no-banner.png`, fullPage: true });
    expect(bannerIdx, `${step}: dev doc-ribbon banner found`).toBeGreaterThanOrEqual(0);
    await ifr.nth(bannerIdx).contentFrame().locator(".ribbon-action", { hasText: "Manage" }).click();
    await page.waitForTimeout(5000);

    let overlay: any = null;
    const overlayDeadline = Date.now() + 45_000;
    while (!overlay && Date.now() < overlayDeadline) {
      const all = page.locator("iframe");
      const m = await all.count();
      let bestArea = 0;
      for (let i = 0; i < m; i++) {
        const src = (await all.nth(i).getAttribute("src").catch(() => "")) || "";
        if (!src.includes(DEV)) continue;
        const cf = all.nth(i).contentFrame();
        const hasCard = await cf.locator(".artifact-card").count().catch(() => 0);
        if (hasCard <= 0) continue;
        const box = await all.nth(i).boundingBox().catch(() => null);
        const area = box ? box.width * box.height : 0;
        if (area > bestArea) { bestArea = area; overlay = cf; }
      }
      if (!overlay) await page.waitForTimeout(3000);
    }
    if (!overlay) await page.screenshot({ path: `${OUT}/${step}-no-overlay.png`, fullPage: true });
    expect(overlay, `${step}: dev overlay modal with an artifact card`).toBeTruthy();
    return overlay;
  };

  try {
    // The doc-ribbon renders NULL on a page with zero CURRENT attachments (totalCount===0 —
    // verified live): keep a decoy current attachment so the banner exists while the sealed
    // one sits in trash.
    await uploadBinaryAttachment(pg.id, `sv-decoy-${stamp}.png`, TINY_PNG, "image/png");
    att = await uploadBinaryAttachment(pg.id, filename, TINY_PNG, "image/png");

    // Seal owned by MIHAI (owner-trash sticks); far-future expiry (expired seals are inert
    // everywhere, including the enumerate probe path).
    const expiresAt = new Date(Date.now() + 4 * 3600_000).toISOString();
    await setKvs(`protection-${att.attachmentId}`, {
      contentId: pg.id, attachmentId: att.attachmentId, sealedFileId: att.fileId,
      lockedBy: MIHAI, lockedByName: "Mihai", attachmentName: filename, spaceId, expiresAt,
      sealedVersion: 1, lockDuration: 14400,
    });
    await setKvs(`space-protection-${spaceId}-${att.attachmentId}`, {
      attachmentId: att.attachmentId, contentId: pg.id, lockedBy: MIHAI, lockedByName: "Mihai",
      attachmentName: filename, lockedOn: new Date().toISOString(), expiresAt,
    });

    // kvs.query is EVENTUALLY consistent (it45): the overlay's trashed card comes from
    // enumerate-page-seals (kvs.query beginsWith "protection-") — wait until the seeded seal
    // is QUERY-visible before driving the UI, or the card simply isn't in the list.
    await (async () => {
      const deadline = Date.now() + 90_000;
      for (;;) {
        const r = await getTestState("sentinel-vault", { what: "query", prefix: "protection-" });
        if ((r.keys || []).includes(`protection-${att.attachmentId}`)) return;
        if (Date.now() > deadline) throw new Error("seeded seal never became query-visible");
        await new Promise((res) => setTimeout(res, 4000));
      }
    })();
    console.log("### seeded seal is query-visible");

    await trashAndAssertStuck("initial trash");

    // Flip the restore gate ON, capturing the EXACT prior global object first.
    origGlobal = await getKvs(GKEY);
    globalTouched = true;
    await setKvs(GKEY, { ...(origGlobal || {}), allowSealRestore: true });
    console.log(`### allowSealRestore=true (prior: ${JSON.stringify(origGlobal)?.slice(0, 200)})`);

    // 1) Overlay shows the Trash card with a Restore action.
    const overlay = await openOverlay("1");
    const card = overlay.locator(`.artifact-card:has-text("${filename}")`);
    await expect(card, "trashed sealed file renders as a card").toBeVisible({ timeout: 30_000 });
    await expect(card.locator(".status-lozenge.trashed"), "card shows the Trash state").toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: `${OUT}/1-trash-card.png`, fullPage: true });

    const restoreBtn = card.locator(".action-btn.restore");
    await expect(restoreBtn, "Restore action visible while allowSealRestore=true").toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: `${OUT}/2-restore-visible.png`, fullPage: true });

    // 2) Click Restore → the resolver un-trashes it. REST is the truth for the outcome.
    await restoreBtn.click();
    await pollAttachmentStatus(att.attachmentId, "current", { timeoutMs: 120_000 });
    console.log("### Restore clicked → attachment back to current ✓");
    await page.waitForTimeout(4000); // let the overlay's own refresh settle before the shot
    await page.screenshot({ path: `${OUT}/3-restored-current.png`, fullPage: true });
    // NEW OWNER-INTENT CONTRACT (stabilization hunt F2a): an owner trashing their OWN sealed
    // file RELEASES the seal — the trash event converts the record to a trashedOnly tracking
    // record, and restoring a tracking record CONSUMES it. So post-restore the record is GONE.
    const postRestore = await getKvs(`protection-${att.attachmentId}`);
    expect(postRestore, "owner-trash released the seal; restore consumed the tracking record").toBeNull();

    // 3) Gate OFF → re-trash + RE-SEED a trashedOnly tracking record (the native re-trash has
    //    no seal record left to convert) → reload overlay → Trash card WITHOUT Restore.
    await setKvs(GKEY, { ...(origGlobal || {}), allowSealRestore: false });
    await trashAndAssertStuck("re-trash under gate-off");
    await setKvs(`protection-${att.attachmentId}`, {
      attachmentId: att.attachmentId, contentId: pg.id, lockedBy: MIHAI,
      attachmentName: filename, timestamp: new Date().toISOString(), trashedOnly: true,
    });

    const overlay2 = await openOverlay("4");
    const card2 = overlay2.locator(`.artifact-card:has-text("${filename}")`);
    await expect(card2, "trashed card still renders with the gate off").toBeVisible({ timeout: 30_000 });
    await expect(card2.locator(".status-lozenge.trashed"), "card still shows the Trash state").toBeVisible({ timeout: 15_000 });
    await expect(card2.locator(".action-btn.restore"), "Restore action HIDDEN while allowSealRestore=false").toHaveCount(0);
    await page.screenshot({ path: `${OUT}/4-restore-hidden.png`, fullPage: true });
    console.log("### gate off → Trash card renders without a Restore action ✓");
  } finally {
    // Durable-baseline discipline: put back the EXACT prior admin-settings-global (or remove
    // the key if there was none — never leave a harness-shaped policy behind).
    if (globalTouched) {
      if (origGlobal) await setKvs(GKEY, origGlobal).catch(() => {});
      else await delKvs(GKEY).catch(() => {});
    }
    if (att) {
      await delKvs(`protection-${att.attachmentId}`).catch(() => {});
      await delKvs(`space-protection-${spaceId}-${att.attachmentId}`).catch(() => {});
      await delKvs(`violation-noticed-${pg.id}-${att.attachmentId}-delete`).catch(() => {});
    }
    await deletePage(pg.id).catch(() => {});
  }
});
