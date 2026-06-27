// Sentinel Vault DEEP — validation rule-EVAL edge cases (adversarial). Each sets one
// global rule (advisory, block severity), creates a page in a probe ADF state, and
// polls the trigger's terminal outcome: lastgood set (compliant) vs a comment posted
// (violation). A consistent wrong outcome is a real finding.
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";
// @ts-ignore
import { spaceIdByKey, createPage, getComments, deletePage } from "../../data/confluence.mjs";
// @ts-ignore
import { paragraph, heading, simpleTable, buildBodiedExtensionNode, buildExtensionNode } from "../../data/adf.mjs";

const SENTINEL_APP = "ari:cloud:ecosystem::app/c30bf71e-4287-4872-954d-db49cc68f0ff";
const SENTINEL_ENV = process.env.SENTINEL_ENV_ID || "17516615-12ef-4790-8ce2-29151b7ee9ac";
// The app's OWN sealed-section macro (extensionKey ends in "…sentinel-vault-sealed-section").
const sealedSection = () => buildBodiedExtensionNode(SENTINEL_APP, SENTINEL_ENV, "sentinel-vault-sealed-section", { params: { sectionId: "harness-noseal" }, content: [paragraph("body")] as any });
const extNode = () => buildExtensionNode(SENTINEL_APP, SENTINEL_ENV, "sentinel-vault-panel", {});

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const CFG_KEY = "validation-config-global";
const setConfig = (cfg: any) => getTestState("sentinel-vault", { what: "set", key: CFG_KEY, value: JSON.stringify(cfg) });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const doc = (...nodes: any[]) => ({ version: 1, type: "doc", content: nodes });
const expand = (...kids: any[]) => ({ type: "expand", attrs: { title: "details" }, content: kids });
const ruleCfg = (type: string, config: any) => ({ enabled: true, modes: { advisory: true, gate: false, revert: false }, rules: [{ id: `e-${type}`, type, label: type, severity: "block", enabled: true, config }], ai: { enabled: false } });

interface Case { id: string; cfg: any; adf: any; expect: "compliant" | "violation"; note?: string }
const CASES: Case[] = [
  { id: "table-toplevel", cfg: ruleCfg("required-table", { minCount: 1 }), adf: doc(paragraph("r"), simpleTable()), expect: "compliant", note: "control: top-level table" },
  { id: "table-in-expand", cfg: ruleCfg("required-table", { minCount: 1 }), adf: doc(paragraph("r"), expand(simpleTable())), expect: "compliant", note: "PROBE: table nested in an expand (countNodes should recurse)" },
  { id: "no-table", cfg: ruleCfg("required-table", { minCount: 1 }), adf: doc(paragraph("just text, no table")), expect: "violation" },
  { id: "heading-ok", cfg: ruleCfg("heading-hierarchy", {}), adf: doc(heading("A", 1), heading("B", 2)), expect: "compliant", note: "control: H1→H2" },
  { id: "heading-skip", cfg: ruleCfg("heading-hierarchy", {}), adf: doc(heading("A", 1), heading("C", 3)), expect: "violation", note: "PROBE: H1→H3 skip should be flagged" },
  // 🔎 CONFIRMS SV-m5 (code audit): collectHeadings recurses into table cells with no type gate,
  // so an in-cell H4 is folded into the page outline → a VALID top-level outline (H1→H2) is falsely
  // flagged "skip from H2 to H4". Asserting the BUGGY outcome (violation) to lock the live repro.
  { id: "heading-in-cell-SV-m5", cfg: ruleCfg("heading-hierarchy", {}),
    adf: doc(heading("Top", 1), heading("Sub", 2),
      { type: "table", attrs: { isNumberColumnEnabled: false, layout: "default" },
        content: [{ type: "tableRow", content: [{ type: "tableCell", attrs: {}, content: [heading("In-cell label", 4)] }] }] }),
    expect: "compliant", note: "✅ SV-m5 (fixed): the in-cell H4 is not folded into the page outline, so the valid H1→H2 page passes" },
  // 🔎 CONFIRMS SV-m4 (code audit): required-macro uses unanchored endsWith(), so the app's OWN
  // sealed-section macro (key ends in "…sealed-section") satisfies a required-macro:"section" rule.
  // The page has NO intended macro yet is reported COMPLIANT.
  { id: "reqmacro-endswith-SV-m4", cfg: ruleCfg("required-macro", { extensionKey: "section", minCount: 1 }),
    adf: doc(paragraph("no intended macro on this page"), sealedSection()),
    expect: "violation", note: "✅ SV-m4 (fixed): anchored match — the sealed-section macro no longer satisfies required-macro 'section'" },
  // 🔎 CONFIRMS SV-M4 (code audit): min-length counts ~19-char "[embedded object]" placeholders for
  // extension/media nodes, so a prose-free macro-only page passes a 100-char minimum.
  { id: "minlength-placeholder-SV-M4", cfg: ruleCfg("min-length", { minChars: 100 }),
    adf: doc(extNode(), extNode(), extNode(), extNode(), extNode(), extNode(), extNode(), extNode()),
    expect: "violation", note: "✅ SV-M4 (fixed): macro placeholders no longer count toward min-length, so a prose-free page now fails" },
  // --- adversarial edge probes (round 2) ---
  // PROBE: 40 emoji = 40 code POINTS but 80 UTF-16 code UNITS. A user-facing char limit should
  // count what users see (40 ≤ 60 → compliant). If the engine uses String.length (80 > 60) it
  // over-counts and falsely flags — the same class as CogniRunner's code-point bug.
  { id: "maxlen-emoji-codepoints", cfg: ruleCfg("max-length", { maxChars: 60 }),
    adf: doc(paragraph("😀".repeat(40))), expect: "compliant",
    note: "✅ SV-NEW-1 (FOUND+FIXED): 40 emoji = 40 code points (not 80 UTF-16 units) under a 60-char max now passes" },
  // PROBE: exactly AT the limit must be allowed (off-by-one): 100 chars, max 100 → compliant.
  { id: "maxlen-boundary-exact", cfg: ruleCfg("max-length", { maxChars: 100 }),
    adf: doc(paragraph("a".repeat(100))), expect: "compliant", note: "PROBE: length == maxChars is allowed" },
  // PROBE: one over the limit must be flagged: 101 chars, max 100 → violation.
  { id: "maxlen-over-by-one", cfg: ruleCfg("max-length", { maxChars: 100 }),
    adf: doc(paragraph("a".repeat(101))), expect: "violation", note: "PROBE: maxChars+1 is flagged" },
  // PROBE: an empty doc must FAIL required-heading (no heading present).
  { id: "reqheading-empty-doc", cfg: ruleCfg("required-heading", { minCount: 1 }),
    adf: doc(paragraph("")), expect: "violation", note: "PROBE: a page with no heading fails required-heading" },
  // PROBE: required-label is case-insensitive in the rule — a page with NO labels must fail.
  { id: "reqlabel-missing", cfg: ruleCfg("required-label", { labels: ["confidential"] }),
    adf: doc(paragraph("body with no labels")), expect: "violation", note: "PROBE: missing required label is flagged" },
  // SV-NEW-1 (min-length side): 40 emoji = 40 code points < a 50-char minimum → must FAIL.
  // The old String.length (80) wrongly passed this; verifies the code-point fix covers min-length too.
  { id: "minlen-emoji-codepoints", cfg: ruleCfg("min-length", { minChars: 50 }),
    adf: doc(paragraph("😀".repeat(40))), expect: "violation",
    note: "✅ SV-NEW-1 (min-length): 40 emoji = 40 code points is correctly under a 50-char minimum" },
];

test.describe.configure({ timeout: 240_000, retries: 2 });

test.describe("Sentinel Vault validation rule-eval edges", () => {
  let original: any, spaceId: string;
  test.beforeAll(async () => { original = await getKvs(CFG_KEY); spaceId = await spaceIdByKey(SPACE); });
  test.afterAll(async () => { if (original) await setConfig(original); else await getTestState("sentinel-vault", { what: "delete", key: CFG_KEY }); });

  for (const c of CASES) {
    test(`${c.id}${c.note ? ` — ${c.note}` : ""}`, async () => {
      await setConfig(c.cfg);
      const page = await createPage({ spaceId, title: `HARNESS sv-eval-${c.id} ${Date.now()}`, adf: c.adf });
      try {
        const outcome = await waitForTerminal(async () => {
          if ((await getKvs(`validation-lastgood-${page.id}`)) != null) return "compliant";
          if ((await getComments(page.id)).length > 0) return "violation";
          return false;
        }, { timeout: 50_000, interval: 2_500, label: `${c.id} trigger outcome` });
        expect(outcome, `${c.id}: expected ${c.expect}`).toBe(c.expect);
      } finally {
        await deletePage(page.id).catch(() => {});
      }
    });
  }
});
