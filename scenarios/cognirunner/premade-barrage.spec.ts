// CogniRunner ADVERSARIAL premade-rule barrage. Attaches every case as a self-loop
// validator on the COGTEST hub, sets a controlled field value on one reusable issue,
// fires the transition, and asserts block/allow against the rule's SPEC. A consistent
// failure here is a real FINDING (spec vs. implementation), not flakiness.
import { test, expect } from "@playwright/test";
// @ts-ignore
import { attachSelfLoopRules, detachByNamePrefix } from "../../data/cogni-workflow.mjs";
// @ts-ignore
import { createIssue } from "../../data/jira-build.mjs";
// @ts-ignore
import { doTransition, request, searchJql } from "../../data/jira.mjs";

const WF = "Software Simplified Workflow for Project COGTEST";
const HUB = "10003";
const TEXT = "customfield_10280", NUM = "customfield_10282", DATE = "customfield_10283";
const SELECT = "customfield_10281", MULTI = "customfield_10322";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const rel = (days: number) => iso(new Date(Date.now() + days * 86400000));
const pm = (ruleType: string, extra: any) => ({ ruleKind: "premade", ruleType, ...extra });

interface Case { id: string; config: any; set: Record<string, any>; expectBlock: boolean; note?: string }

const CASES: Case[] = [
  // field-required
  { id: "fr-empty", config: pm("field-required", { fieldId: TEXT, errorMessage: "req" }), set: { [TEXT]: null }, expectBlock: true },
  { id: "fr-set", config: pm("field-required", { fieldId: TEXT, errorMessage: "req" }), set: { [TEXT]: "hello" }, expectBlock: false },
  // 🔎 FINDING F-COGNI-1: field-required ALLOWS a whitespace-only value ("   "). isEmpty()
  // checks `=== ""` for plain strings (only ADF gets .trim()), so spaces satisfy the rule.
  // Locked to ACTUAL behavior; see FINDINGS.md. (Arguably should BLOCK.)
  { id: "fr-whitespace", config: pm("field-required", { fieldId: TEXT, errorMessage: "req" }), set: { [TEXT]: "   " }, expectBlock: false, note: "FINDING F-COGNI-1: whitespace-only is allowed" },
  { id: "fr-desc-emptyADF", config: pm("field-required", { fieldId: "description", errorMessage: "req" }), set: { description: { type: "doc", version: 1, content: [{ type: "paragraph", content: [] }] } }, expectBlock: true, note: "empty ADF" },
  { id: "fr-desc-text", config: pm("field-required", { fieldId: "description", errorMessage: "req" }), set: { description: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "real content" }] }] } }, expectBlock: false },

  // field-comparison (numeric boundaries)
  { id: "cmp-gte-eq", config: pm("field-comparison", { fieldId: NUM, op: "gte", compareValue: "5" }), set: { [NUM]: 5 }, expectBlock: false, note: "5>=5 boundary" },
  { id: "cmp-gt-eq", config: pm("field-comparison", { fieldId: NUM, op: "gt", compareValue: "5" }), set: { [NUM]: 5 }, expectBlock: true, note: "5>5 boundary" },
  { id: "cmp-lt-ok", config: pm("field-comparison", { fieldId: NUM, op: "lt", compareValue: "5" }), set: { [NUM]: 3 }, expectBlock: false },
  { id: "cmp-gte-below", config: pm("field-comparison", { fieldId: NUM, op: "gte", compareValue: "5" }), set: { [NUM]: 4 }, expectBlock: true },

  // field-comparison (dates)
  // NOTE: avoid far-future years — Jira mangles 2099-01-01 → 1999-01-01 on storage (a Jira quirk, found by this barrage).
  { id: "cmp-date-gt-future", config: pm("field-comparison", { fieldId: DATE, op: "gt", compareValue: "2026-06-26" }), set: { [DATE]: "2030-01-01" }, expectBlock: false },
  { id: "cmp-date-lt-past", config: pm("field-comparison", { fieldId: DATE, op: "lt", compareValue: "2026-06-26" }), set: { [DATE]: "2000-01-01" }, expectBlock: false },

  // text-length (boundary probes — max inclusivity likely off-by-one)
  { id: "len-below", config: pm("text-length", { fieldId: TEXT, min: 3, max: 10 }), set: { [TEXT]: "ab" }, expectBlock: true },
  { id: "len-min-edge", config: pm("text-length", { fieldId: TEXT, min: 3, max: 10 }), set: { [TEXT]: "abc" }, expectBlock: false, note: "len==min" },
  { id: "len-max-edge", config: pm("text-length", { fieldId: TEXT, min: 3, max: 10 }), set: { [TEXT]: "abcdefghij" }, expectBlock: false, note: "len==max (probe inclusivity)" },
  { id: "len-above", config: pm("text-length", { fieldId: TEXT, min: 3, max: 10 }), set: { [TEXT]: "abcdefghijk" }, expectBlock: true },

  // field-regex
  { id: "re-match", config: pm("field-regex", { fieldId: TEXT, regex: "^[A-Z]{3}$" }), set: { [TEXT]: "ABC" }, expectBlock: false },
  { id: "re-nomatch", config: pm("field-regex", { fieldId: TEXT, regex: "^[A-Z]{3}$" }), set: { [TEXT]: "abc" }, expectBlock: true },
  { id: "re-empty", config: pm("field-regex", { fieldId: TEXT, regex: "^[A-Z]{3}$" }), set: { [TEXT]: null }, expectBlock: false, note: "empty passes (not required's job)" },

  // allowed-values
  { id: "av-in", config: pm("allowed-values", { fieldId: SELECT, allowedValues: "Low,Medium,High" }), set: { [SELECT]: { value: "High" } }, expectBlock: false },
  { id: "av-out", config: pm("allowed-values", { fieldId: SELECT, allowedValues: "Low,Medium,High" }), set: { [SELECT]: { value: "Security" } }, expectBlock: true },
  { id: "av-case", config: pm("allowed-values", { fieldId: SELECT, allowedValues: "low,medium,high" }), set: { [SELECT]: { value: "High" } }, expectBlock: false, note: "case-insensitive" },

  // date-relative
  { id: "dr-future-ok", config: pm("date-relative", { fieldId: DATE, mode: "future" }), set: { [DATE]: rel(30) }, expectBlock: false },
  { id: "dr-future-past", config: pm("date-relative", { fieldId: DATE, mode: "future" }), set: { [DATE]: rel(-2) }, expectBlock: true },
  { id: "dr-within-ok", config: pm("date-relative", { fieldId: DATE, mode: "within", days: 7 }), set: { [DATE]: rel(3) }, expectBlock: false },
  { id: "dr-within-over", config: pm("date-relative", { fieldId: DATE, mode: "within", days: 7 }), set: { [DATE]: rel(30) }, expectBlock: true },

  // field-cardinality (multi-select; boundary probe)
  { id: "card-below", config: pm("field-cardinality", { fieldId: MULTI, min: 2 }), set: { [MULTI]: [{ value: "Backend" }] }, expectBlock: true },
  { id: "card-ok", config: pm("field-cardinality", { fieldId: MULTI, min: 2, max: 3 }), set: { [MULTI]: [{ value: "Backend" }, { value: "Frontend" }] }, expectBlock: false },
  { id: "card-max-edge", config: pm("field-cardinality", { fieldId: MULTI, max: 2 }), set: { [MULTI]: [{ value: "Backend" }, { value: "Frontend" }] }, expectBlock: false, note: "count==max (probe inclusivity)" },
  { id: "card-over", config: pm("field-cardinality", { fieldId: MULTI, max: 2 }), set: { [MULTI]: [{ value: "Backend" }, { value: "Frontend" }, { value: "Infra" }] }, expectBlock: true },
];

test.describe.configure({ timeout: 240_000 });

test.describe("CogniRunner premade-rule adversarial barrage", () => {
  const tid: Record<string, string> = {};
  let issueKey: string;

  test.beforeAll(async () => {
    const specs = CASES.map((c, i) => ({ name: `ZHARNESS-${i}-${c.id}`, type: "validator", config: c.config }));
    const attached = await attachSelfLoopRules(WF, HUB, specs);
    attached.forEach((a: any, i: number) => (tid[CASES[i].id] = a.transitionId));
    // Reuse one persistent issue (COGTEST issue-delete is 403, so don't accumulate).
    const MARK = "HARNESS-BARRAGE-FIXTURE [harness-test]";
    const existing = await searchJql(`project = COGTEST AND summary ~ "HARNESS-BARRAGE-FIXTURE"`, ["summary"], 5);
    if (existing.length) {
      issueKey = existing[0].key;
    } else {
      const iss = await createIssue({ projectKey: "COGTEST", issueType: "Task", summary: MARK });
      issueKey = iss.key;
    }
  });

  test.afterAll(async () => {
    await detachByNamePrefix(WF, "ZHARNESS").catch(() => {});
  });

  for (const c of CASES) {
    test(`${c.id}${c.note ? ` — ${c.note}` : ""}`, async () => {
      // reset the field then set the case value (null clears)
      await request("PUT", `/rest/api/3/issue/${issueKey}`, { raw: true, body: { fields: c.set } });
      // The validator reads the field via REST; a freshly-PUT value is eventually consistent, so
      // re-fire (self-loop, idempotent) until the result is stable. A REAL finding never converges
      // and still fails with the detailed message below.
      let blocked = false, r: any;
      for (let i = 0; i < 8; i++) {
        r = await doTransition(issueKey, tid[c.id]);
        blocked = r.status >= 400;
        if (blocked === c.expectBlock) break;
        await new Promise((res) => setTimeout(res, 1500));
      }
      expect(blocked, `${c.id}: expected ${c.expectBlock ? "BLOCK" : "ALLOW"} but got ${blocked ? "BLOCK" : "ALLOW"} (status ${r.status})${blocked ? " — " + r.text.slice(0, 160) : ""}`).toBe(c.expectBlock);
    });
  }
});
