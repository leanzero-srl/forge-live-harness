// Sentinel Vault DEEP — Fix 5 regression: the realm-console Sealed Files list flags seals whose
// attachment is TRASHED ("Trash" lozenge) instead of rendering them as normal live rows
// (incident 2026-07-22: console and inline panel disagreed — the panel probed, the console not).
// Seeds a real trashed attachment + index row, drives the REAL console, asserts the badge.
import { test, expect } from "../../fixtures/forge";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage, uploadBinaryAttachment, TINY_PNG, trashAttachment, pollAttachmentStatus } from "../../data/confluence.mjs";
import { getTestState } from "../../testhook/client";
import { mkdirSync } from "node:fs";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const DEV = "17516615";
const OUT = "/tmp/sv-stale-badge";
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const para = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });

test.describe.configure({ timeout: 240_000 });

test("🔎 realm console badges a trashed sealed file as Trash (Fix 5 stale parity)", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const spaceId = await spaceIdByKey(SPACE);
  const stamp = Date.now();
  const filename = `sv-stale-${stamp}.png`;
  const pg = await createPage({ spaceId, title: `HARNESS sv-stale ${stamp}`, adf: doc(para("stale seed")) });
  let att: any;
  try {
    att = await uploadBinaryAttachment(pg.id, filename, TINY_PNG, "image/png");
    // Seal owner MUST be the trasher (the harness user): the trashed:attachment event can
    // arrive SECONDS late, and if it then finds a seal owned by someone else, Fix 2 correctly
    // RESTORES the attachment — which un-trashes our fixture mid-test (observed live: the
    // "stale" row probed back as current). Owner-trash is allowed → the trash sticks.
    const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
    await trashAttachment(att.attachmentId);
    await pollAttachmentStatus(att.attachmentId, "trashed", { timeoutMs: 30_000 });
    const expiresAt = new Date(Date.now() + 4 * 3600_000).toISOString();
    await setKvs(`protection-${att.attachmentId}`, {
      contentId: pg.id, attachmentId: att.attachmentId, sealedFileId: att.fileId,
      lockedBy: MIHAI, lockedByName: "Mihai", attachmentName: filename, spaceId, expiresAt,
    });
    await setKvs(`space-protection-${spaceId}-${att.attachmentId}`, {
      attachmentId: att.attachmentId, contentId: pg.id, lockedBy: MIHAI, lockedByName: "Mihai",
      attachmentName: filename, lockedOn: new Date().toISOString(), expiresAt, pageTitle: `HARNESS sv-stale ${stamp}`,
    });
    // Re-assert the trash STUCK (a late event may still race the seed — abort loudly if so).
    await new Promise((r) => setTimeout(r, 8000));
    await pollAttachmentStatus(att.attachmentId, "trashed", { timeoutMs: 20_000 });

    // kvs.query is EVENTUALLY consistent (it45): the console's sealed-files list is query-backed,
    // so wait until the seeded index row is QUERY-visible before opening the console — otherwise
    // page 1 renders without our row (or with a stale view of it) and the assert races.
    await (async () => {
      const deadline = Date.now() + 90_000;
      for (;;) {
        const r = await getTestState("sentinel-vault", { what: "query", prefix: `space-protection-${spaceId}-` });
        if ((r.keys || []).includes(`space-protection-${spaceId}-${att.attachmentId}`)) return;
        if (Date.now() > deadline) throw new Error("seeded index row never became query-visible");
        await new Promise((res) => setTimeout(res, 4000));
      }
    })();
    console.log("### seeded index row is query-visible");

    // Drive the real realm console (dev env, canonical deep link — forge/deeplink.ts shape).
    await page.goto(`https://wolfaenpak.atlassian.net/wiki/spaces/${SPACE}/apps/c30bf71e-4287-4872-954d-db49cc68f0ff/17516615-12ef-4790-8ce2-29151b7ee9ac/realm-console`, { waitUntil: "domcontentloaded" });
    let frame: any = null;
    const findDeadline = Date.now() + 60_000;
    while (!frame && Date.now() < findDeadline) {
      await page.waitForTimeout(4000);
      const ifr = page.locator("iframe");
      const n = await ifr.count();
      for (let i = 0; i < n; i++) {
        const src = (await ifr.nth(i).getAttribute("src").catch(() => "")) || "";
        if (!src.includes(DEV)) continue;
        const cf = ifr.nth(i).contentFrame();
        if (await cf.locator(".space-admin-title").count().catch(() => 0)) { frame = cf; break; }
      }
    }
    if (!frame) await page.screenshot({ path: `${OUT}/no-console.png`, fullPage: true });
    expect(frame, "realm console iframe reached (past the loading spinner)").toBeTruthy();

    await frame.locator(".tab-button", { hasText: "Sealed Files" }).click();
    // Poll until our seeded row appears WITH the Trash badge (the probe adds ~1-2s).
    const row = frame.locator(`.artifact-card:has-text("${filename}")`);
    await expect(row, "seeded stale seal row visible").toBeVisible({ timeout: 45_000 });
    await expect(row.locator(".status-lozenge.trashed"), "Trash lozenge on the stale row").toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: `${OUT}/stale-badge.png`, fullPage: true });
    console.log("### realm console shows the Trash badge for a trashed sealed file ✓");
  } finally {
    if (att) {
      await delKvs(`protection-${att.attachmentId}`).catch(() => {});
      await delKvs(`space-protection-${spaceId}-${att.attachmentId}`).catch(() => {});
    }
    await deletePage(pg.id).catch(() => {});
  }
});
