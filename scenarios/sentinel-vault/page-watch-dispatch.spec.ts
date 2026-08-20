// #13 (worklist) — the WATCH + bulletin-DISPATCH capsule, an entirely untested notification surface.
// Drives the resolvers via the dev testhook: the watch-request lifecycle (watch→check→unwatch,
// notify-request-* keys), operator-scoped dispatch listing + acknowledge/dismiss (the shared
// recent-notifications events list), and the read-once breach inbox (violation-alert-* keys).
// Hook-driven, synthetic actors. Preserves + restores the shared recent-notifications key (it47).
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";

// SV-SEC-1: these are REAL wolfaenpak accounts, not synthetic ids. The resolvers driven here now
// verify the caller's own entitlement to the target content before the app acts on it, so an
// unresolvable account id is correctly REFUSED — which is the whole point of the fix, and means a
// synthetic actor can no longer stand in for a person on these paths. (The refusal itself is
// covered by authz-content-gate.spec.ts; this spec is about the feature working for real users.)
// watchArtifact and the pageId-filtered recentDispatches both reach the gate, so the ATTACHMENT,
// the PAGE and the watcher are real. OP/OTHER stay synthetic — operator-scoped dispatch listing
// filters on the caller's own accountId and never touches content.
const ATT = process.env.SV_ATTACHMENT_ID || "att265945089"; // the seeded fixture attachment
const ME = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";   // Mihai — real, can read the fixture
// OP is real too: the pageId-filtered recentDispatches call below reaches the entitlement gate.
const OP = "712020:2b9d007d-db0d-47c9-b4ae-953f55501f55"; // Gabriela — real, can read the fixture page
const OTHER = "sv-aql-op-other";
const PAGE = process.env.SV_PAGE_ID || "265912321";          // the fixture page
const inv = (fn: string, params: Record<string, string>) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });

test.describe.configure({ timeout: 120_000, retries: 1 });

test.describe("#13 watch + bulletin dispatch", () => {
  let origNotifs: any;
  test.beforeAll(async () => { origNotifs = await getKvs("recent-notifications"); });
  test.afterAll(async () => {
    if (origNotifs) await setKvs("recent-notifications", origNotifs); else await delKvs("recent-notifications");
    await delKvs(`notify-request-${ATT}-${ME}`);
    await delKvs(`violation-alert-${OP}-v1`);
  });

  test("watch → check → unwatch lifecycle", async () => {
    await delKvs(`notify-request-${ATT}-${ME}`); // retry-safe
    const w = await inv("watchArtifact", { att: ATT, actor: ME });
    expect(w.result?.success, "watch saved").toBe(true);
    expect(await getKvs(`notify-request-${ATT}-${ME}`), "watch-request key written").toBeTruthy();
    const c1 = await inv("checkWatch", { att: ATT, actor: ME });
    expect(c1.result?.requested, "check reports watching").toBe(true);
    const u = await inv("unwatchArtifact", { att: ATT, actor: ME });
    expect(u.result?.success, "unwatch ok").toBe(true);
    const c2 = await inv("checkWatch", { att: ATT, actor: ME });
    expect(c2.result?.requested, "check reports NOT watching after unwatch").toBe(false);
    expect(await getKvs(`notify-request-${ATT}-${ME}`), "watch-request key deleted").toBeFalsy();
    console.log("### watch lifecycle ✓ (watch → check:true → unwatch → check:false)");
  });

  test("operator dispatch: scoped to the operator + acknowledge dismisses it", async () => {
    const evMine = { id: `ev-mine-${Date.now()}`, pageId: PAGE, type: "seal_conflict", ownerAccountId: OP, editorAccountId: OTHER };
    const evOther = { id: `ev-other-${Date.now()}`, pageId: "some-other-page", type: "seal_expired", ownerAccountId: OTHER, editorAccountId: OTHER };
    await setKvs("recent-notifications", { events: [evMine, evOther] }); // recent-notifications is a single strong-consistent key
    // operatorDispatches returns only events where the operator is owner or editor
    const d = await inv("operatorDispatches", { actor: OP });
    const ids = (d.result?.notifications || []).map((n: any) => n.id);
    expect(ids.includes(evMine.id), "the operator sees their own dispatch").toBe(true);
    expect(ids.includes(evOther.id), "the operator does NOT see another operator's dispatch").toBe(false);
    // recentDispatches filters by page
    const rp = await inv("recentDispatches", { pageId: PAGE, actor: OP });
    const rpIds = (rp.result?.notifications || []).map((n: any) => n.id);
    expect(rpIds.includes(evMine.id) && !rpIds.includes(evOther.id), "recentDispatches filters by pageId").toBe(true);
    // acknowledge (dismiss) evMine → removed from the shared list, evOther preserved
    const ack = await inv("acknowledgeDispatch", { nid: evMine.id, actor: OP });
    expect(ack.result?.success, "acknowledge ok").toBe(true);
    const after = await getKvs("recent-notifications");
    expect((after?.events || []).some((e: any) => e.id === evMine.id), "the dismissed event is removed").toBe(false);
    expect((after?.events || []).some((e: any) => e.id === evOther.id), "the other operator's event is preserved").toBe(true);
    console.log("### operator dispatch ✓ (operator-scoped, page filter, acknowledge dismiss)");
  });

  test("breach inbox is READ-ONCE (listBreachDispatches returns then deletes)", async () => {
    await setKvs(`violation-alert-${OP}-v1`, { id: "v1", type: "breach", attachmentId: ATT, at: Date.now() });
    // listBreachDispatches reads via an eventually-consistent kvs.query → poll until the seeded
    // alert is visible (that same read also deletes it — read-once).
    let got = false;
    for (let i = 0; i < 10 && !got; i++) {
      const first = await inv("listBreachDispatches", { actor: OP });
      got = (first.result || []).some((a: any) => a.id === "v1");
      if (!got) await new Promise((r) => setTimeout(r, 1500));
    }
    expect(got, "the breach alert is returned by listBreachDispatches").toBe(true);
    // read-once proof via the DURABLE per-key delete (strong consistency), not the lagging query
    expect(await getKvs(`violation-alert-${OP}-v1`), "the alert key is deleted after being read (read-once inbox)").toBeFalsy();
    console.log("### breach inbox ✓ (read-once: returned then durably deleted)");
  });
});
