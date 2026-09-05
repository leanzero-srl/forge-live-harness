// B2 (ledger #58) — read confirmations on an Approved page. The space names an audience; each
// reader confirms "I have read version N"; counts are visible to anyone who can read the page,
// names only to a steward; an ack is FOR a version, so a new approved baseline asks again.
// Hook-driven; WFH settings + steward roster captured and restored; throwaway page purged.
// @covers resolver:confirm-read resolver:get-read-status resolver:get-read-report
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage, purgePage } from "../../data/confluence.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";

const SPACE = process.env.SENTINEL_SPACE_KEY || "WFH";
const SETTINGS_KEY = `workflow-settings-${SPACE}`;
const STEWARD_KEY = `admin-settings-space-${SPACE}`;
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const GABI = "712020:2b9d007d-db0d-47c9-b4ae-953f55501f55"; // can read WFH; not a steward
const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const queryKvs = async (prefix: string): Promise<string[]> => (await getTestState("sentinel-vault", { what: "query", prefix })).keys || [];
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });

test.describe.configure({ timeout: 300_000, retries: 1 });

test("audience confirms per version; counts for readers, names for stewards; a new version asks again", async () => {
  const priorSettings = await getKvs(SETTINGS_KEY);
  const priorSteward = await getKvs(STEWARD_KEY);
  const spaceId = await spaceIdByKey(SPACE);
  const p = await createPage({ spaceId, title: `HARNESS sv-read-ack ${Date.now()}`, adf: doc(heading("Read me", 2), paragraph("please confirm")) });
  try {
    const users = [...new Set([...(priorSteward?.adminUsers || []).map((u: any) => (typeof u === "string" ? u : u?.accountId)), MIHAI])];
    await setKvs(STEWARD_KEY, { ...(priorSteward || {}), adminUsers: users });
    await setKvs(SETTINGS_KEY, { ...(priorSettings || { workflowId: "default", autoAssignNew: false }), enabled: true, readConfirmation: { enabled: true, audience: [{ type: "user", id: MIHAI, name: "Mihai Perdum" }, { type: "user", id: GABI, name: "Gabriela Perdum" }] } });

    await inv("assignWorkflow", { pageId: p.id, spaceKey: SPACE, workflowId: "default", actor: MIHAI });
    await inv("transitionWorkflow", { pageId: p.id, spaceKey: SPACE, to: "in_review", actor: MIHAI });
    // Nothing to confirm before Approved.
    const early = (await inv("confirmRead", { pageId: p.id, actor: GABI })).result;
    expect(early?.success, "confirming before Approved is refused").toBe(false);
    const st0 = (await inv("getReadStatus", { pageId: p.id, actor: GABI })).result;
    expect(st0?.required, "not required while In Review").toBe(false);

    await inv("transitionWorkflow", { pageId: p.id, spaceKey: SPACE, to: "approved", toName: "Approved", approvers: MIHAI, approvedVersion: "1", actor: MIHAI });
    const st1 = (await inv("getReadStatus", { pageId: p.id, actor: GABI })).result;
    expect(st1?.required, "required once Approved").toBe(true);
    expect(st1.version, "…for the approved version").toBe(1);
    expect(st1.audienceCount, "two people asked").toBe(2);
    expect(st1.ackedCount, "nobody yet").toBe(0);
    expect(st1.myAck, "Gabriela has not confirmed").toBeNull();

    const c = (await inv("confirmRead", { pageId: p.id, actor: GABI })).result;
    expect(c?.success, `Gabriela confirms (got ${JSON.stringify(c)})`).toBe(true);
    const ack = await getKvs(`read-ack-${p.id}-${GABI}`);
    expect(ack?.version, "the ack names the version").toBe(1);
    const st2 = (await inv("getReadStatus", { pageId: p.id, actor: GABI })).result;
    expect(st2.myAck?.version, "her status shows her ack").toBe(1);
    expect(st2.ackedCount, "1 of 2").toBe(1);

    const rep = (await inv("getReadReport", { pageId: p.id, actor: MIHAI })).result;
    expect(rep?.readers?.length, "the steward report lists both").toBe(2);
    const gabi = rep.readers.find((r: any) => r.accountId === GABI);
    expect(gabi?.confirmed, "Gabriela confirmed").toBe(true);
    expect(gabi?.name, "…by name").toMatch(/Gabriela/);
    expect(rep.readers.find((r: any) => r.accountId === MIHAI)?.confirmed, "Mihai has not").toBe(false);
    const denied = (await inv("getReadReport", { pageId: p.id, actor: GABI })).result;
    expect(denied?.readers?.length ?? 0, "a non-steward gets no names").toBe(0);
    console.log("### read confirmations ✓ (refused before Approved; Gabriela 1 of 2; steward report by name; non-steward refused)");

    // A new approved version: the old ack no longer counts.
    const rec = await getKvs(`workflow-state-${p.id}`);
    await setKvs(`workflow-state-${p.id}`, { ...rec, approvedVersion: 2 });
    const st3 = (await inv("getReadStatus", { pageId: p.id, actor: GABI })).result;
    expect(st3.version, "the required version moved").toBe(2);
    expect(st3.myAck, "her v1 ack no longer counts").toBeNull();
    expect(st3.ackedCount, "0 of 2 again").toBe(0);
    const rep2 = (await inv("getReadReport", { pageId: p.id, actor: MIHAI })).result;
    expect(rep2.readers.find((r: any) => r.accountId === GABI)?.staleVersion, "the report says she read v1, not v2").toBe(1);
    console.log("### a new approved version asks again ✓");

    // Activity row.
    let row: any = null;
    for (let i = 0; i < 8 && !row; i++) { row = ((await inv("getPageActivity", { pageId: p.id, actor: MIHAI })).result?.entries || []).find((e: any) => e.type === "workflow.read-confirmed") || null; if (!row) await new Promise((r) => setTimeout(r, 2000)); }
    expect(row?.details?.version, "the confirmation is on the activity record with its version").toBe(1);
  } finally {
    if (priorSettings) await setKvs(SETTINGS_KEY, priorSettings); else await delKvs(SETTINGS_KEY).catch(() => {});
    if (priorSteward) await setKvs(STEWARD_KEY, priorSteward); else await delKvs(STEWARD_KEY).catch(() => {});
    for (const k of [`workflow-state-${p.id}`, `workflow-pending-${p.id}`, `workflow-autoassigned-${p.id}`, `read-ack-${p.id}-${GABI}`, `read-ack-${p.id}-${MIHAI}`,
      `workflow-idx-${SPACE}-draft-${p.id}`, `workflow-idx-${SPACE}-in_review-${p.id}`, `workflow-idx-${SPACE}-approved-${p.id}`]) await delKvs(k).catch(() => {});
    for (const prefix of [`workflow-log-${p.id}-`, `activity-page-${p.id}-`]) for (const k of await queryKvs(prefix).catch(() => [] as string[])) await delKvs(k).catch(() => {});
    await deletePage(p.id).catch(() => {}); await purgePage(p.id).catch(() => {});
  }
});
