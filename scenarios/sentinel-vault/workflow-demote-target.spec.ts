// A2 (ledger #52) — where a tampered Approved page goes. Comala sends an edited Approved page
// back to Review; ours always went to the first state. Now `workflow-settings.demoteTo` names the
// target (validated at save: a real, non-enforce state reachable from Approved), and both demote
// sites (the page-event path and the hourly sweep) honour it.
// Hook-driven, the workflow-enforce-e2e recipe: WFH's workflow settings are captured and restored
// EXACTLY; pages are throwaway; synthetic approvers (the engine seams never touch content).
// @covers resolver:set-space-workflow-settings resolver:get-space-workflow-settings
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage, setContentProperty } from "../../data/confluence.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";

const SPACE = process.env.SENTINEL_SPACE_KEY || "WFH";
const SETTINGS_KEY = `workflow-settings-${SPACE}`;
const STEWARD_KEY = `admin-settings-space-${SPACE}`;
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const queryKvs = async (prefix: string): Promise<string[]> => (await getTestState("sentinel-vault", { what: "query", prefix })).keys || [];
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });

test.describe.configure({ timeout: 240_000, retries: 1 });

test.describe("A2 demote target", () => {
  let priorSettings: any = null;
  let priorSteward: any = null;
  test.beforeAll(async () => {
    priorSettings = await getKvs(SETTINGS_KEY);
    priorSteward = await getKvs(STEWARD_KEY);
    // The settings resolver is steward-gated; from the hook a steward is whoever is on adminUsers.
    const users = [...new Set([...(priorSteward?.adminUsers || []).map((u: any) => (typeof u === "string" ? u : u?.accountId)), MIHAI])];
    await setKvs(STEWARD_KEY, { ...(priorSteward || {}), adminUsers: users });
  });
  test.afterAll(async () => {
    if (priorSettings) await setKvs(SETTINGS_KEY, priorSettings); else await delKvs(SETTINGS_KEY).catch(() => {});
    if (priorSteward) await setKvs(STEWARD_KEY, priorSteward); else await delKvs(STEWARD_KEY).catch(() => {});
  });

  test("the settings save validates the target: enforce state and unknown state are refused, In Review is accepted", async () => {
    const bad1 = await inv("setSpaceWorkflowSettings", { spaceKey: SPACE, enabled: "1", autoAssignNew: "0", workflowId: "default", demoteTo: "approved", actor: MIHAI });
    expect(bad1.result?.success, "demoting to the enforce state itself is refused").toBe(false);
    expect(String(bad1.result?.reason || ""), "…with a reason").toMatch(/demote|state/i);
    const bad2 = await inv("setSpaceWorkflowSettings", { spaceKey: SPACE, enabled: "1", autoAssignNew: "0", workflowId: "default", demoteTo: "no-such-state", actor: MIHAI });
    expect(bad2.result?.success, "an unknown state is refused").toBe(false);
    const ok = await inv("setSpaceWorkflowSettings", { spaceKey: SPACE, enabled: "1", autoAssignNew: "0", workflowId: "default", demoteTo: "in_review", actor: MIHAI });
    expect(ok.result?.success, `In Review (reachable, not enforce) is accepted (got ${JSON.stringify(ok.result)})`).toBe(true);
    const stored = await getKvs(SETTINGS_KEY);
    expect(stored?.demoteTo, "…and stored").toBe("in_review");
    const read = await inv("getSpaceWorkflowSettings", { spaceKey: SPACE, actor: MIHAI });
    expect(read.result?.demoteTo ?? read.result?.settings?.demoteTo, "…and read back").toBe("in_review");
    console.log("### demoteTo validation ✓ (approved ✗, unknown ✗, in_review ✓)");
  });

  test("an unsanctioned edit on an Approved page lands in In Review, not Draft, and the record says so", async () => {
    await setKvs(SETTINGS_KEY, { enabled: true, autoAssignNew: false, workflowId: "default", enforceMode: "demote", demoteTo: "in_review", approval: { approvers: [{ type: "user", id: "acc-A" }], mode: "any", min: 1 } });
    const spaceId = await spaceIdByKey(SPACE);
    const p = await createPage({ spaceId, title: `HARNESS sv-demote-target ${Date.now()}`, adf: doc(heading("Approved", 2), paragraph("approved body")) });
    try {
      await inv("assignWorkflow", { pageId: p.id, spaceKey: SPACE, workflowId: "default", actor: "acc-A" });
      await inv("transitionWorkflow", { pageId: p.id, spaceKey: SPACE, to: "in_review", actor: "acc-A" });
      const t = await inv("transitionWorkflow", { pageId: p.id, spaceKey: SPACE, to: "approved", toName: "Approved", approvers: "acc-A", approvedVersion: "1", actor: "acc-A" });
      expect(t.result?.success, "page is Approved with acc-A as the only approver").toBe(true);
      await setContentProperty(p.id, "sentinel-vault-workflow", { workflowId: "default", stateId: "approved", enteredAt: new Date().toISOString(), enforce: true, approvedVersion: 1 });

      // A stranger's save → the engine's decision is demote, and the target is the configured one.
      const d = await inv("enforceDecision", { pageId: p.id, actor: "acc-STRANGER", eventVersion: "2" });
      expect(d.result?.action, "the engine demotes a stranger's edit").toBe("demote");
      const rec = await getKvs(`workflow-state-${p.id}`);
      expect(rec?.stateId, "the page went to In Review (the configured target), not Draft").toBe("in_review");
      expect(rec?.enforce, "enforcement cleared").toBe(false);

      // The activity record names the target.
      let row: any = null;
      for (let i = 0; i < 10 && !row; i++) {
        const feed = (await inv("getPageActivity", { pageId: p.id, actor: MIHAI })).result?.entries || [];
        row = feed.find((e: any) => e.type === "workflow.enforced") || null;
        if (!row) await new Promise((r) => setTimeout(r, 2000));
      }
      expect(row, "a workflow.enforced row was recorded").toBeTruthy();
      expect(row.details?.mode).toBe("demote");
      expect(row.details?.demotedTo, "…naming the target state").toBe("in_review");
      console.log("### demote → In Review ✓ (record names demotedTo)");
    } finally {
      for (const k of [`workflow-state-${p.id}`, `workflow-pending-${p.id}`, `workflow-autoassigned-${p.id}`, `workflow-integrity-notified-${p.id}`,
        `workflow-idx-${SPACE}-draft-${p.id}`, `workflow-idx-${SPACE}-in_review-${p.id}`, `workflow-idx-${SPACE}-approved-${p.id}`]) await delKvs(k).catch(() => {});
      for (const prefix of [`workflow-log-${p.id}-`, `activity-page-${p.id}-`]) for (const k of await queryKvs(prefix).catch(() => [] as string[])) await delKvs(k).catch(() => {});
      await deletePage(p.id).catch(() => {});
    }
  });
});
