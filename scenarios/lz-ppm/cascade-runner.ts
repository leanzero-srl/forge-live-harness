// Drives one lz-ppm cascade fixture end-to-end on the LIVE app, deterministically:
//   seed real Jira issues (WFH) → create+index a controlled plan (hook) →
//   applyEdit the trigger (hook, keeps _original so the engine detects intent) →
//   settle with the real backend engine (hook) → return live result vs oracle.
// No fragile Gantt-drag; the oracle is lz-ppm's own frontend engine (parity-locked).
import { createIssue, setDates, linkBlocks, deleteIssue } from "../../data/jira-build.mjs";
// @ts-ignore - JS REST client
import { request, get, searchJql } from "../../data/jira.mjs";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";
// @ts-ignore - JS oracle (esbuild-resolved)
import { FIXTURES, expectedForFixture } from "../../expected/lz-ppm-cascade.ts";

const PROJECT = process.env.LZ_PPM_TEST_PROJECT || "WFH";

export interface CascadeResult {
  oracle: Record<string, any>;
  got: Record<string, any>;
}

export async function runCascadeFixture(name: string): Promise<CascadeResult> {
  const fx = (FIXTURES as any[]).find((f) => f.name === name);
  if (!fx) throw new Error(`no fixture named "${name}"`);
  const oracle = expectedForFixture(fx);
  const fc = (await getTestState("lz-ppm", { what: "fieldConfig" })).fields;
  const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  const keyMap: Record<string, string> = {};
  const created: string[] = [];
  let planId: string | undefined;
  try {
    for (const iss of fx.issues) {
      const isEpic = fx.issues.some((c: any) => c.parentKey === iss.key);
      const j = await createIssue({ projectKey: PROJECT, issueType: isEpic ? "Epic" : "Work package", summary: `HARNESS ${iss.key} ${tag}` });
      keyMap[iss.key] = j.key;
      created.push(j.key);
    }
    for (const iss of fx.issues) {
      await setDates(keyMap[iss.key], { start: iss.startDate, due: iss.dueDate, duration: iss.duration, buffer: undefined }, fc);
    }
    for (const iss of fx.issues) for (const s of iss.successors || []) await linkBlocks(keyMap[iss.key], keyMap[s]);
    for (const iss of fx.issues) {
      if (iss.parentKey) {
        await request("PUT", `/rest/api/3/issue/${keyMap[iss.key]}`, { raw: true, body: { fields: { parent: { key: keyMap[iss.parentKey] } } } });
      }
    }

    const jqlAll = `key in (${Object.values(keyMap).join(",")})`;
    // ZERO-FLAKINESS GATE: Jira's JQL SEARCH index AND links/parents are both
    // eventually-consistent. Poll until (a) the search returns ALL seeded issues
    // (indexing uses this exact JQL — a missing one drops it from the plan), and
    // (b) every Blocks link + parent is visible, so indexing sees the COMPLETE graph.
    await waitForTerminal(async () => {
      const found = await searchJql(jqlAll, ["summary"], 100);
      if (new Set(found.map((i: any) => i.key)).size < Object.values(keyMap).length) return false;
      for (const iss of fx.issues) {
        const want = (iss.successors || []).length + (iss.predecessors || []).length;
        const issue: any = await get(`/rest/api/3/issue/${keyMap[iss.key]}?fields=issuelinks,parent`);
        const links = (issue.fields.issuelinks || []).filter((l: any) => l.type?.name === "Blocks").length;
        if (links < want) return false;
        if (iss.parentKey && !issue.fields.parent) return false;
      }
      return true;
    }, { timeout: 25_000, interval: 1_500, label: "jira graph propagation" });

    const cf = await getTestState("lz-ppm", { what: "createFixture", name: "harness", jql: jqlAll });
    planId = cf.planId;
    // Apply the edit the way the app's frontend does: set the trigger's post-edit
    // fields (a due-only edit recomputes duration). The trigger doesn't cascade-move
    // itself, so its settled oracle value IS its edit-applied value — using it makes
    // the input consistent so the backend `settle` becomes a true fixed-point check
    // of the CASCADE (the dependents/rollups, which the engine actually computes).
    const trig: any = (oracle as any)[fx.edit.key];
    for (const field of ["startDate", "dueDate", "duration"] as const) {
      await getTestState("lz-ppm", { what: "applyEdit", planId: planId!, key: keyMap[fx.edit.key], field, value: String(trig[field]) });
    }
    const settled = await getTestState("lz-ppm", { what: "settle", planId: planId! });

    const jiraToFx = Object.fromEntries(Object.entries(keyMap).map(([f, j]) => [j, f]));
    const got: Record<string, any> = {};
    for (const i of settled.issues || []) {
      const fk = jiraToFx[i.key];
      if (fk) got[fk] = { startDate: i.startDate, dueDate: i.dueDate, duration: Number(i.duration), buffer: i.buffer };
    }
    return { oracle, got };
  } finally {
    if (planId) await getTestState("lz-ppm", { what: "deleteFixture", planId }).catch(() => {});
    for (const k of created) await deleteIssue(k).catch(() => {});
  }
}
