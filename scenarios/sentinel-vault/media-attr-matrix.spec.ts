// Sentinel Vault DEEP — media tamper MATRIX on one sealed image: five sequential ADF mutation
// classes against the exact app contract (src/server/triggers.js restoreMediaPass +
// src/server/infra/media-presentation.js), each with waitForTerminal + per-case asserts.
// The contract being pinned (read from the code, not assumed):
//   (a) attrs.id swapped to ANOTHER real file's fileId → collectMediaFileIds is attrs.id-based,
//       so the SEALED fileId is now absent = REMOVAL → restore-splice + one content-removal
//       comment (Fix 3 dedup). The swapped-in FOREIGN node is NOT removed — the app only
//       re-splices the sealed node; we document (and do not assert against) the leftover.
//   (b) collection swapped to garbage → attrs.id is STILL present, so NOT a removal; and
//       `collection` is NOT on the Fix-6 presentation protect-list (layout/width/widthType/
//       mediaWidth/mediaHeight) → the app guarantees NOTHING here: no restore, no revert,
//       no comment. We pin that documented non-guarantee so a behavior change is deliberate.
//   (c) mediaSingle re-wrapped inside an expand → collectMediaFileIds recurses and
//       findSealedMediaSingle deep-finds; presentation attrs unchanged → NO violation,
//       node untouched.
//   (d) mediaSingle stripped to a BARE media node in a paragraph — ADF-schema-invalid
//       (paragraph takes inline content only). Probe what writeAdf actually accepts:
//       write rejected → case skipped (not constructible via REST, logged);
//       write accepted + fileId survived → deep collector still sees it → NO violation;
//       write accepted + Confluence stripped the node → that IS a removal → restore + comment.
//   (e) presentation drift (layout wide + widths) → Fix 6 STRICT default
//       (enforceMediaPresentation !== false) → reverted to the captured baseline with exactly
//       ONE layout-changed comment.
// Cases (a) and (e) are positive controls bracketing the quiet windows of (b)-(d) — a dead
// pipeline cannot false-pass the whole matrix. Between cases the page body is restored to the
// sealed baseline and we wait for quiet (markers cleared + version stable) so each case starts
// clean and Fix-3 dedup is re-armed. Baseline captured from a POST-EMBED READ
// (normalization-consistent with the trigger's own reads — sealed-media-attrs.spec.ts lesson).
import { test, expect } from "@playwright/test";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage, uploadBinaryAttachment, TINY_PNG, mediaNodeWithAttrs, readPage, writeAdf, countCommentsMatching, setContentProperty } from "../../data/confluence.mjs";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const DUMMY = "557058:dummy-other";
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const para = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clone = (o: any) => JSON.parse(JSON.stringify(o));

test.describe.configure({ timeout: 780_000 });

test("🔎 sealed-media tamper matrix: id-swap / collection-swap / expand-wrap / bare-media / attr-drift", async () => {
  const spaceId = await spaceIdByKey(SPACE);
  const stamp = Date.now();
  const filename = `sv-matrix-${stamp}.png`;
  const decoyName = `sv-matrix-decoy-${stamp}.png`;
  const pg = await createPage({ spaceId, title: `HARNESS sv-matrix ${stamp}`, adf: doc(para("matrix seed")) });
  let attA: any; // the SEALED image
  let attB: any; // real, un-sealed decoy — target of the id swap in case (a)

  // Deep-walk every node of an ADF tree.
  const walk = (node: any, fn: (n: any) => void) => {
    if (!node || typeof node !== "object") return;
    fn(node);
    for (const c of node.content || []) walk(c, fn);
  };
  const findMs = (adf: any): any => {
    let found: any = null;
    walk(adf, (n) => { if (!found && n?.type === "mediaSingle" && (n.content || []).some((c: any) => c?.type === "media" && c.attrs?.id === attA.fileId)) found = n; });
    return found;
  };

  try {
    attA = await uploadBinaryAttachment(pg.id, filename, TINY_PNG, "image/png");
    attB = await uploadBinaryAttachment(pg.id, decoyName, TINY_PNG, "image/png");

    // Embed ONLY the sealed image; capture the presentation baseline from a POST-EMBED READ.
    const base = await readPage(pg.id);
    base.adf.content.push(mediaNodeWithAttrs(attA.fileId, pg.id));
    await writeAdf(pg.id, base.adf, { message: "embed sealed image (baseline)" });
    const embedded = await readPage(pg.id);
    let baseline: any = null;
    for (const node of embedded.adf.content) {
      if (node?.type === "mediaSingle" && JSON.stringify(node).includes(attA.fileId)) {
        const m = (node.content || []).find((c: any) => c?.type === "media");
        baseline = {
          layout: node.attrs?.layout ?? null, width: node.attrs?.width ?? null,
          widthType: node.attrs?.widthType ?? null,
          mediaWidth: m?.attrs?.width ?? null, mediaHeight: m?.attrs?.height ?? null,
        };
      }
    }
    expect(baseline, "presentation baseline captured from post-embed read").toBeTruthy();
    const baselineAdf = clone(embedded.adf); // the sealed baseline body every case resets to
    console.log(`### captured baseline: ${JSON.stringify(baseline)}`);

    // Full triad + content property (the media fast-path GATE) + far-future expiry (expired
    // seals are inert) + mediaBaseline (Fix 6). Owner is SYNTHETIC; harness user = attacker.
    const expiresAt = new Date(Date.now() + 4 * 3600_000).toISOString();
    await setKvs(`protection-${attA.attachmentId}`, {
      contentId: pg.id, attachmentId: attA.attachmentId, sealedFileId: attA.fileId,
      lockedBy: DUMMY, lockedByName: "Other", attachmentName: filename, spaceId, expiresAt,
      sealedVersion: 1, lockDuration: 14400, mediaBaseline: baseline,
    });
    await setContentProperty(pg.id, "protection-", [{ attachmentId: attA.attachmentId, lockedBy: DUMMY }]);
    await setKvs(`space-protection-${spaceId}-${attA.attachmentId}`, {
      attachmentId: attA.attachmentId, contentId: pg.id, lockedBy: DUMMY, attachmentName: filename,
      lockedOn: new Date().toISOString(), expiresAt,
    });

    let commentCount = 0; // running total of violation comments mentioning `filename`

    // Restore the page body to the sealed baseline and wait for QUIET: dedup markers cleared
    // by the clean save (re-arms Fix 3 for the next case) and page version stable (no
    // in-flight trigger writes bleeding into the next case).
    const restoreBaseline = async (label: string) => {
      await writeAdf(pg.id, clone(baselineAdf), { message: `baseline restore (${label})` });
      await waitForTerminal(async () => {
        if (await getKvs(`violation-noticed-${pg.id}-${attA.attachmentId}-content-removal`)) return false;
        if (await getKvs(`violation-noticed-${pg.id}-${attA.attachmentId}-layout-changed`)) return false;
        const now = await readPage(pg.id);
        return JSON.stringify(now.adf).includes(attA.fileId) ? "clean" : false;
      }, { timeout: 90_000, interval: 4_000, label: `${label}: markers cleared + baseline holds` });
      let v = (await readPage(pg.id)).version;
      for (let i = 0; i < 8; i++) {
        await sleep(6000);
        const v2 = (await readPage(pg.id)).version;
        if (v2 === v) break;
        v = v2;
      }
      console.log(`### quiet after ${label} (version ${v})`);
    };

    // Quiet-window observer for the no-violation cases: sample the ADF for 45s, asserting the
    // sealed fileId never leaves; returns the final ADF for per-case shape asserts.
    const observeQuiet = async (label: string) => {
      const until = Date.now() + 45_000;
      let last: any = null;
      while (Date.now() < until) {
        last = await readPage(pg.id);
        expect(JSON.stringify(last.adf).includes(attA.fileId), `${label}: sealed fileId stays in ADF`).toBeTruthy();
        await sleep(5000);
      }
      return last.adf;
    };

    // ---------- CASE (a): attrs.id swapped to ANOTHER real uploaded file's fileId ----------
    // The sealed fileId vanishes from the doc → the app must treat this as REMOVAL.
    {
      const cur = await readPage(pg.id);
      const body = clone(cur.adf);
      walk(body, (n) => { if (n?.type === "media" && n.attrs?.id === attA.fileId) n.attrs.id = attB.fileId; });
      await writeAdf(pg.id, body, { message: "case a: swap sealed fileId to decoy" });
      await waitForTerminal(async () => (JSON.stringify((await readPage(pg.id)).adf).includes(attA.fileId) ? "restored" : false),
        { timeout: 90_000, interval: 4_000, label: "case a: sealed fileId restored after id-swap" });
      await waitForTerminal(async () => ((await countCommentsMatching(pg.id, filename)) >= commentCount + 1 ? "commented" : false),
        { timeout: 60_000, interval: 4_000, label: "case a: content-removal comment posted" });
      const after = await countCommentsMatching(pg.id, filename);
      expect(after, "case a: exactly ONE fresh content-removal comment (Fix 3)").toBe(commentCount + 1);
      commentCount = after;
      // Documented, NOT asserted-away: the foreign node now pointing at the decoy fileId may
      // remain — restoreMediaPass only re-splices the sealed node, it does not police strangers.
      console.log("### case a: id-swap treated as removal → restore + comment ✓ (positive control #1)");
      await restoreBaseline("case a");
    }

    // ---------- CASE (b): collection swapped to garbage ----------
    // attrs.id is STILL present (collectMediaFileIds matches attrs.id only) → NOT a removal;
    // `collection` is not on the Fix-6 protect-list → no revert either. The app guarantees
    // nothing about collection — this case PINS that non-guarantee.
    {
      const garbage = `garbage-collection-${stamp}`;
      const cur = await readPage(pg.id);
      const body = clone(cur.adf);
      walk(body, (n) => { if (n?.type === "media" && n.attrs?.id === attA.fileId) n.attrs.collection = garbage; });
      await writeAdf(pg.id, body, { message: "case b: swap collection to garbage" });
      // Did the garbage even survive the write? Confluence may normalize collection itself —
      // if it did, the case can only pin the no-comment contract, not persistence.
      const postWrite = await readPage(pg.id);
      let written: string | null = null;
      walk(postWrite.adf, (n) => { if (n?.type === "media" && n.attrs?.id === attA.fileId) written = n.attrs?.collection ?? null; });
      const garbageStuck = written === garbage;
      console.log(`### case b: post-write collection="${written}" (garbage ${garbageStuck ? "stuck" : "normalized away by Confluence"})`);
      const finalAdf = await observeQuiet("case b");
      const finalComments = await countCommentsMatching(pg.id, filename);
      expect(finalComments, "case b: NO violation comment for a collection swap (id still present)").toBe(commentCount);
      if (garbageStuck) {
        let liveCollection: string | null = null;
        walk(finalAdf, (n) => { if (n?.type === "media" && n.attrs?.id === attA.fileId) liveCollection = n.attrs?.collection ?? null; });
        expect(liveCollection, "case b: app does NOT revert collection (not on the protect-list) — documented non-guarantee").toBe(garbage);
      }
      console.log("### case b: collection swap → no removal-restore, no comment ✓ (as the code guarantees)");
      await restoreBaseline("case b");
    }

    // ---------- CASE (c): mediaSingle re-wrapped inside an expand ----------
    // Deep detection (collectMediaFileIds + findSealedMediaSingle recurse) → NO violation;
    // presentation attrs unchanged → node untouched.
    {
      const cur = await readPage(pg.id);
      const body = clone(cur.adf);
      body.content = body.content.map((n: any) =>
        n?.type === "mediaSingle" && JSON.stringify(n).includes(attA.fileId)
          ? { type: "expand", attrs: { title: "harness wrap" }, content: [n] }
          : n);
      await writeAdf(pg.id, body, { message: "case c: wrap sealed media in expand" });
      const finalAdf = await observeQuiet("case c");
      const expandNode = (finalAdf.content || []).find((n: any) => n?.type === "expand" && JSON.stringify(n).includes(attA.fileId));
      expect(expandNode, "case c: expand wrapper survives with the sealed media inside (deeply detected, untouched)").toBeTruthy();
      const finalComments = await countCommentsMatching(pg.id, filename);
      expect(finalComments, "case c: NO violation comment for an expand re-wrap").toBe(commentCount);
      console.log("### case c: expand-wrap → fileId deeply detected, no violation, node untouched ✓");
      await restoreBaseline("case c");
    }

    // ---------- CASE (d): mediaSingle stripped to a BARE media node in a paragraph ----------
    // ADF-schema-invalid (paragraph takes inline content only) — probe what writeAdf accepts.
    {
      const cur = await readPage(pg.id);
      const body = clone(cur.adf);
      body.content = body.content.map((n: any) =>
        n?.type === "mediaSingle" && JSON.stringify(n).includes(attA.fileId)
          ? { type: "paragraph", content: (n.content || []).filter((c: any) => c?.type === "media") }
          : n);
      let accepted = true;
      try {
        await writeAdf(pg.id, body, { message: "case d: strip mediaSingle to bare media in paragraph" });
      } catch (e) {
        accepted = false;
        // SKIPPED: bare media inside a paragraph is not constructible via REST — Confluence
        // rejects the ADF outright, so this tamper vector cannot occur through page writes.
        console.log(`### case d: SKIPPED — writeAdf rejected the bare-media body (not constructible): ${String((e as Error).message).slice(0, 160)}`);
      }
      if (accepted) {
        const postWrite = await readPage(pg.id);
        const survived = JSON.stringify(postWrite.adf).includes(attA.fileId);
        // Observed live: Confluence's storage conversion of this INVALID body is UNSTABLE — our
        // immediate read can see the bare media "survive" while the trigger's own read sees it
        // stripped → the app correctly treats that as a removal (restore + ONE deduped comment).
        // So "survived" in our read does NOT preclude the removal path; accept either converged
        // outcome: node present at the end (survival OR restore) and comments +0 or exactly +1.
        if (survived) {
          await observeQuiet("case d (bare media survived our read)");
          await waitForTerminal(async () => (JSON.stringify((await readPage(pg.id)).adf).includes(attA.fileId) ? "present" : false),
            { timeout: 90_000, interval: 4_000, label: "case d: sealed fileId present at convergence" });
          const finalComments = await countCommentsMatching(pg.id, filename);
          expect(finalComments, "case d: at most ONE removal comment (deduped) even if the trigger's read saw the node stripped").toBeLessThanOrEqual(commentCount + 1);
          expect(finalComments).toBeGreaterThanOrEqual(commentCount);
          commentCount = finalComments;
          console.log(`### case d: bare media accepted; converged with node present; comments now ${finalComments} ✓`);
        } else {
          // Confluence stripped the invalid node on write → the sealed fileId is GONE → the app
          // must treat it exactly like a removal: restore + one fresh comment.
          await waitForTerminal(async () => (JSON.stringify((await readPage(pg.id)).adf).includes(attA.fileId) ? "restored" : false),
            { timeout: 90_000, interval: 4_000, label: "case d: stripped bare-media treated as removal → restored" });
          await waitForTerminal(async () => ((await countCommentsMatching(pg.id, filename)) >= commentCount + 1 ? "commented" : false),
            { timeout: 60_000, interval: 4_000, label: "case d: removal comment posted" });
          const after = await countCommentsMatching(pg.id, filename);
          expect(after, "case d: exactly one fresh removal comment").toBe(commentCount + 1);
          commentCount = after;
          console.log("### case d: Confluence stripped the bare media → removal path: restore + comment ✓");
        }
        await restoreBaseline("case d");
      }
    }

    // ---------- CASE (e): presentation drift (layout wide) — STRICT default ----------
    // enforceMediaPresentation defaults ON → non-owner drift is REVERTED to the captured
    // baseline with exactly ONE layout-changed comment. Positive control #2.
    {
      const cur = await readPage(pg.id);
      const body = clone(cur.adf);
      walk(body, (n) => {
        if (n?.type === "mediaSingle" && (n.content || []).some((c: any) => c?.type === "media" && c.attrs?.id === attA.fileId)) {
          n.attrs = { layout: "wide", width: 66.67, widthType: "percentage" };
        }
      });
      await writeAdf(pg.id, body, { message: "case e: presentation drift (layout wide)" });
      await waitForTerminal(async () => {
        const now = await readPage(pg.id);
        const node = findMs(now.adf);
        if (!node) return false;
        const a = node.attrs || {};
        const reverted = (a.layout ?? null) === (baseline?.layout ?? null)
          && (a.width ?? null) === (baseline?.width ?? null)
          && (a.widthType ?? null) === (baseline?.widthType ?? null);
        return reverted ? "reverted" : false;
      }, { timeout: 90_000, interval: 5_000, label: "case e: presentation reverted to sealed baseline (STRICT default)" });
      const finalRead = await readPage(pg.id);
      expect(JSON.stringify(finalRead.adf).includes(attA.fileId), "case e: fileId never left the ADF").toBeTruthy();
      const m = (findMs(finalRead.adf)?.content || []).find((c: any) => c?.type === "media");
      expect(m?.attrs?.width ?? null, "case e: media width back at baseline").toBe(baseline?.mediaWidth ?? null);
      expect(m?.attrs?.height ?? null, "case e: media height back at baseline").toBe(baseline?.mediaHeight ?? null);
      await waitForTerminal(async () => ((await countCommentsMatching(pg.id, filename)) >= commentCount + 1 ? "commented" : false),
        { timeout: 60_000, interval: 4_000, label: "case e: layout-changed comment posted" });
      const after = await countCommentsMatching(pg.id, filename);
      expect(after, "case e: exactly ONE layout-changed comment").toBe(commentCount + 1);
      commentCount = after;
      console.log("### case e: strict presentation revert + single comment ✓ (positive control #2)");
    }
  } finally {
    if (attA) {
      await delKvs(`protection-${attA.attachmentId}`).catch(() => {});
      await delKvs(`space-protection-${spaceId}-${attA.attachmentId}`).catch(() => {});
      for (const klass of ["content-removal", "layout-changed", "delete", "revert-failed"]) {
        await delKvs(`violation-noticed-${pg.id}-${attA.attachmentId}-${klass}`).catch(() => {});
      }
    }
    await deletePage(pg.id).catch(() => {});
  }
});
