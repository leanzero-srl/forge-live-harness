// Altomata DEEP — adversarial clone inputs through the backend webtrigger. The clone action must
// degrade gracefully ({ok:false, error}) on every bad input, never throw/500 or partially mutate.
// (All verified live — these lock the graceful-failure contract as regression guards.)
import { test, expect } from "@playwright/test";
import { altomataAction, hasAltomataHook } from "../../testhook/altomata";

test.describe.configure({ timeout: 90_000 });

test.describe("Altomata clone — adversarial inputs (graceful failure)", () => {
  test.skip(!hasAltomataHook(), "Altomata backend webtrigger not provisioned (.env)");

  const cases: Array<{ name: string; params: any; match: RegExp }> = [
    { name: "non-existent target project", params: { sourceKey: "WFH-1", targetProjectKey: "ZZZNOPE", targetIssueTypeId: "10007" }, match: /project/i },
    { name: "non-existent source issue", params: { sourceKey: "WFH-99999999", targetProjectKey: "WFH", targetIssueTypeId: "10007" }, match: /404|does not exist/i },
    { name: "invalid issue type id", params: { sourceKey: "WFH-1", targetProjectKey: "WFH", targetIssueTypeId: "99999" }, match: /issuetype|issue type/i },
    { name: "missing required params", params: { sourceKey: "WFH-1" }, match: /needs|required/i },
  ];

  for (const c of cases) {
    test(`🛡️ clone with ${c.name} fails gracefully`, async () => {
      const res = await altomataAction("clone", c.params);
      console.log(`${c.name} → ${JSON.stringify(res).slice(0, 200)}`);
      expect(res.ok, `must report failure, not throw/succeed: ${JSON.stringify(res)}`).toBe(false);
      expect(String(res.error || ""), `error should explain the cause`).toMatch(c.match);
      expect(res.newKey, "no issue should be created on failure").toBeFalsy();
    });
  }

  test("🛡️ an unknown actionKey is rejected", async () => {
    const res = await altomataAction("no-such-action", {});
    expect(res.ok).toBe(false);
    expect(String(res.error || "")).toMatch(/unknown action/i);
  });
});
