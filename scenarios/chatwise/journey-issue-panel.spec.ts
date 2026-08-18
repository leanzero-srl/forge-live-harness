// JOURNEY: the issue panel, driven as a user on a real Jira issue.
//
// The panel had render + persistence + stop coverage, but three of its
// distinctive behaviours had never run live: uploads INSIDE the panel (the
// paperclip and chips only ever ran in the offline stub), the persona locking
// after the first message, and the attachment tools — the model reading a file
// off the issue itself, which is the panel's headline trick.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  BASE_URL, PANEL_APP, callResolver, openPanel, waitForChatApp,
} from "./chatwise-support";
// eslint-disable-next-line
import { get, post, del } from "../../data/jira.mjs";

const T = getTarget("chatwise-issue-panel");
const PROJECT = process.env.CHATWISE_TEST_PROJECT || "WFH";

test.describe.configure({ timeout: 600_000 });

test("issue panel journey: boot, in-panel upload, attachment read, persona lock", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved — run `npm run discover`.");

  const stamp = Date.now();
  let issueKey: string | null = null;
  let conversationId: string | null = null;
  let frame: Awaited<ReturnType<typeof openPanel>> | null = null;

  try {
    // ---- Seed an issue WITH an attachment, via REST ------------------------
    const meta: any = await get(`/rest/api/3/issue/createmeta/${PROJECT}/issuetypes?maxResults=200`);
    const std = (meta?.issueTypes || meta?.values || []).find((t: any) => t.hierarchyLevel === 0);
    const made: any = await post("/rest/api/3/issue", {
      fields: {
        project: { key: PROJECT },
        issuetype: { id: String(std.id) },
        summary: `[harness-test] panel journey ${stamp}`,
        labels: ["harness-test"],
      },
    });
    issueKey = made.key;

    // Native fetch with the harness's own API credentials. The browser-session
    // route (page.request) answered 404 — Jira Cloud's XSRF handling does not
    // accept cookie-authenticated multipart from outside its own UI — while
    // Basic auth with the API token is the documented path for attachments.
    const canary = `QUOKKA-${stamp}`;
    const form = new FormData();
    form.append(
      "file",
      new Blob([`# Briefing\n\nThe code word for this issue is ${canary}.\n`], { type: "text/markdown" }),
      "briefing.md",
    );
    const auth = Buffer.from(
      `${process.env.JIRA_ADMIN_EMAIL}:${process.env.JIRA_API_TOKEN}`,
    ).toString("base64");
    const up = await fetch(`${BASE_URL}/rest/api/3/issue/${issueKey}/attachments`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "X-Atlassian-Token": "no-check" },
      body: form,
    });
    expect(up.ok, `attachment upload failed: ${up.status} ${await up.text().catch(() => "")}`).toBeTruthy();

    // ---- Open the panel on that issue --------------------------------------
    frame = await openPanel(page, T, issueKey!);
    await waitForChatApp(page, frame, PANEL_APP);
    conversationId = `issue-${issueKey}`;

    // Persona dropdown is live before the first message…
    await expect(frame.locator("#personaDropdown")).not.toHaveClass(/disabled|locked/);

    // ---- Paperclip upload INSIDE the panel ---------------------------------
    await frame.locator("#attachFileInput").setInputFiles({
      name: `panel-note-${stamp}.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from(`Panel-side note. Shared-file canary: WOMBAT-${stamp}.`),
    });
    const chip = frame.locator(`#attachmentRow .attachment-chip[data-filename="panel-note-${stamp}.txt"]`);
    await expect(chip, "no chip for the in-panel upload").toBeVisible({ timeout: 60_000 });
    await expect(chip.locator(".chip-meta")).toContainText("chars");

    // ---- Ask the model to read the ISSUE ATTACHMENT (live turn) ------------
    await frame.locator("#chatInput").fill(
      "Read the file attached to this issue and reply with ONLY the code word it contains. No other words.",
    );
    await frame.locator("#sendButton").click();

    await expect
      .poll(async () => frame!.locator(".message.assistant").count(), { timeout: 300_000 })
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(async () =>
        readStreaming(frame!),
        { timeout: 60_000 })
      .toBe(false);
    const reply = (await frame.locator(".message.assistant").last().textContent()) || "";
    expect(
      reply,
      "the model could not read the issue attachment — listIssueAttachments/readAttachment broke",
    ).toContain(canary);

    // ---- Persona locks once the thread has messages ------------------------
    await expect(frame.locator("#personaDropdown")).toHaveClass(/disabled|locked/);
  } finally {
    if (frame && conversationId) {
      await callResolver(frame, PANEL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
    if (issueKey) await del(`/rest/api/3/issue/${issueKey}?deleteSubtasks=true`).catch(() => {});
  }
});

async function readStreaming(frame: Awaited<ReturnType<typeof openPanel>>): Promise<boolean> {
  return frame
    .locator("body")
    .evaluate((_el, key) => {
      const app = (window as any)[key];
      return !!app?.components?.chat?.isStreaming;
    }, PANEL_APP);
}
