// Sentinel Vault DEEP — adversarial-hunt Findings 2+4 regression: SANCTIONED removals of a
// sealed embed must not be undone or commented, and must RE-BASELINE the seal to embedded:false
// so later non-owner saves can't phantom-violate (Finding 1's mechanism).
//   (a) OWNER intent: the seal owner removes their own embed → no restore, no comment, and the
//       protection record flips embedded:false (pre-fix: the NEXT non-owner save re-spliced the
//       owner's deliberate cleanup and publicly blamed the bystander).
//   (b) GRANTEE intent: a non-owner with an ACTIVE edit grant removes the embed → same contract
//       (pre-fix: the presence path never consulted grants, so the approved grantee's removal
//       was reverted and the grantee accused).
// The embedded:false flip doubles as the positive control: it proves the trigger PROCESSED the
// edit — a dead pipeline could not produce it, so the silence assertions can't false-negative.
// The API actor is mihai: seal owner in (a), granted editor of a synthetic-owner seal in (b).
import { test, expect } from "@playwright/test";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage, uploadBinaryAttachment, TINY_PNG, mediaNodeWithAttrs, readPage, writeAdf, countCommentsMatching, setContentProperty } from "../../data/confluence.mjs";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086"; // the API actor
const DUMMY = "557058:dummy-other";
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const para = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });

test.describe.configure({ timeout: 300_000 });

// Shared journey: page + embedded sealed image (owner per-case), remove the node as mihai,
// wait for the embedded:false re-baseline, then assert no restore + no comment.
async function runIntentCase(opts: { tag: string; owner: string; seedGrant: boolean }) {
  const spaceId = await spaceIdByKey(SPACE);
  const stamp = Date.now();
  const filename = `sv-intent-${opts.tag}-${stamp}.png`;
  const pg = await createPage({ spaceId, title: `HARNESS sv-owner-intent-${opts.tag} ${stamp}`, adf: doc(para("intent seed")) });
  let att: any;
  const grantKey = () => `edit-grant-${att.attachmentId}-${MIHAI}`;
  try {
    att = await uploadBinaryAttachment(pg.id, filename, TINY_PNG, "image/png");
    const base = await readPage(pg.id);
    base.adf.content.push(mediaNodeWithAttrs(att.fileId, pg.id));
    await writeAdf(pg.id, base.adf, { message: "embed sealed image" });
    // Baseline from a post-embed READ (normalization-consistent — the sealed-media-attrs pattern).
    const embeddedRead = await readPage(pg.id);
    let baseline: any = null;
    for (const node of embeddedRead.adf.content) {
      if (node?.type === "mediaSingle" && JSON.stringify(node).includes(att.fileId)) {
        const m = (node.content || []).find((c: any) => c?.type === "media");
        baseline = {
          layout: node.attrs?.layout ?? null, width: node.attrs?.width ?? null,
          widthType: node.attrs?.widthType ?? null,
          mediaWidth: m?.attrs?.width ?? null, mediaHeight: m?.attrs?.height ?? null,
        };
      }
    }
    expect(baseline, "baseline captured from post-embed read").toBeTruthy();

    const expiresAt = new Date(Date.now() + 4 * 3600_000).toISOString();
    await setKvs(`protection-${att.attachmentId}`, {
      contentId: pg.id, attachmentId: att.attachmentId, sealedFileId: att.fileId,
      lockedBy: opts.owner, lockedByName: opts.owner === MIHAI ? "Mihai" : "Other",
      attachmentName: filename, spaceId, expiresAt,
      sealedVersion: 1, lockDuration: 14400, embedded: true, mediaBaseline: baseline,
    });
    await setContentProperty(pg.id, "protection-", [{ attachmentId: att.attachmentId, lockedBy: opts.owner }]);
    if (opts.seedGrant) {
      // Active edit grant for mihai on the synthetic-owner seal (the approveEditRequest shape).
      await setKvs(grantKey(), {
        artifactId: att.attachmentId, editorAccountId: MIHAI, editorName: "Mihai",
        grantedBy: opts.owner, grantedAt: new Date().toISOString(), expiresAt,
      });
    }

    // THE SANCTIONED REMOVAL: mihai deletes the embed via an ordinary page save.
    const cur = await readPage(pg.id);
    const body = JSON.parse(JSON.stringify(cur.adf));
    body.content = body.content.filter((n: any) => !(n?.type === "mediaSingle" && JSON.stringify(n).includes(att.fileId)));
    body.content.push(para(`replaced the image ${stamp}`));
    await writeAdf(pg.id, body, { message: `sanctioned removal (${opts.tag})` });

    // Terminal signal first: the trigger re-baselines the seal to embedded:false.
    await waitForTerminal(async () => ((await getKvs(`protection-${att.attachmentId}`))?.embedded === false ? "rebaselined" : false),
      { timeout: 90_000, interval: 4_000, label: `${opts.tag}: seal re-baselined to embedded:false` });
    console.log(`### ${opts.tag}: embedded flipped false ✓ (trigger processed the edit)`);

    // Settle, then the intent contract: the node STAYS gone and nobody is accused.
    await new Promise((r) => setTimeout(r, 8000));
    const after = await readPage(pg.id);
    expect(JSON.stringify(after.adf).includes(att.fileId), `${opts.tag}: no restore — the removal sticks`).toBeFalsy();
    expect(await countCommentsMatching(pg.id, filename), `${opts.tag}: zero violation comments`).toBe(0);
    const seal = await getKvs(`protection-${att.attachmentId}`);
    expect(seal?.lockedBy, `${opts.tag}: seal record survives the re-baseline`).toBe(opts.owner);
  } finally {
    if (att) {
      await delKvs(`protection-${att.attachmentId}`).catch(() => {});
      await delKvs(grantKey()).catch(() => {});
      await delKvs(`violation-noticed-${pg.id}-${att.attachmentId}-content-loss`).catch(() => {});
      await delKvs(`violation-noticed-${pg.id}-${att.attachmentId}-revert-failed`).catch(() => {});
    }
    await deletePage(pg.id).catch(() => {});
  }
}

test("🔎 owner removes their own sealed embed → no restore, no comment, embedded:false (Finding 2)", async () => {
  await runIntentCase({ tag: "owner", owner: MIHAI, seedGrant: false });
});

test("🔎 granted editor removes the sealed embed → no restore, no comment, embedded:false (Finding 4)", async () => {
  await runIntentCase({ tag: "grantee", owner: DUMMY, seedGrant: true });
});
