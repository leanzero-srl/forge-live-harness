// B6 (worklist #11) — SECTION SEAL CREATION via the REAL resolver path (list-page-headings →
// seal-section → snapshot/content-prop → unseal-section), which every existing section spec skips by
// hook-seeding the seal. Drives the resolvers via the dev testhook fn= seams against a DISPOSABLE page
// (never the fixture). Verifies the bodied-extension wrap, the KVS records, the guards, and the unwrap.
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, readPage, deletePage } from "../../data/confluence.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const ACTOR = "sv-aql-sec-creator";
const inv = (fn: string, params: Record<string, string>) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const isSealedWrap = (n: any) => n.type === "bodiedExtension" && /sealed-section/i.test(String(n.attrs?.extensionKey || ""));

test.describe.configure({ timeout: 180_000, retries: 1 });

test("B6: seal a section via the real resolver + heading picker → wrap + snapshot → unseal", async () => {
  const spaceId = await spaceIdByKey(SPACE);
  const page = await createPage({
    spaceId, title: `HARNESS sv-secseal ${Date.now()}`,
    adf: doc(heading("SECTION ALPHA", 2), paragraph("alpha body content"), heading("SECTION BETA", 2), paragraph("beta body content")),
  });
  let sectionId: string | null = null;
  try {
    // 1. list-page-headings finds both headings with their indices
    const lh = await inv("listPageHeadings", { pageId: page.id, actor: ACTOR });
    const headings = lh.result?.headings || [];
    expect(headings.length, "both headings are listed").toBeGreaterThanOrEqual(2);
    const alpha = headings.find((h: any) => h.text === "SECTION ALPHA");
    expect(alpha, "the ALPHA heading is found by the picker").toBeTruthy();

    // 2. seal-section the ALPHA range via the real resolver
    const sr = await inv("sealSection", { pageId: page.id, hi: String(alpha.index), htext: "SECTION ALPHA", actor: ACTOR });
    expect(sr.result?.success, `seal-section succeeds (got: ${sr.result?.reason})`).toBe(true);
    sectionId = sr.result?.sectionId;
    expect(sectionId, "a sectionId is returned").toBeTruthy();

    // 3. the page ADF now wraps ALPHA in a sealed-section bodiedExtension; BETA untouched
    const p = await readPage(page.id);
    expect((p.adf.content || []).some(isSealedWrap), "a sealed-section macro wraps the range").toBe(true);
    expect(JSON.stringify(p.adf).includes("SECTION BETA"), "the unsealed BETA section is untouched").toBe(true);

    // 4. KVS seal record + snapshot written, owned by the actor
    const rec = await getKvs(`section-protection-${sectionId}`);
    expect(rec?.lockedBy, "seal record is owned by the sealing actor").toBe(ACTOR);
    expect(rec?.contentHash, "a content hash is captured").toBeTruthy();
    expect((await getKvs(`section-snapshot-${sectionId}`))?.bodyContent, "a snapshot body is captured").toBeTruthy();
    console.log("### seal-section ✓ (wrap + snapshot + record owned by actor)");

    // 5. guard: sealing an ALREADY-sealed range is rejected
    const dup = await inv("sealSection", { pageId: page.id, hi: String(alpha.index), htext: "SECTION ALPHA", actor: ACTOR });
    expect(/already sealed|refresh/i.test(dup.result?.reason || ""), "re-sealing the wrapped range is rejected").toBe(true);

    // 6. unseal-section unwraps + clears the records; the body is restored inline
    const us = await inv("unsealSection", { section: sectionId!, actor: ACTOR });
    expect(us.result?.success, `unseal-section succeeds (got: ${us.result?.reason})`).toBe(true);
    const p2 = await readPage(page.id);
    expect((p2.adf.content || []).some(isSealedWrap), "the section is unwrapped after unseal").toBe(false);
    expect(JSON.stringify(p2.adf).includes("alpha body content"), "the alpha body is restored inline").toBe(true);
    expect(await getKvs(`section-protection-${sectionId}`), "the seal record is cleared").toBeFalsy();
    console.log("### unseal-section ✓ (unwrap + records cleared)");
  } finally {
    if (sectionId) { await delKvs(`section-protection-${sectionId}`).catch(() => {}); await delKvs(`section-snapshot-${sectionId}`).catch(() => {}); }
    await deletePage(page.id).catch(() => {});
  }
});
