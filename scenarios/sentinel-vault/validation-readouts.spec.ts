// Coverage gap (2026-09-05) — the validation READOUT resolvers no spec drove:
//   validate-page-now  — the inline-panel "Validate now" button. A global `required-heading`
//                        BLOCK rule is seeded with the global switch OFF: resolveRules (manual
//                        check) ignores the switch, while resolveEffectiveConfig (the page trigger)
//                        honours it — so the throwaway page's create/edit never trips the trigger
//                        and the readout is the only thing under test. Violating body → the rule
//                        is named; add the heading → passes. Negative: Gabriela on SVSEC1P.
//   get-validation-state — the ribbon chip / panel status. Reads the `sentinel-vault-validation`
//                        content property: seeded over REST on the private page so the entitled
//                        read echoes it exactly and the unentitled read gets null; on the fixture
//                        page the readout must equal whatever the property holds (or null).
//   list-ai-models     — Forge LLM list (no tokens billed): a Haiku id, never Sonnet/Opus.
//   set-ai-finding-state — per-finding triage. Findings are seeded the way the consumer stores
//                        them (`ai-latest-{pageId}`), one is dismissed, get-ai-findings reports it
//                        stuck (and its sibling still open), re-opening clears the entry. Negative:
//                        Gabriela on SVSEC1P (canEditPage, unconditional).
// it47: the global validation config is restored to the DURABLE DISABLED baseline, never a captured
// value. Self-cleaning: throwaway pages + seeded keys deleted.
// @covers resolver:validate-page-now resolver:get-validation-state resolver:list-ai-models resolver:set-ai-finding-state
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, writeAdf, deletePage, setContentProperty } from "../../data/confluence.mjs";
// @ts-ignore
import { post, get } from "../../data/jira.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const PAGE = process.env.SV_PAGE_ID || "265912321";
const PRIV_SPACE = "SVSEC1P";
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const GABI = "712020:2b9d007d-db0d-47c9-b4ae-953f55501f55";
const CFG_KEY = "validation-config-global";
const DISABLED = { enabled: false, modes: { advisory: true, gate: false, revert: false }, rules: [], ai: { enabled: false } };
const RULE = { id: "hr-required-heading", type: "required-heading", label: "AQL required heading", severity: "block", enabled: true, config: { text: "AQL REQUIRED", minCount: 1 } };
const STATE_PROP = "sentinel-vault-validation";

const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const readProp = async (pageId: string) => {
  const r = await get(`/wiki/api/v2/pages/${pageId}/properties?key=${STATE_PROP}`);
  return r?.results?.[0]?.value ?? null;
};

async function ensurePrivateSpace(): Promise<string> {
  const existing = await spaceIdByKey(PRIV_SPACE);
  if (existing) return existing;
  await post("/wiki/rest/api/space/_private", {
    key: PRIV_SPACE,
    name: "SV-SEC-1 authz probe",
    description: { plain: { value: "Harness-owned. Private on purpose — see authz-content-gate.spec.ts", representation: "plain" } },
  });
  const id = await spaceIdByKey(PRIV_SPACE);
  if (!id) throw new Error(`could not create or find the private probe space ${PRIV_SPACE}`);
  return id;
}

test.describe.configure({ timeout: 240_000, retries: 1 });

test.describe("validation readouts", () => {
  let spaceId: string;
  let privPage: any;
  test.beforeAll(async () => {
    spaceId = await spaceIdByKey(SPACE);
    const privSpaceId = await ensurePrivateSpace();
    privPage = await createPage({ spaceId: privSpaceId, title: `HARNESS sv-valreadout priv ${Date.now()}`, adf: doc(heading("PRIVATE", 2), paragraph("private body")) });
    const prior = await getKvs(CFG_KEY);
    console.log(`### validation-config-global before: ${JSON.stringify(prior)?.slice(0, 160)}`);
    // Rules on, switch OFF: the manual readout evaluates, the page trigger stays inert.
    await setKvs(CFG_KEY, { ...DISABLED, rules: [RULE] });
  });
  test.afterAll(async () => {
    await setKvs(CFG_KEY, DISABLED); // it47 durable baseline
    if (privPage) await deletePage(privPage.id).catch(() => {});
  });

  test("validate-page-now names the violated rule, passes once fixed, refuses an unreadable page", async () => {
    const pg = await createPage({ spaceId, title: `HARNESS sv-validate-now ${Date.now()}`, adf: doc(heading("Something else", 2), paragraph("no required heading here")) });
    try {
      const bad = await inv("validatePageNow", { pageId: pg.id, actor: MIHAI });
      expect(bad.result?.noRules, "the seeded rule is in force for the readout").toBeFalsy();
      expect(bad.result?.passed, "a page without the heading fails").toBe(false);
      const v = (bad.result?.violations || []).find((x: any) => x.ruleId === RULE.id);
      expect(v, `the violation names the rule (got: ${JSON.stringify(bad.result?.violations)})`).toBeTruthy();
      expect(v.severity).toBe("block");
      expect(v.label).toBe(RULE.label);
      expect(v.message, "…and says what is missing").toMatch(/AQL REQUIRED/);

      await writeAdf(pg.id, doc(heading("AQL REQUIRED", 2), paragraph("now compliant")));
      const good = await inv("validatePageNow", { pageId: pg.id, actor: MIHAI });
      expect(good.result?.passed, "the same page passes once the heading is present").toBe(true);
      expect((good.result?.violations || []).length).toBe(0);
      // The trigger stayed inert (switch off): no gate/lastgood bookkeeping appeared for this page.
      expect(await getKvs(`validation-lastgood-${pg.id}`), "the page trigger did not run validation (global switch is off)").toBeFalsy();

      const denied = await inv("validatePageNow", { pageId: privPage.id, actor: GABI });
      expect(denied.result?.passed, "a page the caller cannot read is not 'all checks passed'").toBe(false);
      expect(denied.result?.ok).toBe(false);
      expect(denied.result?.failureReason).toMatch(/could not validate/i);
      expect((denied.result?.violations || []).length, "…and no derived content leaks").toBe(0);
      console.log("### validate-page-now ✓ (violation named, fix passes, unreadable refused)");
    } finally {
      await delKvs(`validation-lastgood-${pg.id}`).catch(() => {});
      await deletePage(pg.id).catch(() => {});
    }
  });

  test("get-validation-state echoes the page's state property, and only to a reader", async () => {
    const fx = await inv("getValidationState", { pageId: PAGE, actor: MIHAI });
    expect(fx.result, "the readout has the { state } shape").toHaveProperty("state");
    const fxProp = await readProp(PAGE);
    if (fxProp) expect(fx.result.state, "the fixture page's state equals its property").toEqual(fxProp);
    else expect(fx.result.state, "no property on the fixture page → null").toBeNull();

    const seeded = { state: "failed", violations: [{ ruleId: RULE.id, label: RULE.label, severity: "block", message: "seeded" }], checkedAt: new Date().toISOString() };
    await setContentProperty(privPage.id, STATE_PROP, seeded);
    const mine = await inv("getValidationState", { pageId: privPage.id, actor: MIHAI });
    expect(mine.result?.state, "an entitled caller reads the seeded state back exactly").toEqual(seeded);
    const denied = await inv("getValidationState", { pageId: privPage.id, actor: GABI });
    expect(denied.result?.state, "an unentitled caller gets null for the same page").toBeNull();
    console.log("### get-validation-state ✓ (echoes the property; unreadable → null)");
  });

  test("list-ai-models offers Haiku and nothing larger", async () => {
    const r = await inv("listAiModels");
    const models: string[] = r.result?.models || [];
    expect(models.length, "at least one model").toBeGreaterThan(0);
    expect(models.some((m) => /claude-haiku/i.test(m)), `a claude-haiku id is offered (got ${models.join(",")})`).toBe(true);
    expect(models.filter((m) => /sonnet|opus/i.test(m)), "no Sonnet/Opus id ever reaches the dropdown").toEqual([]);
    console.log(`### list-ai-models ✓ (${models.join(", ")})`);
  });

  test("set-ai-finding-state sticks per finding, and only for an editor of the page", async () => {
    const pg = await createPage({ spaceId, title: `HARNESS sv-finding-state ${Date.now()}`, adf: doc(heading("AI", 2), paragraph("findings seed")) });
    const LATEST = `ai-latest-${pg.id}`;
    const STATES = `ai-finding-state-${pg.id}`;
    try {
      await setKvs(LATEST, {
        pageId: pg.id, reviewedAt: new Date().toISOString(), model: "claude-haiku-4-5-20251001",
        findings: [
          { id: "f-aql-1", severity: "warn", category: "style", message: "seeded finding one", excerpt: "findings seed" },
          { id: "f-aql-2", severity: "warn", category: "style", message: "seeded finding two", excerpt: "findings seed" },
        ],
      });
      await delKvs(STATES).catch(() => {});

      const set = await inv("setAiFindingState", { pageId: pg.id, findingId: "f-aql-1", state: "dismissed", actor: MIHAI });
      expect(set.result?.success, `an editor can triage (got: ${set.result?.reason})`).toBe(true);
      expect(await getKvs(STATES), "the state record holds exactly the dismissed finding").toEqual({ "f-aql-1": "dismissed" });

      const rd = await inv("getAiFindings", { page: pg.id, space: SPACE, actor: MIHAI });
      const fs: any[] = rd.result?.findings?.findings || [];
      expect(fs.length, "both seeded findings are reported").toBe(2);
      expect(fs.find((f) => f.id === "f-aql-1")?.state, "the dismissed one reads dismissed").toBe("dismissed");
      expect(fs.find((f) => f.id === "f-aql-2")?.state, "its sibling is still open").toBe("open");

      const bogus = await inv("setAiFindingState", { pageId: pg.id, findingId: "f-aql-2", state: "not-a-state", actor: MIHAI });
      expect(bogus.result?.success).toBe(true);
      expect((await getKvs(STATES))?.["f-aql-2"], "an unknown state is coerced to open (no entry)").toBeUndefined();

      const reopen = await inv("setAiFindingState", { pageId: pg.id, findingId: "f-aql-1", state: "open", actor: MIHAI });
      expect(reopen.result?.success).toBe(true);
      expect((await getKvs(STATES))?.["f-aql-1"], "re-opening clears the entry").toBeUndefined();
      console.log("### set-ai-finding-state ✓ (dismiss sticks, sibling open, reopen clears)");

      // NEGATIVE — unconditional write gate.
      const denied = await inv("setAiFindingState", { pageId: privPage.id, findingId: "f-x", state: "dismissed", actor: GABI });
      expect(denied.result?.success, "a real user who cannot edit the page is REFUSED").toBe(false);
      expect(denied.result?.reason).toMatch(/permission/i);
      expect(await getKvs(`ai-finding-state-${privPage.id}`), "…and nothing was written").toBeFalsy();
      console.log("### set-ai-finding-state gate ✓ (unentitled refused, nothing written)");
    } finally {
      await delKvs(LATEST).catch(() => {});
      await delKvs(STATES).catch(() => {});
      await delKvs(`ai-finding-state-${privPage.id}`).catch(() => {});
      await deletePage(pg.id).catch(() => {});
    }
  });
});
