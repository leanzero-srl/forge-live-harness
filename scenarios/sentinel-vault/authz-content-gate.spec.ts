// SV-SEC-1 — the standing regression guard for the resolver authorization gate.
//
// The defect: resolver actions took a pageId (or attachmentId) straight from the client payload
// and then read or REWROTE that content through asApp(), which holds read:confluence-content.all
// + write:confluence-content across the whole tenant, with nothing checking the CALLER against it.
// Any logged-in user could therefore reach any page on the site through the app's authority.
//
// WHY THIS SPEC IS SHAPED THE WAY IT IS. A happy-path test proves nothing about an authorization
// fix — a gate that is silently a no-op passes it. The load-bearing assertions here are the
// NEGATIVE ones, and they use GABRIELA: a REAL, licensed Confluence account that genuinely has no
// permission on the private probe space. A synthetic account id would be a weaker proof (it fails
// merely because the site cannot resolve it), so it is asserted SEPARATELY — it covers a distinct
// branch, since Confluence answers an unresolvable subject with a 404 rather than
// hasPermission:false, and reading only the body would have let that through as an allow.
//
// The positive assertions exist so a future "fix" cannot pass by denying everyone.
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, readPage, deletePage } from "../../data/confluence.mjs";
// @ts-ignore
import { post } from "../../data/jira.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";

const OPEN_SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
// A dedicated PRIVATE space is the only way to manufacture a real unentitled user on this site:
// the API token cannot set page-level restrictions here, and there is no second identity that is
// merely a non-admin. Created on demand and left in place (it holds no data).
const PRIV_SPACE = "SVSEC1P";

const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086"; // the API actor; access everywhere
const GABI = "712020:2b9d007d-db0d-47c9-b4ae-953f55501f55"; // REAL account, NO access to PRIV_SPACE
const SYNTH = "sv-sec1-synthetic-actor"; // not a resolvable account at all

const inv = (fn: string, params: Record<string, string>) =>
  getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const body = () =>
  doc(heading("SECTION ALPHA", 2), paragraph("alpha body"), heading("SECOND", 2), paragraph("second body"));

async function ensurePrivateSpace(): Promise<string> {
  const existing = await spaceIdByKey(PRIV_SPACE);
  if (existing) return existing;
  await post("/wiki/rest/api/space/_private", {
    key: PRIV_SPACE,
    name: "SV-SEC-1 authz probe",
    description: { plain: { value: "Harness-owned. Private on purpose — see authz-content-gate.spec.ts", representation: "plain" } },
  });
  const id = await spaceIdByKey(PRIV_SPACE);
  if (!id) throw new Error(`could not create or find the private probe space ${PRIV_SPACE}`);
  return id;
}

test.describe.configure({ timeout: 240_000, retries: 1 });

test("SV-SEC-1: the seal path refuses an unentitled caller and still serves an entitled one", async () => {
  const openSpaceId = await spaceIdByKey(OPEN_SPACE);
  const privSpaceId = await ensurePrivateSpace();

  const openPage = await createPage({ spaceId: openSpaceId, title: `HARNESS sv-sec1 open ${Date.now()}`, adf: body() });
  const privPage = await createPage({ spaceId: privSpaceId, title: `HARNESS sv-sec1 priv ${Date.now()}`, adf: body() });
  const sealed: string[] = [];

  try {
    // ---------- THE NEGATIVE CASE. This is the actual defect. ----------
    const denied = await inv("sealSection", { pageId: privPage.id, hi: "0", htext: "SECTION ALPHA", actor: GABI });
    expect(denied.result?.success, "a real user with no access to the space is REFUSED by sealSection").toBe(false);
    expect(String(denied.result?.reason || ""), "and is told why").toMatch(/permission/i);

    // A refusal that still performed the write would be worse than no gate at all.
    const untouched = await readPage(privPage.id);
    expect(
      JSON.stringify(untouched.adf),
      "the refused call left the page body untouched — no macro wrap, no version bump",
    ).not.toMatch(/sealed-section/i);

    // Distinct branch: Confluence answers an unresolvable subject with 404, not hasPermission:false.
    const synth = await inv("sealSection", { pageId: openPage.id, hi: "0", htext: "SECTION ALPHA", actor: SYNTH });
    expect(synth.result?.success, "an unresolvable accountId is REFUSED — a 404 must not read as an allow").toBe(false);

    // ---------- the disclosure side of the same defect ----------
    const leak = await inv("listPageHeadings", { pageId: privPage.id, actor: GABI });
    expect((leak.result?.headings || []).length, "listPageHeadings returns no outline of a page the caller cannot read").toBe(0);

    const leakSynth = await inv("listPageHeadings", { pageId: privPage.id, actor: SYNTH });
    expect((leakSynth.result?.headings || []).length, "…and none for an unresolvable account either").toBe(0);

    const seals = await inv("enumerateSectionSeals", { pageId: privPage.id, actor: GABI });
    expect((seals.result?.sections || []).length, "enumerateSectionSeals discloses no seals on an unreadable page").toBe(0);

    // ---------- POSITIVE: not fixed into uselessness ----------
    const outline = await inv("listPageHeadings", { pageId: openPage.id, actor: MIHAI });
    const headings = outline.result?.headings || [];
    expect(headings.length, "an entitled caller still gets the heading outline").toBeGreaterThanOrEqual(2);
    const alpha = headings.find((h: any) => h.text === "SECTION ALPHA");
    expect(alpha, "the picker still finds the heading").toBeTruthy();

    const ok = await inv("sealSection", { pageId: openPage.id, hi: String(alpha.index), htext: "SECTION ALPHA", actor: MIHAI });
    expect(ok.result?.success, `an entitled caller can still seal (got: ${ok.result?.reason})`).toBe(true);
    if (ok.result?.sectionId) sealed.push(ok.result.sectionId);

    const after = await readPage(openPage.id);
    expect(JSON.stringify(after.adf), "and the seal really wrapped the section in the page body").toMatch(/sealed-section/i);

    // The gate is about the CALLER, not about the space being private.
    const okPriv = await inv("sealSection", { pageId: privPage.id, hi: "0", htext: "SECTION ALPHA", actor: MIHAI });
    expect(okPriv.result?.success, "an entitled caller can seal inside the private space too").toBe(true);
    if (okPriv.result?.sectionId) sealed.push(okPriv.result.sectionId);

    console.log("### SV-SEC-1 authz gate ✓ (unentitled refused, entitled unaffected, no write on refusal)");
  } finally {
    for (const id of sealed) await inv("unsealSection", { section: id, actor: MIHAI }).catch(() => {});
    await deletePage(openPage.id).catch(() => {});
    await deletePage(privPage.id).catch(() => {});
  }
});
