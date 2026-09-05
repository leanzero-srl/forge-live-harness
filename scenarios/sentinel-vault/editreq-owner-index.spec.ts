// K1 index discipline for edit requests (2026-09-05). "Edit requests waiting on me" used to be a
// site-wide scan of every edit-request-* record filtered client-side — the shape that blinded
// the approvals inbox once orphans accumulated. Now: editreq-owner-{owner}-{att}-{requester} is
// written with the request, dropped on approve/deny/withdraw/teardown, confirmed by a strong get
// at read (a stale row heals itself), and backfilled hourly by the expiry sweep.
// Hook-driven on the fixture seal Mihai owns; Gabriela asks; everything restored.
// @covers resolver:list-my-edit-requests resolver:deny-edit-request
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";

const ATT = process.env.SV_ATTACHMENT_ID || "att265945089";
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const GABI = "712020:2b9d007d-db0d-47c9-b4ae-953f55501f55";
const GHOST = "sv-aql-ghost-requester"; // synthetic: only the KVS record + index are touched
const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const idx = (req: string) => `editreq-owner-${MIHAI}-${ATT}-${req}`;
const mine = async () => ((await inv("listMyEditRequests", { actor: MIHAI })).result?.requests || []) as any[];

test.describe.configure({ timeout: 180_000, retries: 1 });

async function cleanup() {
  for (const k of [`edit-request-${ATT}-${GABI}`, `edit-grant-${ATT}-${GABI}`, idx(GABI), `edit-request-${ATT}-${GHOST}`, idx(GHOST)]) await delKvs(k).catch(() => {});
}

test("the owner index is written with the request, read by the owner, dropped on deny; a stale row heals; the sweep backfills", async () => {
  const seal = await getKvs(`protection-${ATT}`);
  expect(seal?.lockedBy, `fixture seal protection-${ATT} owned by Mihai (run npm run ensure-fixture)`).toBe(MIHAI);
  await cleanup();
  try {
    // Written with the request.
    const r = await inv("requestEditAccess", { att: ATT, reason: "index proof", actor: GABI });
    expect(r.result?.success, `Gabriela's request lands (got ${JSON.stringify(r.result)})`).toBe(true);
    const row = await getKvs(idx(GABI));
    expect(row?.requesterAccountId, "the owner index row exists, keyed by Mihai").toBe(GABI);
    let list = await mine();
    expect(list.some((x) => x.requesterAccountId === GABI), "Mihai's list shows the request (read from HIS prefix)").toBe(true);
    const other = ((await inv("listMyEditRequests", { actor: GABI })).result?.requests || []) as any[];
    expect(other.some((x) => x.artifactId === ATT), "…and Gabriela's own list does not").toBe(false);

    // Dropped on deny.
    const d = await inv("denyEditRequest", { att: ATT, requester: GABI, actor: MIHAI });
    expect(d.result?.success, "Mihai denies").toBe(true);
    expect(await getKvs(idx(GABI)), "the index row is gone with the denial").toBeFalsy();
    list = await mine();
    expect(list.some((x) => x.requesterAccountId === GABI), "…and the list no longer shows it").toBe(false);

    // A stale index row (record missing) heals on read.
    await setKvs(idx(GHOST), { artifactId: ATT, requesterAccountId: GHOST, requestedAt: new Date().toISOString() });
    list = await mine();
    expect(list.some((x) => x.requesterAccountId === GHOST), "a row with no record is not listed").toBe(false);
    for (let i = 0; i < 5 && (await getKvs(idx(GHOST))); i++) await new Promise((res) => setTimeout(res, 1000));
    expect(await getKvs(idx(GHOST)), "…and the read dropped it").toBeFalsy();

    // Backfill: a pending record with no index row (pre-upgrade shape) gets one from the sweep.
    await setKvs(`edit-request-${ATT}-${GHOST}`, { artifactId: ATT, requesterAccountId: GHOST, requesterName: "Ghost", ownerAccountId: MIHAI, contentId: seal.contentId || null, spaceKey: seal.spaceKey || null, attachmentName: seal.attachmentName || "file", reason: "pre-index request", status: "pending", requestedAt: new Date().toISOString() });
    await new Promise((res) => setTimeout(res, 3000)); // the record must be visible to the sweep's query
    let sweep: any = null;
    for (let i = 0; i < 4 && !(await getKvs(idx(GHOST))); i++) { sweep = (await inv("expirySweep")).result; await new Promise((res) => setTimeout(res, 2000)); }
    expect(await getKvs(idx(GHOST)), `the sweep backfilled the index row (last sweep ${JSON.stringify(sweep)})`).toBeTruthy();
    list = await mine();
    expect(list.some((x) => x.requesterAccountId === GHOST), "…and the request now reaches the owner's list").toBe(true);
    console.log("### editreq owner index ✓ (written, owner-scoped, dropped on deny, stale row healed, backfilled)");
  } finally {
    await cleanup();
  }
});
