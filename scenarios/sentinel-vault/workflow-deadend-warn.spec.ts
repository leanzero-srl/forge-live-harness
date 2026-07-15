// B14-A (worklist #14, issue #7) — the "silent stuck" workflow. A custom workflow def can be saved with
// a state a page can ENTER but never LEAVE (a transition target with no outgoing edge). A page that lands
// there is stranded — the ribbon shows a disabled state pill with no move and no explanation. storeWorkflow
// Config now WARNS (non-blocking) at save time so the steward knows before pages strand. This spec drives
// the save via a throwaway space key and asserts the warning appears for a dead-end def but not a sound one.
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";

const KEY = "B14PROBE";
const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });

test.describe.configure({ timeout: 60_000, retries: 1 });

test("B14: saving a workflow with a dead-end state warns; a sound one does not", async () => {
  try {
    const stuck = await inv("storeWorkflowConfigProbe", { stuck: "1", key: KEY });
    expect(stuck.result?.success, "the save still succeeds (warning is non-blocking)").toBe(true);
    expect(stuck.result?.warning, "a dead-end state is surfaced in a warning").toBeTruthy();
    expect(stuck.result.warning, "the warning names the stuck state").toMatch(/Approved/);

    const sound = await inv("storeWorkflowConfigProbe", { key: KEY });
    expect(sound.result?.success, "a well-formed def saves").toBe(true);
    expect(sound.result?.warning, "a well-formed def produces NO warning").toBeFalsy();
    console.log("### workflow dead-end save warning: stuck→warns, sound→clean ✓");
  } finally {
    await delKvs(`workflow-def-space-${KEY}`).catch(() => {});
  }
});
