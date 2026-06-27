// Sentinel Vault DEEP — sealed SECTIONS. Registers a seal deterministically via the dev hook
// (section-protection-{id} + section-snapshot-{id}, contentHash = hashAdf(body) — our port is
// byte-identical to the app's), then drives the page-content trigger's section-restore pass.
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";
// @ts-ignore
import { spaceIdByKey, createPage, readPage, writeAdf, deletePage } from "../../data/confluence.mjs";
// @ts-ignore
import { buildBodiedExtensionNode, paragraph, heading, hashAdf } from "../../data/adf.mjs";
// @ts-ignore
import { request, get } from "../../data/jira.mjs";

const SENTINEL_APP = "ari:cloud:ecosystem::app/c30bf71e-4287-4872-954d-db49cc68f0ff";
const SENTINEL_ENV = process.env.SENTINEL_ENV_ID || "17516615-12ef-4790-8ce2-29151b7ee9ac";
const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const doc = (...nodes: any[]) => ({ version: 1, type: "doc", content: nodes });
const setKvs = (key: string, value: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(value) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const sectionNode = (sectionId: string, body: any[]) =>
  buildBodiedExtensionNode(SENTINEL_APP, SENTINEL_ENV, "sentinel-vault-sealed-section", { params: { sectionId }, content: body as any });
const LOCKED_BY = "557058:harness-dummy-owner";

test.describe.configure({ timeout: 180_000, retries: 2 });

test("🔎 sealed-section tamper → auto-restore (core protection, verified live)", async () => {
  const spaceId = await spaceIdByKey(SPACE);
  const sectionId = `harness-sec-${Date.now().toString(36)}`;
  const ORIGINAL = [paragraph("ORIGINAL SEALED BODY")];
  const contentHash = hashAdf(ORIGINAL);
  const wrapper = sectionNode(sectionId, ORIGINAL);
  const page = await createPage({ spaceId, title: `HARNESS sealed-section ${Date.now()}`, adf: doc(heading("Doc", 2), wrapper, paragraph("footer")) });
  try {
    // lockedBy = a non-me owner, so my REST edit is a non-owner "tamper" that should be reverted.
    await setKvs(`section-protection-${sectionId}`, { sectionId, pageId: page.id, lockedBy: LOCKED_BY, lockedByName: "Harness Owner", contentHash, originalIndex: 1, sealedVersion: 1, sectionTitle: "S", expiresAt: null });
    await setKvs(`section-snapshot-${sectionId}`, { wrapperNode: wrapper, bodyContent: ORIGINAL, hash: contentHash, version: 1, originalIndex: 1 });
    // The trigger fast-paths unless the PAGE carries a `section-protection-` content property.
    await request("POST", `/wiki/api/v2/pages/${page.id}/properties`, { raw: true, body: { key: "section-protection-", value: [{ sectionId, lockedBy: LOCKED_BY, expiresAt: null }] } });
    const v1 = (await readPage(page.id)).version;
    // tamper the sealed section body (wrapper stays, content changes)
    await writeAdf(page.id, doc(heading("Doc", 2), sectionNode(sectionId, [paragraph("TAMPERED CONTENT")]), paragraph("footer")));
    const restored = await waitForTerminal(async () => {
      const p = await readPage(page.id);
      const text = JSON.stringify(p.adf);
      return p.version > v1 + 1 && text.includes("ORIGINAL SEALED BODY") && !text.includes("TAMPERED") ? p : false;
    }, { timeout: 60_000, interval: 3_000, label: "section tamper restore" });
    expect(restored, "the tampered section body should be auto-restored to the sealed snapshot").toBeTruthy();
  } finally {
    await delKvs(`section-protection-${sectionId}`).catch(() => {});
    await delKvs(`section-snapshot-${sectionId}`).catch(() => {});
    await deletePage(page.id).catch(() => {});
  }
});

// 🔎 CONFIRMS SV-m6: a fully-removed sealed section is re-inserted at the FROZEN originalIndex
// captured at seal time, never re-derived — so when blocks are added above it, the wrapper lands
// in the wrong place (among the new blocks instead of next to its original neighbour).
test("🔎 SV-m6: removed sealed section re-inserts at a STALE index when blocks shift above it", async () => {
  const spaceId = await spaceIdByKey(SPACE);
  const sectionId = `harness-m6-${Date.now().toString(36)}`;
  const BODY = [paragraph("SEALED BODY")];
  const contentHash = hashAdf(BODY);
  const wrapper = sectionNode(sectionId, BODY);
  // v1: [heading TOP, SECTION@index1, FOOTER] — seal records originalIndex=1
  const page = await createPage({ spaceId, title: `HARNESS sv-m6 ${Date.now()}`, adf: doc(heading("TOP", 2), wrapper, paragraph("FOOTER")) });
  try {
    await setKvs(`section-protection-${sectionId}`, { sectionId, pageId: page.id, lockedBy: LOCKED_BY, lockedByName: "Harness Owner", contentHash, originalIndex: 1, sealedVersion: 1, sectionTitle: "S", expiresAt: null });
    await setKvs(`section-snapshot-${sectionId}`, { wrapperNode: wrapper, bodyContent: BODY, hash: contentHash, version: 1, originalIndex: 1 });
    await request("POST", `/wiki/api/v2/pages/${page.id}/properties`, { raw: true, body: { key: "section-protection-", value: [{ sectionId, lockedBy: LOCKED_BY, expiresAt: null }] } });
    const v1 = (await readPage(page.id)).version;
    // v2: DELETE the section AND insert 2 paragraphs at the top → [NEW-ONE, NEW-TWO, TOP, FOOTER]
    await writeAdf(page.id, doc(paragraph("NEW-ONE"), paragraph("NEW-TWO"), heading("TOP", 2), paragraph("FOOTER")));
    const restored: any = await waitForTerminal(async () => {
      const p = await readPage(page.id);
      const content = p.adf?.content || [];
      const idx = content.findIndex((n: any) => n.type === "bodiedExtension" && String(n.attrs?.extensionKey || "").endsWith("/static/sentinel-vault-sealed-section"));
      return p.version > v1 + 1 && idx >= 0 ? { idx, content } : false;
    }, { timeout: 60_000, interval: 3_000, label: "section re-insert" });
    const c = restored.content;
    const at = (i: number) => JSON.stringify(c[i] || {});
    console.log(`SV-m6 → section re-inserted at index ${restored.idx}; [0]=${at(0).slice(0, 30)} [${restored.idx}]=section [${restored.idx + 1}]=${at(restored.idx + 1).slice(0, 30)}`);
    // SV-m6 (fixed): re-inserted right AFTER its original "TOP" heading neighbour (anchored),
    // not at the frozen index among the newly-inserted paragraphs.
    expect(restored.idx, "section re-inserted after the TOP heading (anchored), not at the stale index 1").toBeGreaterThan(1);
    expect(at(restored.idx - 1).includes("TOP"), "the block immediately before the restored section is its original TOP heading").toBe(true);
  } finally {
    await delKvs(`section-protection-${sectionId}`).catch(() => {});
    await delKvs(`section-snapshot-${sectionId}`).catch(() => {});
    await deletePage(page.id).catch(() => {});
  }
});

// 🔎 CONFIRMS SV-M5: the owner-edit branch of the section pass `continue`s WITHOUT re-baselining
// the snapshot, so after the owner edits their section the stored snapshot is stale; a later
// non-owner save then reverts to that stale snapshot, destroying the owner's legitimate edit.
test("✅ SV-M5 (fixed): an owner's sealed-section edit is re-baselined and survives a later non-owner save", async () => {
  const spaceId = await spaceIdByKey(SPACE);
  const me = (await get("/rest/api/3/myself")).accountId;
  const sectionId = `harness-m5b-${Date.now().toString(36)}`;
  const B1 = [paragraph("OWNER V1")];
  const hash1 = hashAdf(B1);
  const page = await createPage({ spaceId, title: `HARNESS sv-M5 ${Date.now()}`, adf: doc(heading("TOP", 2), sectionNode(sectionId, B1), paragraph("FOOTER-A")) });
  try {
    // Seal owned by ME.
    await setKvs(`section-protection-${sectionId}`, { sectionId, pageId: page.id, lockedBy: me, lockedByName: "Me", contentHash: hash1, originalIndex: 1, sealedVersion: 1, sectionTitle: "S", expiresAt: null });
    await setKvs(`section-snapshot-${sectionId}`, { wrapperNode: sectionNode(sectionId, B1), bodyContent: B1, hash: hash1, version: 1, originalIndex: 1 });
    await request("POST", `/wiki/api/v2/pages/${page.id}/properties`, { raw: true, body: { key: "section-protection-", value: [{ sectionId, lockedBy: me, expiresAt: null }] } });
    const v1 = (await readPage(page.id)).version;

    // STEP 2: I (the OWNER) edit the section body to V2 → owner-edit branch lets it stand AND
    // re-baselines the snapshot (SV-M5 fix) so V2 becomes the new sealed baseline.
    await writeAdf(page.id, doc(heading("TOP", 2), sectionNode(sectionId, [paragraph("OWNER EDIT V2")]), paragraph("FOOTER-A")));
    await waitForTerminal(async () => {
      const p = await readPage(page.id);
      if (!(p.version >= v1 + 1 && JSON.stringify(p.adf).includes("OWNER EDIT V2"))) return false;
      const s: any = await getTestState("sentinel-vault", { what: "kvs", key: `section-snapshot-${sectionId}` });
      return !JSON.stringify(s.value?.bodyContent || []).includes("OWNER V1"); // snapshot re-baselined to V2
    }, { timeout: 30_000, interval: 2_500, label: "owner edit stands + snapshot re-baselined" });
    console.log(`SV-M5 → owner edit stood; snapshot re-baselined to V2`);

    // STEP 3: ownership changes — flip lockedBy, KEEPING the re-baselined contentHash/snapshot
    // (a real ownership change would not reset the baseline back to V1).
    const cur: any = (await getTestState("sentinel-vault", { what: "kvs", key: `section-protection-${sectionId}` })).value;
    await setKvs(`section-protection-${sectionId}`, { ...cur, lockedBy: "557058:dummy-other", lockedByName: "Other" });

    // STEP 4: I edit the FOOTER (section body unchanged at V2). As a non-owner now, the section's
    // baseline is V2, so it must NOT be reverted — the owner's V2 survives.
    await writeAdf(page.id, doc(heading("TOP", 2), sectionNode(sectionId, [paragraph("OWNER EDIT V2")]), paragraph("FOOTER-B")));
    let reverted = false;
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const text = JSON.stringify((await readPage(page.id)).adf);
      if (text.includes("OWNER V1") && !text.includes("OWNER EDIT V2")) { reverted = true; break; }
    }
    expect(reverted, "SV-M5 (fixed): the owner's V2 edit must survive (re-baselined) — no revert to V1").toBe(false);
  } finally {
    await delKvs(`section-protection-${sectionId}`).catch(() => {});
    await delKvs(`section-snapshot-${sectionId}`).catch(() => {});
    await deletePage(page.id).catch(() => {});
  }
});

// ✅ FEATURE-CORRECTNESS: an EXPIRED section seal is inert (triggers.js:342) — a tamper is NOT
// restored. (Inverse of the tamper-restore test; confirms expiry actually disables protection.)
test("✅ expired section seal is INERT — a tampered body is NOT restored", async () => {
  const spaceId = await spaceIdByKey(SPACE);
  const sectionId = `harness-exp-${Date.now().toString(36)}`;
  const ORIGINAL = [paragraph("ORIGINAL SEALED BODY")];
  const contentHash = hashAdf(ORIGINAL);
  const wrapper = sectionNode(sectionId, ORIGINAL);
  const past = "2020-01-01T00:00:00.000Z";
  const page = await createPage({ spaceId, title: `HARNESS sv-expiry ${Date.now()}`, adf: doc(heading("Doc", 2), wrapper, paragraph("footer")) });
  try {
    await setKvs(`section-protection-${sectionId}`, { sectionId, pageId: page.id, lockedBy: LOCKED_BY, contentHash, originalIndex: 1, sealedVersion: 1, sectionTitle: "S", expiresAt: past });
    await setKvs(`section-snapshot-${sectionId}`, { wrapperNode: wrapper, bodyContent: ORIGINAL, hash: contentHash, version: 1, originalIndex: 1 });
    await request("POST", `/wiki/api/v2/pages/${page.id}/properties`, { raw: true, body: { key: "section-protection-", value: [{ sectionId, lockedBy: LOCKED_BY, expiresAt: past }] } });
    await writeAdf(page.id, doc(heading("Doc", 2), sectionNode(sectionId, [paragraph("EXPIRED TAMPER")]), paragraph("footer")));
    // Watch for ~18s (well past the ~8s normal restore); a restore here would be a BUG.
    let restored = false;
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const text = JSON.stringify((await readPage(page.id)).adf);
      if (text.includes("ORIGINAL SEALED BODY") && !text.includes("EXPIRED TAMPER")) { restored = true; break; }
    }
    expect(restored, "an EXPIRED section seal must NOT restore the tampered body (inert)").toBe(false);
  } finally {
    await delKvs(`section-protection-${sectionId}`).catch(() => {});
    await delKvs(`section-snapshot-${sectionId}`).catch(() => {});
    await deletePage(page.id).catch(() => {});
  }
});
