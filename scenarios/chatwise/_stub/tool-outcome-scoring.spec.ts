// FIXTURE: what the asUser table calls a success, a failure and a CRASH.
//
// No browser, no tenant, no model — this runs against real `[Tools]` lines
// captured from live runs on 13.5.0, 13.6.0 and 13.7.0. It exists because the
// scorer is the thing that decides what the eight-row table SAYS, and the table
// is what gets reported as "asUser survives" or "it does not".
//
// ⚠️ IT HAS BEEN WRONG TWICE, IN BOTH DIRECTIONS, AND EACH TIME THE TABLE LIED:
//
//   TOO STRICT (13.5.0). `getWorkflowScheme` asks for an OPTIONAL draft and
//   prints `… draft failed: 404` one line above its own successful outcome;
//   `getFieldContexts` prints `… options failed: 400` for a numeric field. A
//   `.*failed:` match scored both as dead reads — in the direction of "asUser
//   does not survive", the exact conclusion the spec exists to establish.
//
//   TOO LENIENT (13.7.0). `getAuditRecords` threw before any request left the
//   app. That line carries no HTTP status and no " failed:", so the scorer
//   found no failure, found no outcome, fell through to "it was called at all"
//   and recorded **200** for a tool that has never once answered.
//
// So the three states are pinned here, with the lines that produced them.
import { test, expect } from "@playwright/test";
import { scoreToolOutcome } from "../chatwise-support";

/** Real lines. Nothing here is invented; each is quoted from a run log. */
const LINES = {
  crash: [
    '[Tools] getAuditRecords {limit:15} (user: 712020:937bc860-eec2-4294-a65d-8e0fe7c45086)',
    "[Tools] Error in getAuditRecords(recent): Error: You must create your route using the 'route' export from '@forge/api'.",
  ],
  httpFailure: [
    '[Tools] getAuditRecords {limit:10} (user: 712020:937bc860-eec2-4294-a65d-8e0fe7c45086)',
    '[Tools] getAuditRecords(recent) failed: 400 {"errorMessages":["Invalid date format for \'\'. Update the format to \'yyyy-MM-dd\'T\'HH:mm:ss.SSS\'Z\'\'"],"errors":{}}',
  ],
  okWithSubFailure: [
    '[Tools] getWorkflowScheme {projectKey:"WFH"} (user: 712020:937bc860-eec2-4294-a65d-8e0fe7c45086)',
    '[Tools] getWorkflowScheme(WFH) draft failed: 404 {"errorMessages":["The workflow scheme does not have a draft."],"errors":{}}',
    '[Tools] getWorkflowScheme(WFH): 1 issue-type mapping(s), draft=false',
  ],
  ok: [
    '[Tools] listGroupsAndMembers {groupName:"site-admins"} (user: 712020:937bc860-eec2-4294-a65d-8e0fe7c45086)',
    '[Tools] listGroupsAndMembers(site-admins): 1 group(s), 3 member(s)',
  ],
  withheldOnly: [
    '[Tools] getScreenConfiguration {} (user: 712020:937bc860-eec2-4294-a65d-8e0fe7c45086)',
    '[Tools] getScreenConfiguration is withheld this turn — not executed',
  ],
  silence: [] as string[],
};

test("a tool that THREW scores as a crash and never as 200", () => {
  const r = scoreToolOutcome("getAuditRecords", LINES.crash);
  expect(
    r.status,
    `an exception scored as "${r.status}". \`[Tools] Error in <tool>\` carries no status and no ` +
      `" failed:", which is exactly why a scorer without a crash state records it as a success.`,
  ).toBe("crash");
  expect(r.status, "a crash must never be reported as 200").not.toBe("200");
  expect(r.evidence, "the crash line is not the evidence quoted").toContain("Error in getAuditRecords");
});

test("an HTTP failure keeps its status, and a sub-request failure does not become one", () => {
  expect(scoreToolOutcome("getAuditRecords", LINES.httpFailure).status).toBe("400");

  const ok = scoreToolOutcome("getWorkflowScheme", LINES.okWithSubFailure);
  expect(
    ok.status,
    `an OPTIONAL sub-request's 404 became the tool's status. The handler absorbed it and printed ` +
      `its own successful outcome one line later, which the model then reported correctly.`,
  ).toBe("200");
  expect(ok.subRequestFailures, "the absorbed sub-request failure is not counted").toBe(1);
  expect(ok.evidence, "the evidence should be the OUTCOME line, not the sub-request's failure")
    .toContain("1 issue-type mapping(s)");
});

test("a plain success, a withheld tool and silence are three different answers", () => {
  const ok = scoreToolOutcome("listGroupsAndMembers", LINES.ok);
  expect(ok.status).toBe("200");
  expect(ok.called).toBe(true);
  expect(ok.subRequestFailures).toBe(0);

  // WITHHELD IS NOT CALLED. `executor.js` prints the refusal on the same
  // `[Tools] <name>` prefix, so a prefix match counts a closed gate as a call —
  // the opposite of what a closed-gate assertion is asking.
  // REACHED FOR AND STOPPED IS ITS OWN ANSWER. `executor.js` logs the
  // invocation and THEN the refusal, so a closed gate leaves BOTH lines — and
  // the first of them looks exactly like a call. "The model tried and the gate
  // stopped it", "the model never tried" and "it ran" are three different
  // facts and a closed-gate assertion turns on telling them apart.
  const w = scoreToolOutcome("getScreenConfiguration", LINES.withheldOnly);
  expect(w.called, "a withheld tool was counted as having run").toBe(false);
  expect(w.status, "a withheld tool is not a 200 and is not silence").toBe("withheld");
  expect(w.status).not.toBe("not-called");

  expect(scoreToolOutcome("getAuditRecords", LINES.silence).status).toBe("not-called");
});

/**
 * THE PERMANENT GUARD. Not "does the scorer work on these six fixtures" but
 * "can the scorer still express a crash at all" — the state that did not exist
 * is the state that cost a P0 its red run.
 */
test("the scorer can express a crash, distinctly from every other state", () => {
  const states = new Set(
    Object.entries(LINES).map(([, lines]) => scoreToolOutcome("getAuditRecords", lines).status),
  );
  expect(
    states.has("crash"),
    `no input in this fixture produces a "crash" status any more. If the crash state was removed ` +
      `or renamed, an exception before the request leaves the app becomes indistinguishable from ` +
      `a successful read — which is how 13.7.0's dead audit-log tool was reported as 200.`,
  ).toBe(true);
  // And it is its OWN state, not an alias for a failure or a success.
  expect(scoreToolOutcome("getAuditRecords", LINES.crash).status).not.toBe(
    scoreToolOutcome("getAuditRecords", LINES.httpFailure).status,
  );
  expect(scoreToolOutcome("getAuditRecords", LINES.crash).status).not.toBe(
    scoreToolOutcome("listGroupsAndMembers", LINES.ok).status,
  );
});
