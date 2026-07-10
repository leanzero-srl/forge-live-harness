// Sentinel Vault DEEP — destructive hard-revert.
// 🔎 CONFIRMS SV-M1: revert wholesale-overwrites the page with the last-good body, so a single
// save that BOTH adds legitimate content AND violates a rule loses the legitimate addition too
// (a surgical revert that removed only the violating nodes would keep it).
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";
// @ts-ignore
import { spaceIdByKey, createPage, readPage, writeAdf, deletePage } from "../../data/confluence.mjs";
// @ts-ignore
import { paragraph, heading } from "../../data/adf.mjs";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const CFG_KEY = "validation-config-global";
// A leftover advisory-only WFH space config's `modes` shadow the global revert we set here
// (resolveEffectiveConfig space?.modes||global.modes) → no revert. Neutralise it for the test
// (see gate-revert.spec.ts; the shadowing is a flagged APP bug in the COVERAGE-MATRIX).
const SPACE_CFG_KEY = `validation-config-space-${SPACE}`;
const setConfig = (cfg: any) => getTestState("sentinel-vault", { what: "set", key: CFG_KEY, value: JSON.stringify(cfg) });
const setSpaceConfig = (cfg: any) => getTestState("sentinel-vault", { what: "set", key: SPACE_CFG_KEY, value: JSON.stringify(cfg) });
const delKey = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const doc = (...nodes: any[]) => ({ version: 1, type: "doc", content: nodes });
const LONG = "x".repeat(320);

test.describe.configure({ timeout: 180_000, retries: 2 });

test.describe("Sentinel Vault destructive revert (SV-M1)", () => {
  let original: any, originalSpace: any, spaceId: string;
  test.beforeAll(async () => {
    original = await getKvs(CFG_KEY);
    originalSpace = await getKvs(SPACE_CFG_KEY); // capture + neutralise so global modes apply
    await delKey(SPACE_CFG_KEY);
    spaceId = await spaceIdByKey(SPACE);
  });
  test.afterAll(async () => {
    if (original) await setConfig(original); else await delKey(CFG_KEY);
    if (originalSpace) await setSpaceConfig(originalSpace); else await delKey(SPACE_CFG_KEY);
  });

  test("🔎 SV-M1: a legitimate heading added in the violating save is destroyed by the wholesale revert", async () => {
    await setConfig({ enabled: true, modes: { advisory: false, gate: false, revert: true }, rules: [{ id: "r1", type: "max-length", label: "max", severity: "block", enabled: true, config: { maxChars: 200 } }], ai: { enabled: false } });
    // v1: compliant, contains KEEPME
    const page = await createPage({ spaceId, title: `HARNESS sv-m1 ${Date.now()}`, adf: doc(heading("KEEPME", 2), paragraph("short body")) });
    try {
      await waitForTerminal(async () => (await getKvs(`validation-lastgood-${page.id}`)) != null, { timeout: 30_000, label: "lastgood after compliant create" });
      const v1 = (await readPage(page.id)).version;
      // v2: ADD a legitimate "NEWSECTION" heading AND violate max-length in the same save
      await writeAdf(page.id, doc(heading("KEEPME", 2), heading("NEWSECTION", 2), paragraph(LONG)));
      const reverted: any = await waitForTerminal(async () => {
        const p = await readPage(page.id);
        const text = JSON.stringify(p.adf);
        // terminal: app re-saved (version past our edit) and the LONG violating text is gone (reverted)
        return p.version > v1 + 1 && !text.includes(LONG) ? { text } : false;
      }, { timeout: 60_000, interval: 3_000, label: "hard revert" });
      expect(reverted.text, "revert keeps the original KEEPME content").toContain("KEEPME");
      // The bug: the legitimate NEWSECTION heading added in the same save is ALSO gone.
      expect(reverted.text.includes("NEWSECTION"),
        "SV-M1: the legitimate NEWSECTION heading should survive a surgical revert, but wholesale revert destroys it").toBe(false);
    } finally {
      await deletePage(page.id).catch(() => {});
    }
  });
});
