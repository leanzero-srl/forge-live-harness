// Sentinel Vault DEEP — gate + revert interaction.
// 🔎 CONFIRMS SV-m2: with gate+revert both on, a violating edit writes gate state 'failed'
// AND reverts the body to the last compliant version; the app's own restoring save is
// loop-guard-skipped, so runValidationPhase never re-runs → the gate state is never
// reconciled back to 'passed'. Result: content is compliant but the gate is stuck on 'failed'.
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";
// @ts-ignore
import { spaceIdByKey, createPage, readPage, writeAdf, deletePage } from "../../data/confluence.mjs";
// @ts-ignore
import { get } from "../../data/jira.mjs";
// @ts-ignore
import { paragraph } from "../../data/adf.mjs";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const CFG_KEY = "validation-config-global";
const setConfig = (cfg: any) => getTestState("sentinel-vault", { what: "set", key: CFG_KEY, value: JSON.stringify(cfg) });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const doc = (...nodes: any[]) => ({ version: 1, type: "doc", content: nodes });
const SHORT = "Short compliant body.";
const LONG = "x".repeat(320);

async function gateState(pageId: string) {
  const r: any = await get(`/wiki/api/v2/pages/${pageId}/properties?key=sentinel-vault-validation`);
  return r.results?.[0]?.value || null;
}

test.describe.configure({ timeout: 180_000, retries: 2 });

test.describe("Sentinel Vault gate+revert (SV-m2)", () => {
  let original: any, spaceId: string;
  test.beforeAll(async () => { original = await getKvs(CFG_KEY); spaceId = await spaceIdByKey(SPACE); });
  test.afterAll(async () => { if (original) await setConfig(original); else await getTestState("sentinel-vault", { what: "delete", key: CFG_KEY }); });

  test("🔎 SV-m2: gate stays 'failed' after the body is auto-reverted to compliant", async () => {
    await setConfig({ enabled: true, modes: { advisory: false, gate: true, revert: true }, rules: [{ id: "g1", type: "max-length", label: "max", severity: "block", enabled: true, config: { maxChars: 200 } }], ai: { enabled: false } });
    const page = await createPage({ spaceId, title: `HARNESS sv-gate ${Date.now()}`, adf: doc(paragraph(SHORT)) });
    try {
      await waitForTerminal(async () => (await getKvs(`validation-lastgood-${page.id}`)) != null, { timeout: 30_000, label: "lastgood after compliant create" });
      const v1 = (await readPage(page.id)).version;
      await writeAdf(page.id, doc(paragraph(LONG))); // violating → gate 'failed' + revert
      const result: any = await waitForTerminal(async () => {
        const p = await readPage(page.id);
        const reverted = p.version > v1 + 1 && JSON.stringify(p.adf).includes(SHORT) && !JSON.stringify(p.adf).includes(LONG);
        if (!reverted) return false;
        const gs = await gateState(page.id);
        return { state: gs?.state, gsVersion: gs?.version, pageVersion: p.version };
      }, { timeout: 60_000, interval: 3_000, label: "revert + gate state" });
      console.log(`SV-m2 → content reverted to compliant; gate state='${result.state}' (for v${result.gsVersion}) while page is v${result.pageVersion}`);
      expect(result.state, "gate state should be stuck on 'failed' although content is compliant (SV-m2)").toBe("failed");
    } finally {
      await deletePage(page.id).catch(() => {});
    }
  });
});
