// it50 REGRESSION GUARD — the C6 compliance floor extended to enforcement MODES.
// Proves the app-side fix for the it49 shadow bug: a SPACE validation config (even a dormant
// enabled:false shell, or an advisory-only one) can NO LONGER downgrade the org's global gate+revert.
// resolveEffectiveConfig now (a) ignores a space config with enabled===false entirely, and
// (b) UNIONs modes so a space can only strengthen, never turn off, global gate/revert/advisory.
// Also verifies the triggers.js comment-coherence fix: a reverted edit gets ONE "was reverted /
// recover from history" comment, never the stale "Please review and update" for content already gone.
// Durable cleanup: global is restored to a DISABLED baseline (never a captured-maybe-polluted value).
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, readPage, writeAdf, deletePage } from "../../data/confluence.mjs";
// @ts-ignore
import { get } from "../../data/jira.mjs";
// @ts-ignore
import { paragraph } from "../../data/adf.mjs";
import { waitForTerminal } from "../_support/wait";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const GKEY = "validation-config-global";
const SKEY = `validation-config-space-${SPACE}`;
const DISABLED = { enabled: false, modes: { advisory: true, gate: false, revert: false }, rules: [], ai: { enabled: false } };
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const doc = (...nodes: any[]) => ({ version: 1, type: "doc", content: nodes });
const SHORT = "Short compliant body.";
const LONG = "x".repeat(320);

test.describe.configure({ timeout: 180_000, retries: 2 });

test.describe("it50: a space config cannot weaken global gate+revert (C6 mode floor)", () => {
  let origSpace: any, spaceId: string;
  test.beforeAll(async () => {
    origSpace = await getKvs(SKEY);
    spaceId = await spaceIdByKey(SPACE);
  });
  test.afterAll(async () => {
    // it47 durable baseline: reset global to DISABLED (not a captured/polluted original); restore the space config.
    await setKvs(GKEY, DISABLED);
    if (origSpace) await setKvs(SKEY, origSpace); else await delKvs(SKEY);
  });

  test("dormant advisory-only space shadow does NOT stop the global revert + posts one coherent comment", async () => {
    // org mandates advisory + gate + revert; the space has a DORMANT advisory-only shell (enabled:false).
    await setKvs(GKEY, {
      enabled: true,
      modes: { advisory: true, gate: true, revert: true },
      rules: [{ id: "g1", type: "max-length", label: "max", severity: "block", enabled: true, config: { maxChars: 200 } }],
      ai: { enabled: false },
    });
    await setKvs(SKEY, { enabled: false, modes: { advisory: true, gate: false, revert: false }, rules: [], ai: { enabled: false } });

    const page = await createPage({ spaceId, title: `HARNESS sv-floor ${Date.now()}`, adf: doc(paragraph(SHORT)) });
    try {
      await waitForTerminal(async () => (await getKvs(`validation-lastgood-${page.id}`)) != null, { timeout: 30_000, label: "lastgood after compliant create" });
      const v1 = (await readPage(page.id)).version;
      await writeAdf(page.id, doc(paragraph(LONG))); // violating edit — the space shadow must NOT stop the revert

      const res: any = await waitForTerminal(async () => {
        const p = await readPage(page.id);
        const reverted = p.version > v1 + 1 && JSON.stringify(p.adf).includes(SHORT) && !JSON.stringify(p.adf).includes(LONG);
        return reverted ? { v: p.version } : false;
      }, { timeout: 60_000, interval: 3_000, label: "revert despite the space shadow" });
      expect(res, "the advisory-only space shadow must NOT prevent the global revert").toBeTruthy();
      console.log("### it50: violating edit REVERTED despite the dormant space shadow ✓");

      // comment coherence: the validation comment is posted ASYNC after the revert PUT, so POLL for
      // it. Expect exactly the "was reverted / recover" comment, NOT the stale "review and update".
      const coh: any = await waitForTerminal(async () => {
        const c: any = await get(`/wiki/api/v2/pages/${page.id}/footer-comments?body-format=storage&limit=50`);
        const bodies = (c.results || []).map((x: any) => x.body?.storage?.value || "");
        const reverted = bodies.filter((b: string) => /was reverted to the last compliant version/i.test(b)).length;
        const stale = bodies.filter((b: string) => /Please review and update/i.test(b)).length;
        return reverted >= 1 ? { reverted, stale } : false;
      }, { timeout: 30_000, interval: 3_000, label: "reverted comment posted" });
      expect(coh.reverted, "posts the 'was reverted / recover from history' comment").toBeGreaterThanOrEqual(1);
      expect(coh.stale, "no stale 'Please review and update' comment for content that was reverted away").toBe(0);
      console.log(`### it50: comment coherence ✓ (${coh.reverted} reverted-comment, ${coh.stale} stale)`);
    } finally {
      await deletePage(page.id).catch(() => {});
    }
  });
});
