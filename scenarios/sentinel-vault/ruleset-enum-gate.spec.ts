// B15 (worklist #15) — the cross-space ruleset enumeration `enumerate-realm-rulesets` was UNGATED:
// any logged-in user could name the action and harvest EVERY space's admin-settings (steward list
// `adminUsers`, `adminGroups`, per-space policy). Now site-admin gated. This spec proves the leak is
// CLOSED: real per-space rulesets exist in KVS, yet a non-site-admin caller gets []. (In the webtrigger
// asUser has no session so the gate denies every caller — the positive site-admin path is exercised by
// the sibling write resolvers that use the same canWriteGlobal gate and is covered by code review.)
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const inv = (fn: string, params: Record<string, string>) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;

test.describe.configure({ timeout: 60_000, retries: 1 });

test("B15: enumerate-realm-rulesets is site-admin gated (no cross-space steward-list leak)", async () => {
  // There is REAL data to leak: the space ruleset carries a non-empty steward list.
  const ruleset = await getKvs(`admin-settings-space-${SPACE}`);
  expect(Array.isArray(ruleset?.adminUsers) && ruleset.adminUsers.length, `space ${SPACE} has a steward list that MUST NOT leak`).toBeGreaterThan(0);

  // A non-site-admin caller gets [] — the gate suppresses the real data (not an empty store).
  const res = await inv("enumerateRealmRulesets", { actor: "sv-aql-nonadmin" });
  expect(Array.isArray(res.result), "the resolver returns an array").toBe(true);
  expect(res.result.length, "a non-site-admin sees ZERO rulesets (leak closed)").toBe(0);
  console.log("### enumerate-realm-rulesets gated — real steward list present, non-admin sees [] ✓");
});
