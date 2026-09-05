// Coverage gap (2026-09-05) — the panels resolvers behind the overlay's "hide the macro on this
// page" toggle, the panel-key discovery every inline-panel load performs, and the thumbnail
// preview. Hook-driven with REAL identities (SV-SEC-1 gates).
//
//   check-panel-status / store-doc-panel-prefs — read on the FIXTURE page (must report the macro
//     present; self-repairs via fn=ensurePanel if a prior spec stripped it), and the disable→
//     re-enable round-trip on a THROWAWAY page. Disabling also REMOVES the macro node from the
//     body (removePanelNode) — asserted here on purpose, because that is exactly the fixture-drift
//     mechanism that broke six browser specs; re-enabling does NOT re-insert it, so the round-trip
//     ends with ensurePanel and proves the page is whole again. Negative: Gabriela may not write
//     the pref on a page she cannot edit (SVSEC1P), and no property is created.
//   discover-panel-key — after the call, KVS macro-extension-key holds a key ending in the panel
//     module suffix. Negative: Gabriela on SVSEC1P is refused.
//   resolve-artifact-preview — "the worst of the set" in the SV-SEC-1 audit. The assertion that
//     matters is the REFUSAL: Gabriela on a PNG in SVSEC1P gets null with the gate reporting
//     false. The positive DOWNLOAD leg runs asUser(), which has no session in a webtrigger, so from
//     here the entitled caller's proof is the gate (true) plus the data-URI shape whenever the
//     runtime does hand one back; the rendered <img> is the browser lane's proof.
// Self-cleaning: throwaway pages deleted; the fixture page is only ever repaired, never disabled.
// @covers resolver:check-panel-status resolver:store-doc-panel-prefs resolver:discover-panel-key resolver:resolve-artifact-preview
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, readPage, deletePage, uploadBinaryAttachment, TINY_PNG } from "../../data/confluence.mjs";
// @ts-ignore
import { post, get } from "../../data/jira.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const PAGE = process.env.SV_PAGE_ID || "265912321"; // the fixture page (embeds the panel macro)
const PRIV_SPACE = "SVSEC1P";
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const GABI = "712020:2b9d007d-db0d-47c9-b4ae-953f55501f55";
const PANEL_SUFFIX = "/static/sentinel-vault-panel";
const PREF_KEY = "sentinel-vault-page-settings";

const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const hasPanel = (n: any): boolean => !!n && (
  (["extension", "bodiedExtension", "inlineExtension"].includes(n.type) && String(n.attrs?.extensionKey || "").endsWith(PANEL_SUFFIX))
  || (Array.isArray(n.content) && n.content.some(hasPanel)));
const readPref = async (pageId: string) => {
  const r = await get(`/wiki/api/v2/pages/${pageId}/properties?key=${PREF_KEY}`);
  return r?.results?.[0]?.value ?? null;
};

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

test.describe("panel prefs, key discovery, preview", () => {
  let spaceId: string;
  let privSpaceId: string;
  let privPage: any;
  test.beforeAll(async () => {
    spaceId = await spaceIdByKey(SPACE);
    privSpaceId = await ensurePrivateSpace();
    privPage = await createPage({ spaceId: privSpaceId, title: `HARNESS sv-panel priv ${Date.now()}`, adf: doc(heading("PRIVATE", 2), paragraph("private body")) });
  });
  test.afterAll(async () => { if (privPage) await deletePage(privPage.id).catch(() => {}); });

  test("check-panel-status on the fixture page: macro present, not disabled (self-repairing)", async () => {
    let st = await inv("checkPanelStatus", { pageId: PAGE, actor: MIHAI });
    if (st.result?.macroExists !== true) {
      // Fixture drift (a prior spec relinquished the last seal → the macro was stripped). Repair
      // through the app's own insertion path, then the assertion below is about the RESOLVER.
      const rep = await inv("ensurePanel", { pageId: PAGE });
      expect(rep.result?.success, `fixture repair inserted the panel (got: ${JSON.stringify(rep.result)})`).toBe(true);
      st = await inv("checkPanelStatus", { pageId: PAGE, actor: MIHAI });
      console.log("### fixture page had no panel macro — repaired via ensurePanel");
    }
    expect(st.result?.macroExists, "the fixture page carries the panel macro").toBe(true);
    expect(st.result?.macroDisabled, "the fixture page's panel is not disabled (if this fails, clear the sentinel-vault-page-settings property on the fixture page)").toBe(false);
    expect(hasPanel((await readPage(PAGE)).adf), "…and the body really contains the extension node").toBe(true);
    console.log("### fixture panel status ✓ (macroExists true, macroDisabled false)");
  });

  test("store-doc-panel-prefs: disable removes the macro + writes the property; re-enable + ensurePanel restores", async () => {
    const pg = await createPage({ spaceId, title: `HARNESS sv-panel-prefs ${Date.now()}`, adf: doc(heading("Prefs", 2), paragraph("panel prefs round-trip")) });
    try {
      const ins = await inv("ensurePanel", { pageId: pg.id });
      expect(ins.result?.success, "panel inserted on the throwaway page").toBe(true);
      const s0 = await inv("checkPanelStatus", { pageId: pg.id, actor: MIHAI });
      expect(s0.result).toEqual({ macroExists: true, macroDisabled: false });

      const off = await inv("storeDocPanelPrefs", { pageId: pg.id, macroDisabled: "true", actor: MIHAI });
      expect(off.result?.success, `an editor can disable (got: ${off.result?.reason})`).toBe(true);
      expect((await readPref(pg.id))?.macroDisabled, "the page property records the disable").toBe(true);
      const s1 = await inv("checkPanelStatus", { pageId: pg.id, actor: MIHAI });
      expect(s1.result?.macroDisabled, "status reads the disable back").toBe(true);
      expect(s1.result?.macroExists, "disabling also strips the macro node from the body (the fixture-drift mechanism)").toBe(false);
      expect(hasPanel((await readPage(pg.id)).adf), "…confirmed over REST").toBe(false);

      const on = await inv("storeDocPanelPrefs", { pageId: pg.id, macroDisabled: "false", actor: MIHAI });
      expect(on.result?.success, "re-enable succeeds").toBe(true);
      expect((await readPref(pg.id))?.macroDisabled, "the property is updated in place (version bump, same key)").toBe(false);
      const s2 = await inv("checkPanelStatus", { pageId: pg.id, actor: MIHAI });
      expect(s2.result?.macroDisabled, "status restored to not-disabled").toBe(false);
      // Re-enabling does NOT re-insert the node; the repair seam does, and only then is the page whole.
      const rep = await inv("ensurePanel", { pageId: pg.id });
      expect(rep.result?.success).toBe(true);
      expect(rep.result?.skipped, "the node was genuinely absent before the repair").toBe(false);
      const s3 = await inv("checkPanelStatus", { pageId: pg.id, actor: MIHAI });
      expect(s3.result).toEqual({ macroExists: true, macroDisabled: false });
      console.log("### panel prefs round-trip ✓ (disable strips node + sets prop; re-enable + ensurePanel restores)");

      // NEGATIVE (SV-SEC-1, unconditional write gate): Gabriela cannot edit the private page.
      const denied = await inv("storeDocPanelPrefs", { pageId: privPage.id, macroDisabled: "true", actor: GABI });
      expect(denied.result?.success, "a real user without edit rights is REFUSED").toBe(false);
      expect(denied.result?.reason).toMatch(/permission/i);
      expect(await readPref(privPage.id), "…and no property was created by the refused call").toBeNull();
      console.log("### store-doc-panel-prefs gate ✓ (unentitled refused, nothing written)");
    } finally {
      await deletePage(pg.id).catch(() => {});
    }
  });

  test("discover-panel-key: populates macro-extension-key from a page that embeds the panel", async () => {
    const r = await inv("discoverPanelKey", { pageId: PAGE, actor: MIHAI });
    expect(r.result?.success, `discovery succeeds (got: ${r.result?.reason})`).toBe(true);
    const key = await getKvs("macro-extension-key");
    expect(typeof key, "macro-extension-key is stored").toBe("string");
    expect(key.endsWith(PANEL_SUFFIX), `…and names the panel module (got ${key})`).toBe(true);
    if (r.result?.extensionKey) expect(r.result.extensionKey).toBe(key);
    const denied = await inv("discoverPanelKey", { pageId: privPage.id, actor: GABI });
    expect(denied.result?.success, "a page the caller cannot read is refused").toBe(false);
    expect(denied.result?.reason).toMatch(/not authorized/i);
    console.log(`### discover-panel-key ✓ (${key}; unentitled refused)`);
  });

  test("resolve-artifact-preview: refused for an unreadable page; gate passes for an entitled caller", async () => {
    const pg = await createPage({ spaceId, title: `HARNESS sv-preview ${Date.now()}`, adf: doc(paragraph("preview seed")) });
    try {
      const openPng = await uploadBinaryAttachment(pg.id, `sv-preview-${Date.now()}.png`, TINY_PNG, "image/png");
      const privPng = await uploadBinaryAttachment(privPage.id, `sv-preview-priv-${Date.now()}.png`, TINY_PNG, "image/png");

      // THE NEGATIVE — this is the defect the audit called the worst of the set.
      const denied = await inv("resolvePreview", { att: privPng.attachmentId, pageId: privPage.id, actor: GABI });
      expect(denied.gate, "the read gate refuses a real user with no access to the page").toBe(false);
      expect(denied.result, "…and the resolver returns nothing").toBeNull();
      // Gabriela is a real reader of WFH: the gate is about the CALLER on the CONTENT, not about her.
      const gabiOpen = await inv("resolvePreview", { att: openPng.attachmentId, pageId: pg.id, actor: GABI });
      expect(gabiOpen.gate, "the same caller passes the gate on a page she can read").toBe(true);

      // POSITIVE — entitled caller. The gate allows; the download leg is asUser (no webtrigger session).
      const ok = await inv("resolvePreview", { att: openPng.attachmentId, pageId: pg.id, actor: MIHAI });
      expect(ok.gate, "an entitled caller passes the gate").toBe(true);
      if (ok.result?.dataUri) {
        expect(String(ok.result.dataUri).startsWith("data:image/png;base64,"), "the preview is a PNG data URI").toBe(true);
        expect(Buffer.from(String(ok.result.dataUri).split(",")[1], "base64").equals(TINY_PNG), "…of exactly the uploaded bytes").toBe(true);
        console.log("### preview ✓ (refused for unentitled; data URI for entitled)");
      } else {
        expect(ok.result, "no download without a user session — the resolver returns null, not garbage").toBeNull();
        console.log("### preview gate ✓ (refused for unentitled; entitled allowed — download leg needs a user session: browser-lane proof)");
      }
    } finally {
      await deletePage(pg.id).catch(() => {});
    }
  });
});
