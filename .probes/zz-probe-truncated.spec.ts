// TESTER PROBE — v6.98.0 ITEM 1: does the `truncated` chip survive a restore?
// Driven through the DEPLOYED ChatInterface's restore branch with a row shaped
// exactly like one asyncConsumer commits for a max_iterations turn on a persona
// with no skills and no compaction/quota note.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, assertLoggedIn, openGlobalPage, waitForChatApp, callResolver } from "./chatwise-support";
const T = getTarget("chatwise-global");
test.describe.configure({ timeout: 300_000 });

test("PROBE truncated: the restore branch on the deployed bundle", async ({ page }) => {
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  const p = await callResolver<any>(frame, GLOBAL_APP, "getPersonas", {});
  console.log("PERSONA skillIds: " + JSON.stringify((p.personas || []).map((x: any) => ({ id: x.id, skills: x.skillIds }))));

  const r = await frame.locator("body").evaluate((_e, k) => {
    const chat = (window as any)[k].components.chat;
    const out: any = {};
    const run = (label: string, row: any) => {
      chat.messages = [];
      chat.renderMessages();
      chat.addMessage({ type: "ai", streaming: false, content: "A cut-off answer that stops mid-", ...row });
      const meta = document.querySelector("#chatMessages .message-meta");
      out[label] = {
        metaRowDrawn: !!meta,
        text: (meta?.textContent || "").replace(/\s+/g, " ").trim(),
        truncatedChip: /truncated/.test(meta?.textContent || ""),
      };
    };
    // A max_iterations turn: truncated true, no skills, no contextNote.
    run("truncated only", { model: "claude-haiku-4-5-20251001", usage: { total_tokens: 4200 }, iterations: 8,
      truncated: true, skillsUsed: null, contextNote: null });
    // The same turn with a skills chip (the shape most personas produce).
    run("truncated + skills", { model: "claude-haiku-4-5-20251001", usage: { total_tokens: 4200 }, iterations: 8,
      truncated: true, skillsUsed: ["chatwise-jira-conventions"], contextNote: null });
    // A plain restored turn: model + tokens only.
    run("plain turn", { model: "claude-haiku-4-5-20251001", usage: { total_tokens: 900 }, iterations: 1,
      truncated: false, skillsUsed: null, contextNote: null });
    chat.messages = [];
    chat.renderMessages();
    return out;
  }, GLOBAL_APP);
  console.log("RESTORE BRANCH RESULT:\n" + JSON.stringify(r, null, 2));
});
