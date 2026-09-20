// B1 (ledger #60) — the definition editor's resolvers and label-scoped workflows. A steward
// stores a custom default (a new "QA" state), pages then move through it; an unsound definition
// is refused (two first states, a transition to a ghost state); a state that still holds pages
// cannot be removed; a label-scoped "Fast track" workflow is stored, a page created with its
// label is auto-assigned to it (highest priority wins), and a page on it is judged by ITS
// definition, not the default's; a label workflow with pages on it cannot be deleted.
// Hook-driven; WFH's definition + settings + steward roster captured and restored; pages purged.
// @covers resolver:list-space-workflows resolver:store-space-workflow resolver:delete-space-workflow
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage, purgePage } from "../../data/confluence.mjs";
// @ts-ignore
import { request } from "../../data/jira.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";

const SPACE = process.env.SENTINEL_SPACE_KEY || "WFH";
const SETTINGS_KEY = `workflow-settings-${SPACE}`;
const DEF_KEY = `workflow-def-space-${SPACE}`;
const STEWARD_KEY = `admin-settings-space-${SPACE}`;
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const GABI = "712020:2b9d007d-db0d-47c9-b4ae-953f55501f55";
const PLAIN = "712020:6c8dccca-a6b1-4c6f-903c-329094a1bac1"; // the one real non-admin account (plain-editor bed, 2026-09-20)
const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const queryKvs = async (prefix: string): Promise<string[]> => (await getTestState("sentinel-vault", { what: "query", prefix })).keys || [];
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const store = (params: Record<string, any>) => inv("storeSpaceWorkflow", { spaceKey: SPACE, actor: MIHAI, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])) });

const QA_DEF = { id: "default", name: "Doc with QA", states: [
  { id: "draft", name: "Draft", color: "neutral", initial: true },
  { id: "qa", name: "QA", color: "caution" },
  { id: "approved", name: "Approved", color: "success", enforce: true, reviewAfterDays: 90 },
], transitions: [{ from: "draft", to: "qa" }, { from: "qa", to: "approved" }, { from: "qa", to: "draft" }, { from: "approved", to: "draft" }] };
const FAST_DEF = { id: "fast", name: "Fast track", states: [{ id: "open", name: "Open", color: "info", initial: true }, { id: "done", name: "Done", color: "success", enforce: true }], transitions: [{ from: "open", to: "done" }, { from: "done", to: "open" }] };

test.describe.configure({ timeout: 300_000, retries: 1 });

async function cleanupPage(pageId: string) {
  for (const k of [`workflow-state-${pageId}`, `workflow-pending-${pageId}`, `workflow-autoassigned-${pageId}`]) await delKvs(k).catch(() => {});
  for (const prefix of [`workflow-idx-${SPACE}-`, `workflow-log-${pageId}-`, `activity-page-${pageId}-`]) for (const k of await queryKvs(prefix).catch(() => [] as string[])) if (k.endsWith(`-${pageId}`) || k.includes(`-${pageId}-`)) await delKvs(k).catch(() => {});
  await deletePage(pageId).catch(() => {}); await purgePage(pageId).catch(() => {});
}

test("custom default, refused definitions, protected states, label-scoped workflows", async () => {
  const priorDef = await getKvs(DEF_KEY);
  const priorSettings = await getKvs(SETTINGS_KEY);
  const priorSteward = await getKvs(STEWARD_KEY);
  const spaceId = await spaceIdByKey(SPACE);
  const pages: string[] = [];
  try {
    const users = [...new Set([...(priorSteward?.adminUsers || []).map((u: any) => (typeof u === "string" ? u : u?.accountId)), MIHAI])];
    await setKvs(STEWARD_KEY, { ...(priorSteward || {}), adminUsers: users });
    // autoAssignNew stays OFF while pages are created (the real created-page trigger would
    // assign them before a label could be added) and is switched on right before the seam runs.
    await setKvs(SETTINGS_KEY, { ...(priorSettings || { workflowId: "default" }), enabled: true, autoAssignNew: false, labelWorkflows: [] });

    // A non-steward cannot see or store definitions.
    // Gabriela is a SITE admin (a steward everywhere); the non-steward is PLAIN (plain-editor bed, 2026-09-20).
    expect((await inv("listSpaceWorkflows", { spaceKey: SPACE, actor: PLAIN })).result?.error, "non-steward refused").toBeTruthy();
    expect((await inv("storeSpaceWorkflow", { spaceKey: SPACE, actor: PLAIN, def: JSON.stringify(QA_DEF) })).result?.success, "non-steward cannot store").toBe(false);

    // Unsound definitions are refused with a reason.
    const twoFirst = await store({ def: { ...QA_DEF, states: QA_DEF.states.map((s) => ({ ...s, initial: true })) } });
    expect(twoFirst.result?.success, "two first states refused").toBe(false);
    const ghost = await store({ def: { ...QA_DEF, transitions: [...QA_DEF.transitions, { from: "qa", to: "ghost" }] } });
    expect(ghost.result?.success, "a transition to a ghost state refused").toBe(false);
    expect(String(ghost.result?.reason)).toMatch(/does not exist/);

    // The custom default is stored and read back; pages move through QA.
    const ok = await store({ def: QA_DEF });
    expect(ok.result?.success, `custom default stored (got ${JSON.stringify(ok.result)})`).toBe(true);
    const list = (await inv("listSpaceWorkflows", { spaceKey: SPACE, actor: MIHAI })).result;
    expect(list?.source, "the space now has its own definition").toBe("space");
    expect(list.default.states.map((s: any) => s.id)).toEqual(["draft", "qa", "approved"]);
    const p1 = await createPage({ spaceId, title: `HARNESS sv-defs p1 ${Date.now()}`, adf: doc(heading("P1", 2), paragraph("qa flow")) }); pages.push(p1.id);
    await inv("assignWorkflow", { pageId: p1.id, spaceKey: SPACE, workflowId: "default", actor: MIHAI });
    const bad = await inv("transitionWorkflow", { pageId: p1.id, spaceKey: SPACE, to: "in_review", actor: MIHAI });
    expect(bad.result?.success, "In Review no longer exists in this space").toBe(false);
    const toQa = await inv("transitionWorkflow", { pageId: p1.id, spaceKey: SPACE, to: "qa", actor: MIHAI });
    expect(toQa.result?.success, "Draft → QA works").toBe(true);
    const wf = (await inv("getWorkflow", { pageId: p1.id, spaceKey: SPACE, actor: MIHAI })).result;
    expect(wf?.state?.name, "the read model names the new state").toBe("QA");
    console.log("### custom default ✓ (refusals, stored, QA reachable, In Review gone)");

    // A state with a page in it cannot be removed.
    const dropQa = await store({ def: { ...QA_DEF, states: QA_DEF.states.filter((s) => s.id !== "qa"), transitions: [{ from: "draft", to: "approved" }, { from: "approved", to: "draft" }] } });
    expect(dropQa.result?.success, "removing QA while p1 sits in it is refused").toBe(false);
    expect(String(dropQa.result?.reason)).toMatch(/still has/);
    console.log("### occupied state protected ✓");

    // A label-scoped workflow: stored under its id, listed as an extra, chosen by label.
    const fast = await store({ workflowId: "fast", def: FAST_DEF, labels: "urgent,hotfix", priority: "10" });
    expect(fast.result?.success, `fast track stored (got ${JSON.stringify(fast.result)})`).toBe(true);
    const list2 = (await inv("listSpaceWorkflows", { spaceKey: SPACE, actor: MIHAI })).result;
    expect(list2.extras.map((x: any) => x.workflowId)).toEqual(["fast"]);
    expect(list2.extras[0].labels).toEqual(["urgent", "hotfix"]);
    expect((await getKvs(SETTINGS_KEY))?.labelWorkflows?.[0]?.workflowId, "the settings carry the label map").toBe("fast");

    const p2 = await createPage({ spaceId, title: `HARNESS sv-defs p2 ${Date.now()}`, adf: doc(heading("P2", 2), paragraph("urgent")) }); pages.push(p2.id);
    await request("POST", `/wiki/rest/api/content/${p2.id}/label`, { body: [{ prefix: "global", name: "urgent" }] });
    const p3 = await createPage({ spaceId, title: `HARNESS sv-defs p3 ${Date.now()}`, adf: doc(heading("P3", 2), paragraph("plain")) }); pages.push(p3.id);
    await setKvs(SETTINGS_KEY, { ...(await getKvs(SETTINGS_KEY)), autoAssignNew: true });
    // The real created-page event may land late and run the same path first — either way the
    // RECORD is what matters: the urgent page runs Fast track, the plain page the default.
    const a2 = (await inv("autoAssign", { pageId: p2.id, spaceKey: SPACE, actor: MIHAI })).result;
    const a3 = (await inv("autoAssign", { pageId: p3.id, spaceKey: SPACE, actor: MIHAI })).result;
    console.log(`### auto-assign seam: p2=${JSON.stringify(a2)} p3=${JSON.stringify(a3)}`);
    expect((await getKvs(`workflow-state-${p2.id}`))?.workflowId, "the urgent page runs Fast track").toBe("fast");
    expect((await getKvs(`workflow-state-${p3.id}`))?.workflowId, "the plain page runs the default").toBe("default");
    await setKvs(SETTINGS_KEY, { ...(await getKvs(SETTINGS_KEY)), autoAssignNew: false });
    expect((await getKvs(`workflow-state-${p2.id}`))?.stateId, "p2 starts at Open").toBe("open");
    // p2 is judged by ITS definition: Open → Done is allowed; QA (a default-only state) is not.
    expect((await inv("transitionWorkflow", { pageId: p2.id, spaceKey: SPACE, to: "qa", actor: MIHAI })).result?.success, "QA is not a Fast-track state").toBe(false);
    expect((await inv("transitionWorkflow", { pageId: p2.id, spaceKey: SPACE, to: "done", actor: MIHAI })).result?.success, "Open → Done").toBe(true);
    const wf2 = (await inv("getWorkflow", { pageId: p2.id, spaceKey: SPACE, actor: MIHAI })).result;
    expect(wf2?.def?.id, "the read model carries the page's own workflow").toBe("fast");
    expect(wf2?.record?.enforce, "Done is an enforced state in Fast track").toBe(true);
    const dash = (await inv("dashboard", { spaceKey: SPACE, actor: MIHAI })).result;
    expect(dash?.pages?.find((x: any) => String(x.pageId) === String(p2.id))?.stateName, "the dashboard names Fast track's state").toBe("Done");
    console.log("### label-scoped workflow ✓ (auto-assigned by label, judged by its own definition, dashboard names its state)");

    // Deleting a label workflow with pages on it is refused; after moving the page off, it works.
    const del1 = (await inv("deleteSpaceWorkflow", { spaceKey: SPACE, actor: MIHAI, workflowId: "fast" })).result;
    expect(del1?.success, "delete refused while p2 runs it").toBe(false);
    await cleanupPage(p2.id); pages.splice(pages.indexOf(p2.id), 1);
    await new Promise((r) => setTimeout(r, 3000));
    let del2: any = null;
    for (let i = 0; i < 5 && !del2?.success; i++) { del2 = (await inv("deleteSpaceWorkflow", { spaceKey: SPACE, actor: MIHAI, workflowId: "fast" })).result; if (!del2?.success) await new Promise((r) => setTimeout(r, 2000)); }
    expect(del2?.success, `delete works once no page runs it (got ${JSON.stringify(del2)})`).toBe(true);
    expect((await inv("listSpaceWorkflows", { spaceKey: SPACE, actor: MIHAI })).result?.extras?.length, "…and it is gone from the list").toBe(0);
    console.log("### delete protection ✓");
  } finally {
    for (const id of pages) await cleanupPage(id);
    await delKvs(`workflow-def-space-${SPACE}-fast`).catch(() => {});
    if (priorDef) await setKvs(DEF_KEY, priorDef); else await delKvs(DEF_KEY).catch(() => {});
    if (priorSettings) await setKvs(SETTINGS_KEY, priorSettings); else await delKvs(SETTINGS_KEY).catch(() => {});
    if (priorSteward) await setKvs(STEWARD_KEY, priorSteward); else await delKvs(STEWARD_KEY).catch(() => {});
  }
});
