// A1 (ledger #49) — the activity record. Every protection / workflow event on a page is written
// ONCE to two durable keys (activity-page-{pageId}-… and activity-space-{spaceKey}-…, no TTL) and
// read back through two gated resolvers. This spec makes real events happen through real
// resolvers (extend, request, deny on the fixture seal; seal + unseal of a section on a
// throwaway page) and asserts the feeds report them newest-first with the actor that caused
// them, that the space feed filters server-side, and that both gates refuse the right people:
//   - page feed: Gabriela on a page in the private SVSEC1P space → refused (canReadPage)
//   - space feed: Mihai from the hook → refused (in a webtrigger isOperatorSteward can only read
//     the explicit adminUsers list, and Mihai is a site admin, not a listed steward); the one
//     account ON that list → allowed.
// @covers resolver:get-page-activity resolver:get-space-activity
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
// @ts-ignore - plain ESM JS helpers
import { spaceIdByKey, createPage, deletePage } from "../../data/confluence.mjs";
// @ts-ignore
import { post } from "../../data/jira.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";

const ATT = process.env.SV_ATTACHMENT_ID || "att265945089";
const FIXTURE_PAGE = process.env.SV_PAGE_ID || "265912321";
const SPACE = process.env.SENTINEL_SPACE_KEY || "WFH";
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086"; // owns the fixture seal; site admin
const GABI = "712020:2b9d007d-db0d-47c9-b4ae-953f55501f55";  // real; no access to SVSEC1P; NOT a listed steward
// The one account on admin-settings-space-WFH.adminUsers (a second "Gabriela Perdum" identity).
// In a webtrigger isOperatorSteward can only answer from that explicit list, so this is the
// only actor the hook can present as a WFH steward without mutating the space policy.
const STEWARD = "712020:69d0aa0b-56b2-4bc9-9f0a-45f78fcdf303";
const PRIV_SPACE = "SVSEC1P";
const REQ_KEY = `edit-request-${ATT}-${GABI}`;

const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });

async function ensurePrivateSpace(): Promise<string> {
  const existing = await spaceIdByKey(PRIV_SPACE);
  if (existing) return existing;
  await post("/wiki/rest/api/space/_private", {
    key: PRIV_SPACE, name: "SV-SEC-1 authz probe",
    description: { plain: { value: "Harness-owned. Private on purpose — see authz-content-gate.spec.ts", representation: "plain" } },
  });
  const id = await spaceIdByKey(PRIV_SPACE);
  if (!id) throw new Error(`could not create or find the private probe space ${PRIV_SPACE}`);
  return id;
}

const pageFeed = async (pageId: string, actor: string) => (await inv("getPageActivity", { pageId, actor })).result;
const spaceFeed = async (actor: string, extra: Record<string, string> = {}) => (await inv("getSpaceActivity", { spaceKey: SPACE, actor, ...extra })).result;

test.describe.configure({ timeout: 240_000, retries: 1 });

test.describe("A1 activity record", () => {
  test.beforeAll(async () => {
    const seal = await getKvs(`protection-${ATT}`);
    expect(seal?.lockedBy, `fixture seal protection-${ATT} owned by Mihai (run npm run ensure-fixture)`).toBe(MIHAI);
    expect(new Date(seal.expiresAt).getTime(), "fixture seal is live").toBeGreaterThan(Date.now());
    await delKvs(REQ_KEY).catch(() => {});
  });
  test.afterAll(async () => { await delKvs(REQ_KEY).catch(() => {}); });

  test("events land on the page feed newest-first with the actor that caused them", async () => {
    const t0 = new Date().toISOString();
    const ext = await inv("extendSeal", { att: ATT, actor: MIHAI, seconds: "60" });
    expect(ext.result?.success, `extend (got ${ext.result?.reason})`).toBe(true);
    const req = await inv("requestEditAccess", { att: ATT, actor: GABI, reason: "activity spec" });
    expect(req.result?.success, `request (got ${req.result?.reason})`).toBe(true);
    const den = await inv("denyEditRequest", { att: ATT, requester: GABI, actor: MIHAI });
    expect(den.result?.success, `deny (got ${den.result?.reason})`).toBe(true);

    // kvs.query is eventually consistent — poll until all three new entries are visible.
    let entries: any[] = [];
    for (let i = 0; i < 15; i++) {
      const r = await pageFeed(FIXTURE_PAGE, MIHAI);
      entries = (r?.entries || []).filter((e: any) => e.ts >= t0);
      if (["seal.extended", "editreq.requested", "editreq.denied"].every((t) => entries.some((e) => e.type === t))) break;
      await new Promise((res) => setTimeout(res, 2000));
    }
    const types = entries.map((e) => e.type);
    expect(types, "all three events are on the page feed").toEqual(expect.arrayContaining(["seal.extended", "editreq.requested", "editreq.denied"]));
    // newest first: deny happened last, so it comes before the request, which comes before the extend
    const idx = (t: string) => types.indexOf(t);
    expect(idx("editreq.denied"), "deny (last) is listed first").toBeLessThan(idx("editreq.requested"));
    expect(idx("editreq.requested"), "request is listed before the extend").toBeLessThan(idx("seal.extended"));

    const extended = entries.find((e) => e.type === "seal.extended");
    expect(extended.actor?.accountId, "the extend names its actor (the owner)").toBe(MIHAI);
    expect(extended.target?.id, "…and its target (the attachment)").toBe(ATT);
    expect(extended.pageId, "…on the fixture page").toBe(String(FIXTURE_PAGE));
    expect(extended.spaceKey).toBe(SPACE);
    const requested = entries.find((e) => e.type === "editreq.requested");
    expect(requested.actor?.accountId, "the request names the requester").toBe(GABI);
    const denied = entries.find((e) => e.type === "editreq.denied");
    expect(denied.actor?.accountId, "the deny names the owner who decided").toBe(MIHAI);
    for (const e of entries) {
      expect(e.id, "every entry has an id").toBeTruthy();
      expect(Number.isFinite(Date.parse(e.ts)), "every entry has an ISO timestamp").toBe(true);
    }
    console.log(`### page feed ✓ (${types.slice(0, 3).join(" > ")})`);
  });

  test("section seal + release on a throwaway page; the space feed sees them and filters by type", async () => {
    const spaceId = await spaceIdByKey(SPACE);
    const page = await createPage({ spaceId, title: `HARNESS sv-activity ${Date.now()}`, adf: doc(heading("ACT ALPHA", 2), paragraph("alpha")) });
    let sectionId: string | null = null;
    const t0 = new Date().toISOString();
    try {
      const lh = await inv("listPageHeadings", { pageId: page.id, actor: MIHAI });
      const alpha = (lh.result?.headings || []).find((h: any) => h.text === "ACT ALPHA");
      expect(alpha, "heading found").toBeTruthy();
      const sr = await inv("sealSection", { pageId: page.id, hi: String(alpha.index), htext: "ACT ALPHA", actor: MIHAI });
      expect(sr.result?.success, `seal-section (got ${sr.result?.reason})`).toBe(true);
      sectionId = sr.result?.sectionId;
      const us = await inv("unsealSection", { section: sectionId!, actor: MIHAI });
      expect(us.result?.success, `unseal-section (got ${us.result?.reason})`).toBe(true);

      let entries: any[] = [];
      for (let i = 0; i < 15; i++) {
        entries = ((await pageFeed(page.id, MIHAI))?.entries || []);
        if (entries.some((e) => e.type === "section.sealed") && entries.some((e) => e.type === "section.released")) break;
        await new Promise((res) => setTimeout(res, 2000));
      }
      const types = entries.map((e) => e.type);
      expect(types.indexOf("section.released"), "release (last) is listed before the seal").toBeLessThan(types.indexOf("section.sealed"));
      expect(entries.find((e) => e.type === "section.sealed").target?.kind).toBe("section");

      // Space feed, as a LISTED steward (Gabriela), filtered to section events since t0.
      let sf: any = null;
      for (let i = 0; i < 15; i++) {
        sf = await spaceFeed(STEWARD, { types: "section.sealed,section.released", since: t0 });
        if ((sf?.entries || []).filter((e: any) => String(e.pageId) === String(page.id)).length >= 2) break;
        await new Promise((res) => setTimeout(res, 2000));
      }
      const mine = (sf?.entries || []).filter((e: any) => String(e.pageId) === String(page.id));
      expect(mine.length, "the space feed carries both section events for the throwaway page").toBeGreaterThanOrEqual(2);
      expect(sf.entries.every((e: any) => e.type.startsWith("section.")), "the type filter is applied server-side").toBe(true);
      expect(sf.entries.every((e: any) => e.ts >= t0), "the since filter is applied server-side").toBe(true);
      expect(sf.entries.every((e: any) => e.spaceKey === SPACE), "only this space").toBe(true);
      console.log(`### space feed ✓ (${mine.length} section events for page ${page.id}, all filtered)`);
    } finally {
      if (sectionId) await inv("unsealSection", { section: sectionId, actor: MIHAI }).catch(() => {});
      await deletePage(page.id).catch(() => {});
    }
  });

  test("gates: the page feed refuses a reader without access; the space feed refuses a non-steward", async () => {
    const privSpaceId = await ensurePrivateSpace();
    const privPage = await createPage({ spaceId: privSpaceId, title: `HARNESS sv-activity priv ${Date.now()}`, adf: doc(heading("PRIVATE", 2), paragraph("private body")) });
    try {
      const owner = await pageFeed(privPage.id, MIHAI);
      expect(Array.isArray(owner?.entries), "the entitled caller gets an entries array (empty is fine on a new page)").toBe(true);
      const gabi = await pageFeed(privPage.id, GABI);
      expect(gabi?.entries?.length || 0, "Gabriela cannot read the private page → no entries").toBe(0);
      expect(String(gabi?.reason || ""), "…and the refusal is explicit (reason)").toMatch(/not authorized/i);

      const nonSteward = await spaceFeed(MIHAI);
      expect((nonSteward?.entries || []).length, "a caller not on the space's steward list gets nothing from the space feed").toBe(0);
      expect(String(nonSteward?.reason || ""), "…and the refusal is explicit (reason)").toMatch(/not authorized/i);
      const steward = await spaceFeed(STEWARD, { since: new Date(Date.now() - 60_000).toISOString() });
      expect(steward?.reason, "a listed steward is not refused").toBeUndefined();
      expect(Array.isArray(steward?.entries), "a listed steward reads the space feed").toBe(true);
      console.log("### gates ✓ (page feed: unentitled refused; space feed: non-steward refused, steward allowed)");
    } finally {
      await deletePage(privPage.id).catch(() => {});
    }
  });
});
