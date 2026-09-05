// B4 (ledger #57) — the workflow state as a page label. Content-property CQL does not parse on
// Forge, so `sv-state-{id}` is what Content by Label / Page Properties Report / CQL can filter on.
// Proves on real pages: assign → label; transition → the old label is replaced; a pre-existing
// page with no label is backfilled by the hourly sweep once the setting is on; turning the
// setting off makes the sweep remove the labels; foreign labels are never touched.
// Hook-driven; WFH settings captured and restored EXACTLY; throwaway pages purged.
// @covers resolver:set-space-workflow-settings
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage, purgePage, getPageLabels } from "../../data/confluence.mjs";
// @ts-ignore
import { request } from "../../data/jira.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";

const SPACE = process.env.SENTINEL_SPACE_KEY || "WFH";
const SETTINGS_KEY = `workflow-settings-${SPACE}`;
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const queryKvs = async (prefix: string): Promise<string[]> => (await getTestState("sentinel-vault", { what: "query", prefix })).keys || [];
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const stateLabels = (labels: string[]) => labels.filter((l) => l.startsWith("sv-state-"));

test.describe.configure({ timeout: 300_000, retries: 1 });

async function cleanup(pageId: string) {
  for (const k of [`workflow-state-${pageId}`, `workflow-pending-${pageId}`, `workflow-autoassigned-${pageId}`, `workflow-label-${pageId}`,
    `workflow-idx-${SPACE}-draft-${pageId}`, `workflow-idx-${SPACE}-in_review-${pageId}`, `workflow-idx-${SPACE}-approved-${pageId}`]) await delKvs(k).catch(() => {});
  for (const prefix of [`workflow-log-${pageId}-`, `activity-page-${pageId}-`]) for (const k of await queryKvs(prefix).catch(() => [] as string[])) await delKvs(k).catch(() => {});
  await deletePage(pageId).catch(() => {}); await purgePage(pageId).catch(() => {});
}

test("state labels follow the workflow: assign, transition, backfill, removal; foreign labels untouched", async () => {
  const prior = await getKvs(SETTINGS_KEY);
  const spaceId = await spaceIdByKey(SPACE);
  const pA = await createPage({ spaceId, title: `HARNESS sv-label-sync A ${Date.now()}`, adf: doc(heading("A", 2), paragraph("labelled")) });
  const pB = await createPage({ spaceId, title: `HARNESS sv-label-sync B ${Date.now()}`, adf: doc(heading("B", 2), paragraph("backfilled")) });
  try {
    // B is assigned BEFORE the setting is on → no label yet (that is the backfill case).
    await setKvs(SETTINGS_KEY, { ...(prior || { enabled: true, autoAssignNew: false, workflowId: "default" }), enabled: true, syncLabels: false });
    await inv("assignWorkflow", { pageId: pB.id, spaceKey: SPACE, workflowId: "default", actor: MIHAI });
    expect(stateLabels(await getPageLabels(pB.id)), "no state label while the setting is off").toEqual([]);
    // A foreign label on A, to prove we leave it alone.
    await request("POST", `/wiki/rest/api/content/${pA.id}/label`, { body: [{ prefix: "global", name: "harness-keep-me" }] });

    await setKvs(SETTINGS_KEY, { ...(prior || { enabled: true, autoAssignNew: false, workflowId: "default" }), enabled: true, syncLabels: true });
    await inv("assignWorkflow", { pageId: pA.id, spaceKey: SPACE, workflowId: "default", actor: MIHAI });
    let labels = await getPageLabels(pA.id);
    expect(stateLabels(labels), "assign → sv-state-draft").toEqual(["sv-state-draft"]);
    expect(labels, "…and the foreign label is still there").toContain("harness-keep-me");
    expect((await getKvs(`workflow-label-${pA.id}`))?.stateId, "the stamp (its own key, never the record) says draft").toBe("draft");

    const t = await inv("transitionWorkflow", { pageId: pA.id, spaceKey: SPACE, to: "in_review", actor: MIHAI });
    expect(t.result?.success, "moved to In Review").toBe(true);
    labels = await getPageLabels(pA.id);
    expect(stateLabels(labels), "transition → the old label is REPLACED, not added to").toEqual(["sv-state-in-review"]);
    expect(labels).toContain("harness-keep-me");
    console.log("### assign + transition labels ✓");

    // Backfill: B has a record and no label; the sweep gives it one.
    let s1: any = null;
    for (let i = 0; i < 5; i++) { s1 = (await inv("workflowSweep")).result; if (stateLabels(await getPageLabels(pB.id)).length) break; await new Promise((r) => setTimeout(r, 2000)); }
    expect(stateLabels(await getPageLabels(pB.id)), `the sweep backfilled B (last sweep ${JSON.stringify(s1)})`).toEqual(["sv-state-draft"]);
    console.log(`### backfill ✓ (labelsSynced=${s1?.labelsSynced})`);

    // Off: the sweep removes the state labels from stamped rows and leaves the foreign label.
    await setKvs(SETTINGS_KEY, { ...(prior || { enabled: true, autoAssignNew: false, workflowId: "default" }), enabled: true, syncLabels: false });
    let s2: any = null;
    for (let i = 0; i < 5; i++) { s2 = (await inv("workflowSweep")).result; if (!stateLabels(await getPageLabels(pA.id)).length && !stateLabels(await getPageLabels(pB.id)).length) break; await new Promise((r) => setTimeout(r, 2000)); }
    expect(stateLabels(await getPageLabels(pA.id)), "off → A's state label removed").toEqual([]);
    expect(stateLabels(await getPageLabels(pB.id)), "off → B's state label removed").toEqual([]);
    expect(await getPageLabels(pA.id), "…the foreign label survives").toContain("harness-keep-me");
    expect(await getKvs(`workflow-label-${pA.id}`), "…and the stamp is cleared").toBeFalsy();
    console.log("### removal on off ✓");
  } finally {
    if (prior) await setKvs(SETTINGS_KEY, prior); else await delKvs(SETTINGS_KEY).catch(() => {});
    await cleanup(pA.id); await cleanup(pB.id);
  }
});
