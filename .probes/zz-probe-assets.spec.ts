// TESTER PROBE — v6.98.0 ITEM 5: Assets update paths must not leak internal
// field names into user-visible prose, must not blame Jira for our own rules.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { request } from "../../data/jira.mjs";
import {
  GLOBAL_APP, assertLoggedIn, awaitSwapSettled, callResolver, deliverMessage,
  openGlobalPage, readAppState, readThread, waitForChatApp, waitForThread,
} from "./chatwise-support";

const T = getTarget("chatwise-global");
test.describe.configure({ timeout: 1_800_000 });

// ChatWise's OWN result field names — none may reach a bubble.
const OWN_FIELDS = [
  "storedValues", "storedValuesNote", "previousAttributes", "attributesSet",
  "storedMatchesRequest", "matchesRequest", "writableAttributes", "requiredAttributes",
  "pageLimitNote", "typesNote", "reportingRule", "causeKnown", "jiraError",
  "objectCount", "schemaCount", "typeError", "attributeId",
];

test("PROBE assets: field names, authorship, collateral warning", async ({ page }) => {
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await frame.locator("#newChatButton").click();
  await awaitSwapSettled(frame);
  const conv = await readAppState<string>(frame, GLOBAL_APP, "app.getActiveConversationId()");
  const stamp = Date.now();
  let createdId: string | null = null;
  const bubbles: { label: string; text: string }[] = [];

  const turn = async (label: string, text: string): Promise<string> => {
    const before = (await readThread(frame)).filter((m) => m.role === "assistant").length;
    await deliverMessage(page, frame, text, label);
    const t = await waitForThread(page, frame,
      (x) => x.filter((m) => m.role === "assistant" && !m.streaming).length > before,
      { timeout: 600_000, interval: 3_000, label });
    const reply = t.filter((m) => m.role === "assistant").pop()!.text;
    bubbles.push({ label, text: reply });
    console.log(`\n===== ${label} =====\n${reply}\n`);
    return reply;
  };

  try {
    await turn("create",
      `In Assets, create ONE object of type 77 (Confluence Space, schema IGOV) with Name ` +
      `"[harness-test] probe ${stamp}", Space Key "HTP${stamp % 100000}", Classification INTERNAL ` +
      `and Data Owner "Harness Tester". Create it now, do not ask me to confirm. Tell me its key.`);

    // find it via REST so the rest of the run is anchored on a real id
    const ws: any = await request("GET", "/rest/servicedeskapi/assets/workspace");
    const wsId = ws.values[0].workspaceId;
    const AQL = async () => request("POST",
      `https://api.atlassian.com/jsm/assets/workspace/${wsId}/v1/object/aql?maxResults=50&includeAttributes=true`,
      { body: { qlQuery: `objectType = "Confluence Space"` } });
    const found: any = await AQL();
    const mine = (found.values || []).find((o: any) => String(o.label).includes(String(stamp)));
    expect(mine, "createAssetObject did not create the object").toBeTruthy();
    createdId = mine.id;
    console.log(`CREATED: id=${mine.id} key=${mine.objectKey} label=${mine.label}`);

    await turn("update-by-label",
      `Set the Classification of Assets object ${mine.objectKey} to PUBLIC. Do it now.`);
    await turn("update-by-key",
      `Now set the Classification of ${mine.objectKey} to IGOV-107. Do it now.`);
    await turn("unknown-label",
      `Now set the Classification of ${mine.objectKey} to TOP SECRET. Do it now.`);
    await turn("collateral",
      `Now change ONLY the Name of ${mine.objectKey} to "[harness-test] renamed ${stamp}". ` +
      `Change nothing else. Do it now.`);

    // ---- what Assets actually holds now ----------------------------------
    const after: any = await request("GET",
      `https://api.atlassian.com/jsm/assets/workspace/${wsId}/v1/object/${createdId}`);
    console.log("FINAL OBJECT ATTRS: " + JSON.stringify(
      (after.attributes || []).map((a: any) => ({
        name: a.objectTypeAttribute?.name,
        vals: (a.objectAttributeValues || []).map((v: any) => v.referencedObject?.label ?? v.displayValue ?? v.value),
      }))));

    // ---------------- ASSERTIONS ------------------------------------------
    const leaks: string[] = [];
    const jiraBlame: string[] = [];
    for (const b of bubbles) {
      for (const f of OWN_FIELDS) {
        if (new RegExp(`\\b${f}\\b`).test(b.text)) leaks.push(`${b.label}: "${f}"`);
      }
      // any lowerCamelCase token at all, for review
      const camel = Array.from(new Set(b.text.match(/\b[a-z]+[A-Z][A-Za-z]{2,}\b/g) || []));
      if (camel.length) console.log(`CAMELCASE TOKENS in ${b.label}: ${JSON.stringify(camel)}`);
      if (/Jira (requires|does not allow|won't|will not|rejected|refuses|insists)/i.test(b.text)) {
        jiraBlame.push(`${b.label}: ${(b.text.match(/[^.]*Jira (requires|does not allow|won't|will not|rejected|refuses|insists)[^.]*\./i) || [])[0]}`);
      }
    }
    console.log("LEAKS: " + JSON.stringify(leaks));
    console.log("JIRA-BLAME SENTENCES (review manually): " + JSON.stringify(jiraBlame));
    expect(leaks, `ChatWise field names reached the user: ${leaks.join(" | ")}`).toEqual([]);
  } finally {
    if (createdId) {
      const ws: any = await request("GET", "/rest/servicedeskapi/assets/workspace").catch(() => null);
      if (ws) {
        await request("DELETE",
          `https://api.atlassian.com/jsm/assets/workspace/${ws.values[0].workspaceId}/v1/object/${createdId}`)
          .then(() => console.log(`RESTORED: deleted Assets object ${createdId}`))
          .catch((e) => console.log(`!! COULD NOT DELETE ${createdId}: ${e.message}`));
      }
    }
    if (conv) await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId: conv }).catch(() => {});
  }
});
