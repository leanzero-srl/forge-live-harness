// LIVE: ASSETS (JSM CMDB) — createAssetObject writes a real object, and
// searchAssets reads it back with its attributes NAMED.
//
// WHY THIS EXISTS
// ---------------
// Assets shipped on 5 Sep 2026 behind six new scopes and a MAJOR version bump,
// and it was verified by a throwaway probe that was then deleted. Nothing
// permanent covered it. Two things about it are genuinely unproven by any unit
// test and can only be settled against the live workspace:
//
//   1. `asUser` REACH. Every reported working Assets integration uses
//      `api.asApp()`, sometimes with a role granted in the schema's Roles tab.
//      ChatWise is `asUser` everywhere with NO asApp fallback, on purpose. If
//      Forge's asUser cannot reach the CMDB with the scopes in the manifest,
//      the whole group is dead on every install and no unit test would say so.
//   2. THE AQL RESPONSE DOES NOT NAME ITS ATTRIBUTES. `GET /object/{id}`
//      embeds the whole definition on every value; `POST /object/aql` ships
//      only `objectTypeAttributeId` per value and the names ONCE, in a
//      top-level `objectTypeAttributes[]`. A handler that reads the embedded
//      field returns `{"156": "..."}` and the model cannot tell one attribute
//      from another. `shapeObject` + `attributeNameIndex` exist to stop that,
//      and this is where it is proven end to end.
//
// HOW IT IS PROVEN, AND WHY IT IS TWO CONVERSATIONS
// -------------------------------------------------
// Turn 1 creates. Ground truth is the harness's OWN AQL query, run against
// api.atlassian.com with a personal token — never the app's reply.
//
// Turn 2 searches, IN A FRESH CONVERSATION with no history. The assertion is
// that the reply names the OBJECT KEY Assets minted at create time
// (e.g. CRT-405). That key did not exist before this run, is not in turn 2's
// prompt, and is not in turn 2's history — so the only way it can appear in the
// reply is if searchAssets actually ran, actually reached the CMDB as the user,
// and actually handed back a legible result. A single combined turn would have
// let the create response supply the key and proved nothing about the search.
//
// FIXTURES ARE DELETED BY THE HARNESS, NOT THE APP. `delete:cmdb-object:jira`
// is deliberately NOT in the manifest, so ChatWise cannot remove what it makes;
// the harness's own token can, and the deletion is verified by reading the
// object back and requiring a 404.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  GLOBAL_APP,
  callResolver,
  openGlobalPage,
  skipIfQuotaBlocked,
  waitForChatApp,
} from "./chatwise-support";
// eslint-disable-next-line
import { aql, assets, deleteObject, findSimpleObjectType, getObject } from "../../data/assets.mjs";

/** Enqueue one turn and wait for the job row to reach a terminal state. */
async function ask(frame: any, page: any, conversationId: string, message: string) {
  const sent = await callResolver<any>(frame, GLOBAL_APP, "chat", {
    conversationId,
    message,
    personaId: "jira-scrubber",
    personaLocked: true,
  });
  expect(sent?.success, `enqueue failed: ${sent?.error}`).toBeTruthy();
  let data: any = null;
  const deadline = Date.now() + 420_000;
  while (Date.now() < deadline) {
    const r = await callResolver<any>(frame, GLOBAL_APP, "getJobStatus", { jobId: sent.jobId });
    data = r?.data ?? null;
    if (data && ["completed", "failed", "cancelled"].includes(data.status)) break;
    await page.waitForTimeout(3000);
  }
  expect(data?.status, `job did not complete: ${data?.error}`).toBe("completed");
  const reply = String(data.result?.response || "");
  console.log(
    `[assets] model=${data.result?.model} iterations=${data.result?.iterations} ` +
      `usage=${JSON.stringify(data.result?.usage)}`,
  );
  return reply;
}

test.describe.configure({ timeout: 900_000 });

test("createAssetObject writes a real CMDB object, and searchAssets reads it back by NAME", async ({
  page,
}) => {
  test.setTimeout(900_000);
  const T = getTarget("chatwise-global");
  const stamp = Date.now();
  const CANARY = `harness-asset-${stamp}`;
  const convCreate = `conv_harness_assets_c_${stamp}`;
  const convSearch = `conv_harness_assets_s_${stamp}`;
  let frame: any = null;
  let objectId: string | null = null;

  try {
    // ---- WHAT THIS SITE ACTUALLY HAS ---------------------------------------
    const type = await findSimpleObjectType();
    console.log(`[assets] writing into ${type.schemaName} / ${type.typeName} (type ${type.typeId})`);

    // A pre-check that makes a later empty result readable: the canary must NOT
    // exist before the turn. An empty AQL result and "the app never wrote"
    // otherwise look identical, and a negative that licences a conclusion has
    // to be proven on the SAME object.
    const pre = await aql(`objectType = "${type.typeName}" AND Name = "${CANARY}"`);
    expect(pre.status, `pre-check AQL failed: ${pre.text.slice(0, 200)}`).toBe(200);
    expect(pre.body?.values?.length, "the canary name already exists in Assets").toBe(0);

    frame = await openGlobalPage(page, T);
    await waitForChatApp(page, frame, GLOBAL_APP, 120_000);
    await callResolver(frame, GLOBAL_APP, "createConversation", {
      conversationId: convCreate,
      title: "[harness-test] assets create",
      personaId: "jira-scrubber",
    });

    // ---- TURN 1: CREATE ----------------------------------------------------
    const createReply = await ask(
      frame,
      page,
      convCreate,
      `In Jira Assets, create ONE object of type "${type.typeName}" in the ` +
        `"${type.schemaName}" object schema, with its Name set to exactly ${CANARY}. ` +
        `Do it now; do not ask me to confirm. Then tell me it is done.`,
    );
    console.log(`[assets] create reply: ${createReply.slice(0, 400)}`);
    skipIfQuotaBlocked(createReply, "assets-tools/create");

    // ---- GROUND TRUTH: the harness's own AQL, not the app's reply ----------
    const found = await aql(`objectType = "${type.typeName}" AND Name = "${CANARY}"`);
    expect(found.status, `ground-truth AQL failed: ${found.text.slice(0, 200)}`).toBe(200);
    const rows: any[] = found.body?.values || [];
    expect(
      rows.length,
      `createAssetObject did not write anything Assets can find. The app replied: ` +
        `"${createReply.slice(0, 500)}". If that reply says Assets is unavailable, the ` +
        `finding is that asUser cannot reach the CMDB with the manifest's scopes — which ` +
        `is a product report, not a harness failure.`,
    ).toBe(1);

    const created = rows[0];
    objectId = String(created.id);
    const objectKey: string = created.objectKey;
    console.log(`[assets] Assets minted ${objectKey} (id ${objectId}) label="${created.label}"`);
    expect(objectKey, "the created object has no object key").toMatch(/^[A-Z0-9]+-\d+$/);
    expect(created.label, "the Name attribute did not survive the write").toBe(CANARY);

    // And the object really is of the type we asked for — a write into the
    // wrong type would satisfy a name match and be a completely different bug.
    const full = await getObject(objectId);
    expect(full.status).toBe(200);
    expect(String(full.body?.objectType?.id), "the object landed in the wrong object type").toBe(
      type.typeId,
    );

    // ---- TURN 2: SEARCH, IN A CONVERSATION THAT HAS NEVER SEEN THE KEY -----
    await callResolver(frame, GLOBAL_APP, "createConversation", {
      conversationId: convSearch,
      title: "[harness-test] assets search",
      personaId: "jira-scrubber",
    });
    const searchReply = await ask(
      frame,
      page,
      convSearch,
      `Search Jira Assets using this AQL exactly: objectType = "${type.typeName}" AND ` +
        `Name = "${CANARY}". Report the object KEY of every match, verbatim. If there are ` +
        `no matches, say so.`,
    );
    console.log(`[assets] search reply: ${searchReply.slice(0, 600)}`);
    skipIfQuotaBlocked(searchReply, "assets-tools/search");

    // THE ASSERTION. This conversation was created seconds ago and has no
    // history; the key was minted by Assets during turn 1, in a different
    // conversation. It can only be in this reply if searchAssets ran, reached
    // the CMDB as the user, and returned something legible.
    expect(
      searchReply,
      `the reply does not contain ${objectKey}, the key Assets minted for the object this run ` +
        `created. The object EXISTS (verified by the harness's own AQL), so either searchAssets ` +
        `was never called, or it was refused, or its result reached the model unnamed. Reply was: ` +
        `"${searchReply.slice(0, 600)}"`,
    ).toContain(objectKey);
  } finally {
    // The app cannot clean this up: delete:cmdb-object:jira is deliberately not
    // in the manifest. The harness's own token can, and the deletion is
    // VERIFIED rather than assumed.
    if (objectId) {
      const del = await deleteObject(objectId);
      const back = await getObject(objectId);
      if (back.status !== 404) {
        console.warn(
          `[cleanup] ASSETS OBJECT ${objectId} SURVIVED: delete answered ${del.status}, ` +
            `read-back answered ${back.status}. It is still in the CMDB.`,
        );
      } else {
        console.log(`[cleanup] assets object ${objectId} deleted (read-back 404)`);
      }
    }
    if (frame) {
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId: convCreate }).catch(() => {});
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId: convSearch }).catch(() => {});
    }
  }
});
