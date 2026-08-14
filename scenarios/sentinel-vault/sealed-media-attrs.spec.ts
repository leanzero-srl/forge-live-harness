// Sentinel Vault DEEP — the incident-2026-07-22 Bug-B regression: presentation-attr changes
// (resize/layout) on a SEALED image, REST-simulated (the server consumes the saved ADF; a real
// editor drag produces the identical event class, just flakily — and the double-write here
// GUARANTEES the double-delivery case every run instead of hoping the editor double-fires).
//
// Policy-switched via SV_MEDIA_ATTR_POLICY:
//   lenient (default until Fix 6 enforcement ships): the resize SAVES, the app never writes,
//     and — the no-spam contract — ZERO violation comments for a benign attr change.
//   strict: the non-owner attr change is REVERTED to the sealed baseline, with EXACTLY ONE
//     violation comment despite two deliveries, and the fileId never leaves the ADF.
// Both variants: never ≥2 comments per incident window (unconditional).
//
// Ends with a POSITIVE CONTROL (real node removal → restore + comment) so a quiet observation
// window can't be a dead-trigger false negative.
import { test, expect } from "@playwright/test";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage, uploadBinaryAttachment, TINY_PNG, mediaNodeWithAttrs, readPage, writeAdf, countCommentsMatching, setContentProperty } from "../../data/confluence.mjs";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const DUMMY = "557058:dummy-other";
const POLICY = (process.env.SV_MEDIA_ATTR_POLICY || "lenient") as "lenient" | "strict";

const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const para = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });

test.describe.configure({ timeout: 300_000 });

test(`🔎 sealed-image resize (${POLICY}): saved-or-reverted per policy, never comment spam`, async () => {
  const spaceId = await spaceIdByKey(SPACE);
  const stamp = Date.now();
  const filename = `sv-bugB-${stamp}.png`;
  const pg = await createPage({ spaceId, title: `HARNESS sv-media-attrs ${stamp}`, adf: doc(para("bugB seed")) });
  let att: any;
  try {
    att = await uploadBinaryAttachment(pg.id, filename, TINY_PNG, "image/png");
    const sealedNode = mediaNodeWithAttrs(att.fileId, pg.id); // layout:center, no width
    const base = await readPage(pg.id);
    base.adf.content.push(sealedNode);
    await writeAdf(pg.id, base.adf, { message: "embed sealed image (baseline)" });
    const expiresAt = new Date(Date.now() + 4 * 3600_000).toISOString();
    await setKvs(`protection-${att.attachmentId}`, {
      contentId: pg.id, attachmentId: att.attachmentId, sealedFileId: att.fileId,
      lockedBy: DUMMY, lockedByName: "Other", attachmentName: filename, spaceId, expiresAt,
      sealedVersion: 1, lockDuration: 14400,
    });
    // The protection- content property is the media fast-path GATE (collectMediaSealsForPage
    // early-returns without it) — a KVS-only seed leaves the page pipeline blind.
    await setContentProperty(pg.id, "protection-", [{ attachmentId: att.attachmentId, lockedBy: DUMMY }]);

    // THE RESIZE — write 1 (wide + explicit widths), then write 2 ~3s later (second delivery).
    const resize = (width: number) => {
      return readPage(pg.id).then((cur: any) => {
        const body = JSON.parse(JSON.stringify(cur.adf));
        for (const node of body.content) {
          if (node?.type === "mediaSingle" && JSON.stringify(node).includes(att.fileId)) {
            node.attrs = { layout: "wide", width, widthType: "percentage" };
            for (const m of node.content || []) if (m.type === "media") m.attrs = { ...m.attrs, width: 400, height: 400 };
          }
        }
        return writeAdf(pg.id, body, { message: `resize ${width}` });
      });
    };
    await resize(66.67);
    await new Promise((r) => setTimeout(r, 3000));
    await resize(50);
    console.log("### two attr-writes issued (double-delivery simulation)");

    // Observation window: poll ADF attrs + page version + comments for 60s.
    const observeUntil = Date.now() + 60_000;
    let lastAttrs: any = null;
    let lastVersion = 0;
    while (Date.now() < observeUntil) {
      const now = await readPage(pg.id);
      lastVersion = now.version;
      for (const node of now.adf.content) {
        if (node?.type === "mediaSingle" && JSON.stringify(node).includes(att.fileId)) lastAttrs = node.attrs;
      }
      // fileId must NEVER leave the ADF at any sampled point (no destructive splice).
      expect(JSON.stringify(now.adf).includes(att.fileId), "fileId stays in ADF throughout").toBeTruthy();
      await new Promise((r) => setTimeout(r, 5000));
    }
    const comments = await countCommentsMatching(pg.id, filename);
    console.log(`### after window: attrs=${JSON.stringify(lastAttrs)} version=${lastVersion} comments=${comments}`);

    // Unconditional: never comment spam.
    expect(comments, "never ≥2 violation comments for one incident").toBeLessThanOrEqual(1);

    if (POLICY === "lenient") {
      expect(lastAttrs?.layout, "resize preserved (lenient: presentation not sealed)").toBe("wide");
      expect(comments, "ZERO violation comments for a benign attr change").toBe(0);
    } else {
      // strict: reverted to the sealed baseline...
      expect(lastAttrs?.layout, "attr change reverted to sealed baseline").toBe("center");
      expect(lastAttrs?.width, "explicit width removed by revert").toBeUndefined();
      // ...with exactly one comment despite two deliveries.
      expect(comments, "exactly ONE violation comment despite double delivery").toBe(1);
    }

    // POSITIVE CONTROL: a real removal must restore + comment within the same window length —
    // proves the pipeline was alive while we observed silence above.
    const cur = await readPage(pg.id);
    const body = JSON.parse(JSON.stringify(cur.adf));
    body.content = body.content.filter((n: any) => !(n?.type === "mediaSingle" && JSON.stringify(n).includes(att.fileId)));
    await writeAdf(pg.id, body, { message: "remove sealed media (positive control)" });
    await waitForTerminal(async () => {
      const now = await readPage(pg.id);
      return JSON.stringify(now.adf).includes(att.fileId) ? "restored" : false;
    }, { timeout: 90_000, interval: 4_000, label: "positive control: removed sealed media restored" });
    const afterControl = await countCommentsMatching(pg.id, filename);
    expect(afterControl, "positive control produced a violation comment").toBeGreaterThan(comments);
    console.log("### positive control: restore + comment ✓ (pipeline was live)");
  } finally {
    if (att) await delKvs(`protection-${att.attachmentId}`).catch(() => {});
    await deletePage(pg.id).catch(() => {});
  }
});
