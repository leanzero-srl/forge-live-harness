// Sentinel Vault DEEP suite — the page-content trigger's VALIDATION behaviors,
// triggerable by an owner edit (no 2nd account needed): advisory comment + hard
// revert. Setup writes a global validation rule via the dev-gated hook (saved +
// restored so the testbed isn't left with validation on). Deterministic: poll the
// trigger's terminal state (comment posted / page reverted).
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";
// @ts-ignore
import { spaceIdByKey, createPage, readPage, writeAdf, getComments, deletePage } from "../../data/confluence.mjs";
// @ts-ignore
import { paragraph, simpleTable } from "../../data/adf.mjs";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const CFG_KEY = "validation-config-global";
// A leftover space config's `modes` override the global modes in resolveEffectiveConfig
// (space?.modes||global.modes), so an advisory-only WFH space config silently shadows the global
// revert we set here → the revert never fires. Neutralise it for the test (see gate-revert.spec.ts;
// the shadowing itself is a flagged APP bug in the COVERAGE-MATRIX bad-behavior list).
const SPACE_CFG_KEY = `validation-config-space-${SPACE}`;
const LONG = "x".repeat(320); // > 200 chars

const setConfig = (cfg: any) => getTestState("sentinel-vault", { what: "set", key: CFG_KEY, value: JSON.stringify(cfg) });
const setSpaceConfig = (cfg: any) => getTestState("sentinel-vault", { what: "set", key: SPACE_CFG_KEY, value: JSON.stringify(cfg) });
const delKey = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const doc = (...nodes: any[]) => ({ version: 1, type: "doc", content: nodes });

function rule(type: string, config: any) {
  return { id: `hr-${type}`, type, label: type, severity: "block", enabled: true, config };
}

test.describe.configure({ timeout: 180_000, retries: 2 });

test.describe("Sentinel Vault validation (page-content trigger)", () => {
  let original: any;
  let originalSpace: any;
  let spaceId: string;

  test.beforeAll(async () => {
    original = await getKvs(CFG_KEY); // save whatever global config exists
    originalSpace = await getKvs(SPACE_CFG_KEY); // capture + neutralise so global modes apply
    await delKey(SPACE_CFG_KEY);
    spaceId = await spaceIdByKey(SPACE);
  });

  test.afterAll(async () => {
    // restore the testbed's original config (or disable if there was none)
    if (original) await setConfig(original);
    else await delKey(CFG_KEY);
    if (originalSpace) await setSpaceConfig(originalSpace); else await delKey(SPACE_CFG_KEY);
  });

  test("advisory: removing required content posts a violation comment", async () => {
    await setConfig({ enabled: true, modes: { advisory: true, gate: false, revert: false }, rules: [rule("required-table", { minCount: 1 })], ai: { enabled: false } });
    // compliant page (has a table) → trigger passes → lastgood set
    const page = await createPage({ spaceId, title: `HARNESS sv-advisory ${Date.now()}`, adf: doc(paragraph("Report"), simpleTable()) });
    try {
      await waitForTerminal(async () => (await getKvs(`validation-lastgood-${page.id}`)) != null, { timeout: 30_000, label: "lastgood after compliant create" });
      // edit to remove the table → block violation → advisory comment
      await writeAdf(page.id, doc(paragraph("Report"), paragraph("table removed")));
      const comment = await waitForTerminal(async () => {
        const cs = await getComments(page.id);
        return cs.find((c: any) => /table/i.test(c.body?.storage?.value || "")) || false;
      }, { timeout: 45_000, interval: 2_500, label: "advisory comment" });
      expect(comment, "a validation comment mentioning the missing table should be posted").toBeTruthy();
    } finally {
      await deletePage(page.id).catch(() => {});
    }
  });

  test("hard-revert: a non-compliant edit is reverted to the last compliant version", async () => {
    await setConfig({ enabled: true, modes: { advisory: false, gate: false, revert: true }, rules: [rule("max-length", { maxChars: 200 })], ai: { enabled: false } });
    const SHORT = "Short compliant body.";
    const page = await createPage({ spaceId, title: `HARNESS sv-revert ${Date.now()}`, adf: doc(paragraph(SHORT)) });
    try {
      await waitForTerminal(async () => (await getKvs(`validation-lastgood-${page.id}`)) != null, { timeout: 30_000, label: "lastgood after compliant create" });
      const v1 = (await readPage(page.id)).version;
      // edit to exceed max-length → block violation → revert to last good (v1)
      await writeAdf(page.id, doc(paragraph(LONG)));
      const restored = await waitForTerminal(async () => {
        const p = await readPage(page.id);
        const text = JSON.stringify(p.adf);
        // terminal: app re-saved (version advanced past our edit) AND content is the short body again
        return p.version > v1 + 1 && text.includes(SHORT) && !text.includes(LONG) ? p : false;
      }, { timeout: 60_000, interval: 3_000, label: "hard revert to last good" });
      expect(restored, "page should be reverted to the compliant short body").toBeTruthy();
    } finally {
      await deletePage(page.id).catch(() => {});
    }
  });
});
