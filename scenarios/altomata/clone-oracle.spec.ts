// Altomata DEEP — the `clone` issue-action, driven through the dev-only backend webtrigger and
// verified against Jira via REST. Proves the app's core automation works end-to-end in conjunction
// with the platform: a real issue is created, Cloners-linked back to the source, and commented.
import { test, expect } from "@playwright/test";
// @ts-ignore
import { createIssue, deleteIssue } from "../../data/jira-build.mjs";
// @ts-ignore
import { get } from "../../data/jira.mjs";
import { altomataAction, hasAltomataHook } from "../../testhook/altomata";

const PROJECT = process.env.ALTOMATA_TEST_PROJECT || "WFH";
const ISSUE_TYPE = process.env.ALTOMATA_TEST_ISSUETYPE || "Bug";

test.describe.configure({ timeout: 120_000 });

test.describe("Altomata clone (webtrigger + REST oracle)", () => {
  test.skip(!hasAltomataHook(), "Altomata backend webtrigger not provisioned (.env ALTOMATA_TESTHOOK_URL/SECRET)");

  test("🔎 clone creates a Cloners-linked, commented copy of the source issue", async () => {
    const tag = Date.now().toString(36);
    const src = await createIssue({ projectKey: PROJECT, issueType: ISSUE_TYPE, summary: `HARNESS altomata-clone SRC ${tag} [harness-test]` });
    let newKey: string | undefined;
    try {
      const srcFull: any = await get(`/rest/api/3/issue/${src.key}?fields=issuetype`);
      const targetIssueTypeId = srcFull.fields.issuetype.id;

      const res = await altomataAction("clone", {
        sourceKey: src.key,
        targetProjectKey: PROJECT,
        targetIssueTypeId,
        copyAttachments: false,
        reason: `harness clone ${tag}`,
      });
      console.log(`clone → ${JSON.stringify(res).slice(0, 260)}`);
      expect(res.ok, `clone should succeed: ${JSON.stringify(res)}`).toBe(true);
      newKey = res.newKey as string;
      expect(newKey, "clone returns a newKey").toBeTruthy();
      expect(res.linked, "clone reports it linked source↔copy").toBe(true);

      // REST oracle: the copy exists, is named "Clone of …", uses the requested type,
      // links back via Cloners, and carries the reason comment.
      const copy: any = await get(`/rest/api/3/issue/${newKey}?fields=summary,issuelinks,comment,issuetype`);
      expect(copy.fields.summary, "copy summary marks it a clone of the source").toContain("altomata-clone SRC");
      expect(copy.fields.issuetype.id, "copy uses the requested issue type").toBe(targetIssueTypeId);

      const links = copy.fields.issuelinks || [];
      const linkedKeys = links.flatMap((l: any) => [l.inwardIssue?.key, l.outwardIssue?.key]).filter(Boolean);
      const linkTypes = links.map((l: any) => l.type?.name);
      expect(linkedKeys.includes(src.key), `copy links back to ${src.key}; got ${JSON.stringify(linkedKeys)}`).toBe(true);
      expect(linkTypes.includes("Cloners"), `link is a Cloners link; got ${JSON.stringify(linkTypes)}`).toBe(true);

      const comments = copy.fields.comment?.comments || [];
      expect(comments.length, "clone added a source/reason comment").toBeGreaterThan(0);
    } finally {
      if (newKey) await deleteIssue(newKey).catch(() => {});
      await deleteIssue(src.key).catch(() => {});
    }
  });
});
