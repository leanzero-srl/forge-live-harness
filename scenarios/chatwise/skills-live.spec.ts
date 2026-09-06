// LIVE: SKILLS — the admin roster, and a skill's direction ACTUALLY REACHING
// the model's answer.
//
// WHY THIS EXISTS
// ---------------
// The whole Skills feature shipped with no live spec. Two things needed one:
//
//   THE ADMIN TAB. It is the only place a site skill can be switched off or
//   bound to a persona, so a roster that renders the wrong rows is not cosmetic
//   — it is a lever that cannot be reached.
//
//   THE DIRECTION. `loadSkill` puts a skill's brief into the SYSTEM PROMPT of
//   the turn it runs in, via a `directionRequest` the agent loop acts on. The
//   tool result itself carries almost nothing, so "the tool returned success"
//   proves nothing whatsoever about whether the direction applied. The only
//   honest test is to ask for something that ONLY the skill states, and check
//   the answer contains it.
//
// THE CANARIES ARE READ OUT OF THE SKILL, NOT INVENTED. From
// src/shared/skills/builtins/diconiumBrand.js: hero accent `#FF5000`,
// secondary `#581F9D`, a phase-2 blue `#003E96` that is defined and explicitly
// NOT to be used yet, and a hard 30-CHARACTER ceiling above which a primary
// headline may not be set in CAPS. The blue is the strongest of them: a colour
// a brand has decided not to use is not a thing a model reproduces from
// anywhere except this skill's text.
//
// AND `skillsUsed` IS THE PROOF THE TOOL RAN. `direction.loadedIds()` returns
// every skill composed into the turn, which includes the persona's BOUND ones —
// so an id that a persona binds would prove nothing. `diconium-brand` is bound
// by NO factory persona (jira-scrubber binds chatwise-jira-conventions and
// chatwise-jira-reporting), which is exactly why it is the one used here.
import { test, expect } from "../../fixtures/forge";
import type { Page, FrameLocator, Locator } from "@playwright/test";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import {
  GLOBAL_APP,
  callResolver,
  openGlobalPage,
  skipIfQuotaBlocked,
  waitForChatApp,
} from "./chatwise-support";

const T = getTarget("chatwise-admin");
const CHAT = getTarget("chatwise-global");

type Root = Page | FrameLocator;
const PROBE_TAB = "Beta access";

function tabLocator(root: Root, name: string): Locator {
  return root.getByRole("tab", { name, exact: true }).first();
}

async function resolveAdminRoot(page: Page, timeout = 40_000): Promise<Root> {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await tabLocator(page, PROBE_TAB).isVisible({ timeout: 500 }).catch(() => false)) return page;
    const frames = await page.locator("iframe").count().catch(() => 0);
    for (let i = 0; i < frames; i++) {
      const fl = page.locator("iframe").nth(i).contentFrame();
      if (await tabLocator(fl, PROBE_TAB).isVisible({ timeout: 500 }).catch(() => false)) return fl;
    }
    if (Date.now() > deadline) throw new Error("admin page never rendered its tabs");
    await page.waitForTimeout(500);
  }
}

/** The roster as the BACKEND states it — the odometer for both admin tests. */
async function readRoster(page: Page) {
  const p = await page.context().newPage();
  try {
    const frame = await openGlobalPage(p, CHAT);
    await waitForChatApp(p, frame, GLOBAL_APP, 120_000);
    const r = await callResolver<any>(frame, GLOBAL_APP, "getSkills");
    expect(r?.success, `getSkills failed: ${JSON.stringify(r)}`).toBe(true);
    return (r.skills || []) as any[];
  } finally {
    await p.close().catch(() => {});
  }
}

async function openSkillsTab(page: Page): Promise<Root> {
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  const root = await resolveAdminRoot(page);
  await tabLocator(root, "Skills").click();
  // The tab fetches getSkills AND getEnhancedPersonas before it paints rows;
  // "Loading skills..." is on screen for several seconds on a cold page.
  await expect(root.getByRole("heading", { name: "Site-wide skills", exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(root.getByText("Loading skills...")).toHaveCount(0, { timeout: 60_000 });
  return root;
}

test.describe.configure({ timeout: 600_000 });

test("the admin Skills tab lists every built-in skill the backend reports", async ({ page }) => {
  test.skip(!T.envId || !CHAT.envId, "env ids unresolved — run `npm run discover`.");

  const roster = await readRoster(page);
  const builtins = roster.filter((s) => s.builtin === true);
  console.log(
    `[skills] backend roster: ${roster
      .map((s) => `${s.id}(builtin=${s.builtin},visibility=${s.visibility},enabled=${s.enabled})`)
      .join(" ")}`,
  );
  expect(builtins.length, "the backend reports no built-in skills at all").toBeGreaterThanOrEqual(3);
  // The one every other assertion in this file depends on.
  expect(
    builtins.map((s) => s.id),
    "diconium-brand is not in the built-in roster",
  ).toContain("diconium-brand");

  // THE TWO ADMINISTRATION SKILLS ARE THE COST GATE, NOT DECORATION.
  //
  // `allowJiraAdminTools` is decided from the built-in admin skill a persona
  // BINDS (ADMIN_BUILTIN_SKILL_IDS), never from a persona field — so a skill
  // that fell out of the built-in roster would close the admin tool surface on
  // both admin personas and the only symptom would be a persona that answers
  // configuration questions from memory. The organisation skill is the newer of
  // the two and carries four references; both must be here.
  for (const id of ["chatwise-jira-administration", "chatwise-jira-org-administration"]) {
    expect(
      builtins.map((s) => s.id),
      `${id} is not in the built-in skill roster. The admin capability gate is derived from the ` +
        `bound built-in skill id, so a missing skill silently closes the admin tools.`,
    ).toContain(id);
  }

  const root = await openSkillsTab(page);
  for (const s of builtins) {
    await expect(
      root.getByText(s.name, { exact: true }).first(),
      `built-in skill "${s.name}" (${s.id}) is in the backend roster and nowhere on the Skills tab`,
    ).toBeVisible({ timeout: 20_000 });
  }
});

/**
 * KNOWN RED ON v6.102.0 — this pins a CONFIRMED, MEASURED defect. Do not
 * "fix" it by weakening the assertion.
 *
 * `toRow()` in src/shared/routes/skills.routes.js:72 puts the stored `scope`
 * on the wire under the name `visibility`:
 *
 *     visibility: row.scope,
 *
 * and `SkillsTab` in src/admin-uikit/src/index.jsx:1566-1567 filters on a field
 * that is never sent:
 *
 *     const siteSkills = rows.filter((s) => s.scope === "site");
 *     const pending    = rows.filter((s) => s.scope !== "site");
 *
 * `s.scope` is `undefined` for every row, so `siteSkills` is ALWAYS EMPTY and
 * `pending` is ALWAYS EVERYTHING. Measured on the deployed admin page,
 * 5 Sep 2026: "Site-wide skills / 0 published / Nothing is published yet",
 * with all four site-scoped, enabled, ownerless built-ins listed underneath as
 * "Written by users, awaiting promotion / 4 private", each marked Private and
 * offered a Promote button.
 *
 * It is not cosmetic. Everything that acts on a site skill renders only inside
 * the `siteSkills` branch: the enable/disable Toggle, the Reset button, the
 * "Built in" lozenge, and the whole persona-binding list ("There is nothing
 * site-wide to bind yet"). So the admin cannot switch a site skill off and
 * cannot bind one to a persona, while the backend routes that do both are
 * live. This is the same field-name-mismatch class the comment three lines
 * above `visibility:` already warns about, one hop further along.
 */
test("a site-scoped skill is presented as SITE-WIDE, not as somebody's private draft", async ({
  page,
}) => {
  test.skip(!T.envId || !CHAT.envId, "env ids unresolved — run `npm run discover`.");

  const roster = await readRoster(page);
  const site = roster.filter((s) => s.visibility === "site");
  expect(site.length, "no site-scoped skills on this install — nothing to assert").toBeGreaterThan(0);

  const root = await openSkillsTab(page);

  // The count the admin reads. "0 published" beside four published skills is
  // the whole defect in one string.
  await expect(
    root.getByText(`${site.length} published`, { exact: true }),
    `the backend reports ${site.length} site-scoped skill(s) and the Site-wide card does not ` +
      `say so. See this test's header: SkillsTab filters on \`s.scope\`, which the wire never ` +
      `carries — getSkills sends the same value as \`visibility\`.`,
  ).toBeVisible({ timeout: 20_000 });

  await expect(
    root.getByText("Nothing is published yet.", { exact: false }),
    "the Site-wide roster claims it is empty while site-scoped skills exist",
  ).toHaveCount(0);

  // And no site skill is offered PROMOTION — promoting an already-published
  // skill is an action with no meaning, offered on every one of them.
  const promoteButtons = await root.getByRole("button", { name: /^Promote$/ }).count();
  expect(
    promoteButtons,
    `${promoteButtons} "Promote" button(s) are on screen. A site-wide skill has nowhere to be ` +
      `promoted to; each one that appears here is a site skill that landed in the private queue.`,
  ).toBe(roster.length - site.length);
});

test("loadSkill applies the skill's OWN direction, not a plausible summary of it", async ({
  page,
}) => {
  test.setTimeout(900_000);
  const stamp = Date.now();
  const conversationId = `conv_harness_skill_${stamp}`;
  let frame: any = null;

  try {
    frame = await openGlobalPage(page, CHAT);
    await waitForChatApp(page, frame, GLOBAL_APP, 120_000);
    await callResolver(frame, GLOBAL_APP, "createConversation", {
      conversationId,
      title: "[harness-test] skills direction",
      personaId: "jira-scrubber",
    });

    const sent = await callResolver<any>(frame, GLOBAL_APP, "chat", {
      conversationId,
      message:
        "I am restyling a slide deck for diconium and I need the brand rules this site holds, " +
        "not general advice. Answer with: the hero accent colour as a hex value; the secondary " +
        "colour as a hex value; the colour that is in the palette but explicitly must NOT be " +
        "used yet, with its hex; and the exact maximum number of characters a primary headline " +
        "may have and still be set in CAPS.",
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
      `[skills] model=${data.result?.model} iterations=${data.result?.iterations} ` +
        `skillsUsed=${JSON.stringify(data.result?.skillsUsed)} ` +
        `usage=${JSON.stringify(data.result?.usage)}`,
    );
    console.log(`[skills] reply:\n${reply.slice(0, 1200)}`);
    skipIfQuotaBlocked(reply, "skills-live/direction");

    // ---- THE TOOL RAN ------------------------------------------------------
    const used: string[] = data.result?.skillsUsed || [];
    expect(
      used,
      `skillsUsed does not name diconium-brand, so loadSkill never ran for this turn. No factory ` +
        `persona binds that skill, so it can only be there because the model chose it. ` +
        `skillsUsed was ${JSON.stringify(used)}.`,
    ).toContain("diconium-brand");

    // ---- AND ITS DIRECTION REACHED THE ANSWER ------------------------------
    // Each of these is stated ONLY in diconiumBrand.js. A reply that mentions
    // diconium, or talks about orange, or says "keep headlines short" satisfies
    // none of them.
    expect(reply.toUpperCase(), "the hero accent hex #FF5000 is not in the reply").toContain("#FF5000");
    expect(reply.toUpperCase(), "the secondary hex #581F9D is not in the reply").toContain("#581F9D");
    expect(
      reply.toUpperCase(),
      "the phase-2 blue #003E96 — a colour the brand has decided NOT to use, which is stated " +
        "nowhere but this skill — is not in the reply",
    ).toContain("#003E96");
    expect(reply, "the reply does not name the 30-character CAPS ceiling").toMatch(/\b30\b/);
    expect(reply, "the reply never mentions CAPS at all").toMatch(/CAPS/i);

    // ---- THE USER CAN SEE THAT A SKILL WAS USED ---------------------------
    // The chip label truncates past two skills ("skills: a, b +1"), so the full
    // list lives in the title attribute — which is what a hover shows and what
    // has to be asserted.
    await page.reload({ waitUntil: "domcontentloaded" });
    frame = await openGlobalPage(page, CHAT);
    await waitForChatApp(page, frame, GLOBAL_APP, 120_000);
    await frame
      .locator(`#conversationsList .conversation-item[data-conversation-id="${conversationId}"]`)
      .click();
    const chip = frame.locator("#chatMessages .message.assistant .message-meta-chip.skills").last();
    await expect(
      chip,
      "the restored turn has no skills chip, so nothing tells the user which direction shaped it",
    ).toBeVisible({ timeout: 30_000 });
    await expect(chip).toContainText(/^skills:/);
    expect(
      await chip.getAttribute("title"),
      "the skills chip does not name diconium-brand even in its tooltip",
    ).toContain("diconium-brand");
  } finally {
    if (frame) {
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
  }
});

/**
 * THE TOGGLE IS THE LEVER THAT HAD NEVER RENDERED — so now that it does, the
 * question is whether it WORKS, both ways, for this reader.
 *
 * Two separate things could still be wrong behind a control that finally
 * appears, and only a live round trip tells them apart:
 *
 *   1. `setSkillEnabled` asks `probeSiteAdmin(accountId)` and hands the answer
 *      to the store, which refuses a non-admin's write to the SHARED row. If
 *      the probe says false for this account the click does nothing and the
 *      page flashes an error — a refusal, not a bug, and the refusal text is
 *      the finding. (It was ungated until 03f7ebc: any beta user could switch
 *      a site skill off for the whole site.)
 *
 *   2. OFF MUST BE REVERSIBLE. `getSkills` used to build its answer from
 *      `listSkillsForTurn`, which drops `enabled !== false` because that list
 *      is what the MODEL is offered — so a skill switched off vanished from
 *      the only page that could switch it back on. A one-way door. The row
 *      staying on the list, wearing the solid-red Disabled lozenge, is the
 *      whole proof, and the lozenge had never once appeared.
 *
 * GROUND TRUTH IS `getSkills`, read from a chat surface, both ways. The card's
 * own state is optimistic and would round-trip against itself.
 *
 * `diconium-brand` is the subject because no factory persona binds it, so a
 * failed restore cannot silently change what another spec's model turn is told.
 */
test("an admin can switch a site skill OFF and back ON, and OFF is not a one-way door", async ({
  page,
}) => {
  test.skip(!T.envId || !CHAT.envId, "env ids unresolved — run `npm run discover`.");
  const SUBJECT = "diconium-brand";
  let flipped = false;

  const readOne = async () => {
    const roster = await readRoster(page);
    const row = roster.find((s) => s.id === SUBJECT);
    expect(row, `${SUBJECT} is not in the roster at all`).toBeTruthy();
    return row;
  };

  try {
    const before = await readOne();
    expect(before.visibility, `${SUBJECT} is not site-scoped, so this tab does not own it`).toBe("site");
    expect(
      before.enabled,
      `${SUBJECT} is already disabled on this install — restore it before running this spec, or ` +
        `the OFF assertion below would pass without anything being switched.`,
    ).not.toBe(false);

    const root = await openSkillsTab(page);
    // Forge drops the `forge-app-<hash>-` id prefix after the first re-render,
    // so the selector anchors on the BARE name and matches both shapes.
    const toggle = root.locator(`input[type="checkbox"][id$="skill-on-${SUBJECT}"]`).first();
    await expect(
      toggle,
      `no enable/disable toggle for ${SUBJECT}. Every control on a site skill renders inside the ` +
        `siteSkills branch — an absent toggle means the row landed in the private queue again.`,
    ).toBeVisible({ timeout: 30_000 });
    expect(await toggle.isChecked(), "the toggle does not reflect enabled=true").toBe(true);

    // ---- OFF ---------------------------------------------------------------
    // Atlaskit hides the real input under a styled track.
    await toggle.click({ force: true });
    flipped = true;

    // THE ROW STAYS, AND IT SAYS SO. "Disabled" is rendered by exactly one
    // element in this tab (the solid-red Lozenge on a site row), so a count of
    // one is a scoped assertion without needing to walk the row.
    await expect(
      root.getByText("Disabled", { exact: true }),
      "the skill was switched off and nothing on the page says so — the Disabled lozenge is the " +
        "only thing that renders that state, and it is inside the site-wide roster",
    ).toHaveCount(1, { timeout: 30_000 });
    await expect(
      root.getByText(before.name, { exact: true }).first(),
      "the disabled skill DROPPED OFF the roster. That is the one-way door: the only page that " +
        "can switch it back on no longer lists it.",
    ).toBeVisible();

    const off = await readOne();
    expect(
      off.enabled,
      `the click did not reach storage: getSkills still reports enabled=${off.enabled}. If the ` +
        `page flashed a refusal, probeSiteAdmin answered false for the harness account and this ` +
        `is a permission finding rather than a broken toggle.`,
    ).toBe(false);

    // ---- AND BACK ON -------------------------------------------------------
    const toggleAgain = root.locator(`input[type="checkbox"][id$="skill-on-${SUBJECT}"]`).first();
    await expect(toggleAgain).toBeVisible({ timeout: 20_000 });
    await toggleAgain.click({ force: true });
    await expect(
      root.getByText("Disabled", { exact: true }),
      "the skill was switched back on and still wears the Disabled lozenge",
    ).toHaveCount(0, { timeout: 30_000 });

    const on = await readOne();
    expect(on.enabled, `enabled did not round-trip back to true: ${JSON.stringify(on.enabled)}`).not.toBe(
      false,
    );
    flipped = false;
  } finally {
    if (flipped) {
      const p = await page.context().newPage();
      try {
        const frame = await openGlobalPage(p, CHAT);
        await waitForChatApp(p, frame, GLOBAL_APP, 120_000);
        const r = await callResolver<any>(frame, GLOBAL_APP, "setSkillEnabled", {
          id: SUBJECT,
          enabled: true,
        });
        console.log(`[restore] setSkillEnabled(${SUBJECT}, true) -> ${JSON.stringify(r)}`);
      } catch (e) {
        console.warn(`[restore] COULD NOT RE-ENABLE ${SUBJECT}: ${(e as Error)?.message}`);
      } finally {
        await p.close().catch(() => {});
      }
    }
  }
});
