// SV-SEC-1 — the NEGATIVE case. A happy-path test proves nothing here: the defect is that an
// unentitled caller was NOT refused. Drives the real seal-section resolver through the dev
// testhook against a DISPOSABLE page (never the fixture). Pure testhook + REST, no browser.
//
// Run: npx playwright test --project=chromium scenarios/sentinel-vault/section-seal-perm-gate.spec.ts
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, readPage, deletePage } from "../../data/confluence.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
// A REAL account with edit rights on SPACE — the anti-over-tighten positive control.
const ENTITLED = process.env.SENTINEL_TEST_ACCOUNT_ID || "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
// Syntactically valid, belongs to nobody on this tenant → the permission check denies → refuse.
const UNENTITLED = "712020:00000000-0000-0000-0000-0000deadbeef";

const inv = (fn: string, p: Record<string, string>) =>
  getTestState("sentinel-vault", { what: "invoke", fn, ...p });
const getKvs = async (k: string) => (await getTestState("sentinel-vault", { what: "kvs", key: k })).value;
const delKvs = (k: string) => getTestState("sentinel-vault", { what: "delete", key: k });
// NOTE the testhook `query` seam returns { prefix, keys } — KEYS ONLY, no values. Asserting on a
// `results[].value` shape here would filter an always-empty array and pass vacuously.
const sealKeys = async (): Promise<string[]> =>
  (await getTestState("sentinel-vault", { what: "query", prefix: "section-protection-" })).keys || [];
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const isSealedWrap = (n: any) =>
  n.type === "bodiedExtension" && /sealed-section/i.test(String(n.attrs?.extensionKey || ""));

test.describe.configure({ timeout: 180_000, retries: 1 });

test("SV-SEC-1: an unentitled caller cannot seal a section on a page they can merely name", async () => {
  const spaceId = await spaceIdByKey(SPACE);
  const page = await createPage({
    spaceId, title: `HARNESS svsec1 ${Date.now()}`,
    adf: doc(heading("SECTION ALPHA", 2), paragraph("alpha body content")),
  });
  let sectionId: string | null = null;
  try {
    const lh = await inv("listPageHeadings", { pageId: page.id, actor: ENTITLED });
    const alpha = (lh.result?.headings || []).find((h: any) => h.text === "SECTION ALPHA");
    expect(alpha, "heading picker found ALPHA").toBeTruthy();

    const before = await readPage(page.id);
    const beforeAdf = JSON.stringify(before.adf);
    const keysBefore = await sealKeys();

    // 1. THE NEGATIVE — the actual defect.
    const bad = await inv("sealSection", {
      pageId: page.id, hi: String(alpha.index), htext: "SECTION ALPHA", actor: UNENTITLED,
    });
    expect(bad.result?.success, `unentitled seal is refused (got: ${bad.result?.reason})`).toBe(false);
    expect(String(bad.result?.reason)).toMatch(/permission to edit this page/i);
    // It must be a DENIAL, not a broken probe. Without this the gate could be failing closed for
    // everyone and the negative would still pass — a green test proving nothing.
    expect(String(bad.result?.reason), "denied, not indeterminate").not.toMatch(/could not verify/i);

    // 2. THE REFUSAL MUST BE INERT — prove writeDocBody never ran. A returned {success:false} is
    //    not on its own proof that nothing was written.
    const after = await readPage(page.id);
    expect((after.adf.content || []).some(isSealedWrap), "no sealed wrapper was written").toBe(false);
    expect(JSON.stringify(after.adf), "page ADF byte-identical after the refusal").toBe(beforeAdf);
    // readPage returns version as a NUMBER (not {number}); asserting `.number` would compare
    // undefined to undefined and pass regardless.
    expect(typeof after.version, "version is a number").toBe("number");
    expect(after.version, "page version did not advance").toBe(before.version);

    // 3. NO KVS RECORD — the record is what the page trigger later ENFORCES, so a record without
    //    a wrapper would still be damage.
    expect(bad.result?.sectionId, "no sectionId was handed out").toBeFalsy();
    const keysAfter = await sealKeys();
    const newKeys = keysAfter.filter((k) => !keysBefore.includes(k));
    expect(newKeys, `the refused seal left no section-protection record (${newKeys.join(",")})`).toEqual([]);

    // 4. ANTI-OVER-TIGHTEN positive control — do not fix it into uselessness. If this fails with
    //    "could not verify", the gate is denying rather than discriminating: the asApp
    //    content-permission probe is not returning a per-subject answer for the app principal.
    const good = await inv("sealSection", {
      pageId: page.id, hi: String(alpha.index), htext: "SECTION ALPHA", actor: ENTITLED,
    });
    expect(good.result?.success, `entitled seal still succeeds (got: ${good.result?.reason})`).toBe(true);
    sectionId = good.result?.sectionId;
    expect(sectionId, "a sectionId was issued").toBeTruthy();
    const sealed = await readPage(page.id);
    expect((sealed.adf.content || []).some(isSealedWrap), "entitled seal DID write").toBe(true);
    expect(sealed.version, "page version advanced for the entitled seal").toBeGreaterThan(before.version);

    // 5. The record carries the page's REAL realm, not a caller-supplied one.
    const rec = await getKvs(`section-protection-${sectionId}`);
    expect(rec?.spaceKey, "record stores the page's real space key").toBe(SPACE);
    expect(rec?.lockedBy).toBe(ENTITLED);
    expect(String(rec?.pageId)).toBe(String(page.id));

    console.log("### SV-SEC-1 gate ✓ (unentitled refused + page untouched; entitled still seals)");
  } finally {
    if (sectionId) {
      const rec = await getKvs(`section-protection-${sectionId}`).catch(() => null);
      await delKvs(`section-protection-${sectionId}`);
      await delKvs(`section-snapshot-${sectionId}`);
      // The existing B6 spec forgets this one; sealSection writes it.
      if (rec?.spaceId) await delKvs(`space-section-protection-${rec.spaceId}-${sectionId}`);
    }
    await deletePage(page.id);
  }
});
