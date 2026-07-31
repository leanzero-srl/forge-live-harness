// LIVE BEHAVIOUR: the ISSUE PANEL's persona dropdown offers the right personas
// — including Product Owner, which was only just added there — and a chosen
// persona SURVIVES a reload.
//
// Why the offer matters: `product-owner` is the only persona with
// `wizardEnabled`, and the issue panel is the only surface that sends an
// issueKey. While it was missing from ISSUE_PANEL_FACTORY_PERSONAS
// (Constants.js:140) two whole branches of the Epic Facilitator were
// unreachable in practice — deriving the target project from the originating
// issue, and linking the created Epic back to it. A render smoke cannot see
// that; the dropdown mounts either way.
//
// Why persistence matters: the persona decides the system prompt AND the model
// tier for every turn (asyncConsumer.js resolves `persona.modelSettings`). A
// choice that silently reverts on reload means the user's next question is
// answered by a different assistant than the one they picked, with no signal
// at all.
//
// This runs against a FRESH Jira issue so the panel's conversation
// (`issue-<KEY>`) starts empty — which is exactly the state a real user is in
// the first time they open the panel and pick a persona.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { createIssue, deleteIssue } from "../../data/jira-build.mjs";
import {
  BASE_URL, PANEL_APP, assertLoggedIn, callResolver, openPanel, readAppState,
  setRecorderTarget, waitForChatApp, watchNoise,
} from "./chatwise-support";

const T = getTarget("chatwise-issue-panel");
const PROJECT = process.env.CHATWISE_TEST_PROJECT || "WFH";
const ISSUE_TYPE = process.env.CHATWISE_TEST_ISSUE_TYPE || "Work package";

/** ISSUE_PANEL_FACTORY_PERSONAS (Constants.js:140) → their display names. */
const EXPECTED = [
  { id: "jira-scrubber", name: "JIRA Scrubber" },
  { id: "epic-master", name: "Epic Master" },
  { id: "product-owner", name: "Product Owner" },
];
/** Global-page-only persona — must NOT be offered in the panel. */
const NOT_OFFERED = { id: "coffee-break-ai", name: "Coffee Break AI" };
const PICK = EXPECTED[2]; // Product Owner — the newly added one

test.describe.configure({ retries: 1, timeout: 300_000 });

test("ChatWise issue panel — persona dropdown offers Product Owner and the choice survives a reload", async ({ page, recorder }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved — run `npm run discover` or set it in .env.");

  const noise = watchNoise(page);
  let issueKey: string | null = null;

  try {
    await assertLoggedIn(page);

    const created = await createIssue({
      projectKey: PROJECT,
      issueType: ISSUE_TYPE,
      summary: `ChatWise persona switch [harness-test] ${new Date().toISOString()}`,
    });
    issueKey = created?.key;
    expect(issueKey, "the fixture issue must be created").toBeTruthy();
    test.info().annotations.push({ type: "fixture", description: `issue ${issueKey}` });
    setRecorderTarget(recorder, T, `${BASE_URL}/browse/${issueKey}`);

    let frame = await openPanel(page, T, issueKey!, recorder);
    await recorder.step("issue panel boots on a fresh issue", async () => {
      await waitForChatApp(page, frame, PANEL_APP);
    }, {
      action: "navigate + expand the AI Assistant glance",
      expectation: {
        assertion: "window.chatWiseIssuePanel exists",
        narrative: "The panel is interactive before anything is asserted about its dropdown.",
      },
    });

    await recorder.step("the dropdown offers exactly the three issue-panel personas", async () => {
      await frame.locator("#dropdownSelected").click();
      const options = frame.locator("#dropdownOptions .dropdown-option");
      await expect(options.first()).toBeVisible({ timeout: 15_000 });

      const offered = await frame.locator("body").evaluate(() =>
        Array.from(document.querySelectorAll("#dropdownOptions .dropdown-option")).map((el) => ({
          id: (el as HTMLElement).dataset.personaId || "",
          text: (el.querySelector(".option-text")?.textContent || "").trim(),
        })),
      );
      test.info().annotations.push({ type: "personas", description: JSON.stringify(offered) });

      const ids = offered.map((o) => o.id);
      for (const want of EXPECTED) {
        expect(ids, `"${want.name}" (${want.id}) must be offered in the issue panel`).toContain(want.id);
        expect(offered.find((o) => o.id === want.id)?.text, `label for ${want.id}`).toBe(want.name);
      }
      // The negative half: a persona scoped to the global page must not leak in.
      // Without this the assertion above would pass on "the dropdown lists
      // everything", which is a different (and wrong) behaviour.
      expect(ids, `"${NOT_OFFERED.name}" is a global-page persona and must not be offered here`)
        .not.toContain(NOT_OFFERED.id);
    }, {
      action: "click #dropdownSelected",
      expectation: {
        assertion: "the option list is exactly [JIRA Scrubber, Epic Master, Product Owner]",
        narrative: "The Product Owner / Epic Facilitator is reachable from the only surface that can feed it an issue, and global-page-only personas stay out.",
      },
    });

    await recorder.step(`select "${PICK.name}"`, async () => {
      await frame.locator(`#dropdownOptions .dropdown-option[data-persona-id="${PICK.id}"]`).click();
      await expect(frame.locator("#dropdownSelected .selected-text")).toHaveText(PICK.name, { timeout: 10_000 });
      const live = await readAppState<string | null>(
        frame, PANEL_APP, "app.services.persona?.getSelectedPersonaId?.() || null",
      );
      expect(live, "the persona SERVICE must agree with the pill, not just the label").toBe(PICK.id);
      // Give the saveConversationPersona invoke time to land before reloading —
      // otherwise a failure below could be "the write was still in flight"
      // rather than "the write does not persist".
      await page.waitForTimeout(4_000);
    }, {
      action: "click the Product Owner option",
      expectation: {
        assertion: "the selected-persona pill and the persona service both report product-owner",
        narrative: "The selection takes effect in the running app.",
      },
    });

    // Diagnostic, deliberately NON-fatal: it records what the BACKEND actually
    // stored, so a failure of the reload assertion below points straight at the
    // layer that lost the choice instead of just saying "it reverted".
    let stored = "<not read>";
    await recorder.step("(diagnostic) what did the backend store?", async () => {
      const conv = await callResolver<{ success?: boolean; data?: { personaId?: string } }>(
        frame, PANEL_APP, "getConversation", { conversationId: `issue-${issueKey}` },
      ).catch(() => null);
      stored = JSON.stringify(conv?.data ?? conv);
      test.info().annotations.push({ type: "stored-conversation", description: stored });
    }, {
      expectation: {
        assertion: "getConversation answers (its personaId is the evidence for the next step)",
        narrative: "Separates 'the UI forgot' from 'the backend never stored it'.",
      },
    });

    await recorder.step("RELOAD — the chosen persona is still selected", async () => {
      frame = await openPanel(page, T, issueKey!, recorder);
      await waitForChatApp(page, frame, PANEL_APP);
      // Poll: loadPersonas() sets the DEFAULT first and loadConversation()
      // overwrites it afterwards, so reading once can catch the intermediate
      // state. Waiting for the app instance already implies both have run
      // (init awaits them), but the poll makes the failure honest either way.
      const deadline = Date.now() + 20_000;
      let selected = "";
      let live: string | null = null;
      for (;;) {
        selected = (await frame.locator("#dropdownSelected .selected-text").textContent().catch(() => ""))?.trim() || "";
        live = await readAppState<string | null>(
          frame, PANEL_APP, "app.services.persona?.getSelectedPersonaId?.() || null",
        ).catch(() => null);
        if (live === PICK.id || Date.now() > deadline) break;
        await page.waitForTimeout(1_000);
      }
      expect(
        live,
        `after the reload the panel is running persona "${live}" (pill shows "${selected}") — the user's choice of ` +
          `"${PICK.name}" did not survive. The persona decides the system prompt AND the model tier for every turn, ` +
          `so the next question is silently answered by a different assistant.\n` +
          `  backend state for issue-${issueKey} at the moment of reload: ${stored}\n` +
          `  (a stored conversation with no personaId means saveConversationPersona never wrote it)`,
      ).toBe(PICK.id);
      expect(selected, "the pill must show the restored persona").toBe(PICK.name);
    }, {
      expectation: {
        assertion: "after a full reload the panel still runs the persona the user chose",
        narrative: "A persona choice is a real setting, not a per-page-view whim — the next question is answered by the assistant the user picked.",
      },
    });

    await recorder.step("no console errors, uncaught exceptions or failed invokes", async () => {
      const report = noise.report();
      expect(report, `unexpected browser errors during the persona switch:\n${report}`).toBe("");
    }, {
      expectation: {
        assertion: "the persona switch produces no app-level browser error",
        narrative: "The selection path is clean.",
      },
    });
  } finally {
    if (issueKey) {
      await deleteIssue(issueKey).catch(() => {});
      test.info().annotations.push({ type: "cleanup", description: `deleted issue ${issueKey}` });
    }
  }
});
