// JOURNEY: the admin page, INTERACTED with rather than only rendered.
//
// admin-page-render proves the five tabs mount; admin-config-guard proves the
// resolvers refuse a non-admin. Nothing ever drove the controls: the
// tool-policy toggle (the destructive kill switch's only UI), or the persona
// modal whose model picker is where a stale line-up would show up first.
//
// UI Kit 2 renders Atlaskit DOM the app does not own, so every selector here
// is role/label-based, and the state assertions go through the RESOLVERS —
// the UI is the steering wheel, the backend is the odometer.
import { test, expect } from "../../fixtures/forge";
import type { Page, FrameLocator, Locator } from "@playwright/test";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { GLOBAL_APP, callResolver, openGlobalPage, waitForChatApp } from "./chatwise-support";

const T = getTarget("chatwise-admin");
const CHAT = getTarget("chatwise-global");

type Root = Page | FrameLocator;
const PROBE_TAB = "Beta access";

function tabLocator(root: Root, name: string): Locator {
  // ROLE ONLY, deliberately. This page renders in the HOST DOM, where a
  // getByText("Settings") fallback collides with Jira's own chrome — the
  // journey's first run clicked Jira's Settings hub instead of ChatWise's tab.
  // Jira's chrome has links and buttons named Settings; only ChatWise has a
  // TAB by that name.
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

test.describe.configure({ retries: 1, timeout: 420_000 });

test("admin journey: tool-policy toggle round-trips; persona modal offers the current models", async ({ page }) => {
  test.skip(!T.envId || !CHAT.envId, "env ids unresolved — run `npm run discover`.");

  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  const root = await resolveAdminRoot(page);

  let flippedPolicy = false;
  try {
    // ---- Settings tab: the destructive kill switch -------------------------
    await tabLocator(root, "Settings").click();
    const toggleLabel = root.getByText("Allow issue deletion", { exact: true });
    await expect(toggleLabel, "the tool-policy control is missing").toBeVisible({ timeout: 20_000 });

    // The Toggle is a checkbox input whose id Forge PREFIXES
    // (forge-app-<hash>-allowDestructive) — ends-with is the stable selector.
    const toggle = root.locator('input[type="checkbox"][id$="-allowDestructive"]').first();
    const before = await toggle.isChecked().catch(() => null);
    expect(before, "destructive must be OFF before this test touches it").toBe(false);

    await toggle.click({ force: true }); // Atlaskit hides the input under a styled track
    await root.getByRole("button", { name: /save tool policy/i }).click();
    // The warning section proves the UI understood the change.
    await expect(root.getByText(/deletion is permanent/i)).toBeVisible({ timeout: 15_000 });
    flippedPolicy = true;

    // ---- The odometer: what did the BACKEND store? -------------------------
    // Resolvers are reachable from the chat surface; the admin iframe has no
    // exposed bridge handle.
    const chatPage = await page.context().newPage();
    try {
      const chatFrame = await openGlobalPage(chatPage, CHAT);
      await waitForChatApp(chatPage, chatFrame, GLOBAL_APP);
      const pol = await callResolver<any>(chatFrame, GLOBAL_APP, "getToolPolicy", {});
      expect(pol?.policy?.allowDestructive, "the toggle did not reach KVS").toBe(true);

      // Restore THROUGH THE RESOLVER (deterministic), then verify the UI would
      // read it back off — wolfaenpak is shared and deletion must not stay on.
      await callResolver(chatFrame, GLOBAL_APP, "saveToolPolicy", {
        policy: { allowDestructive: false, allowBulk: true, allowAgile: true },
      });
      flippedPolicy = false;
    } finally {
      await chatPage.close();
    }

    // ---- Personas tab: the modal's model picker ----------------------------
    await tabLocator(root, "Personas").click();
    const editButtons = root.getByRole("button", { name: /^edit$/i });
    await expect(editButtons.first(), "no persona rows rendered").toBeVisible({ timeout: 20_000 });
    await editButtons.first().click();

    // The modal exists, with the three settings that were added this cycle.
    await expect(root.getByText(/context size/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(root.getByText(/response size/i).first()).toBeVisible();

    // The model picker offers the CURRENT line-up — asserted on the real
    // role=option elements after opening the menu, because a body-text match
    // happily matches a PARENT element's combined text and proves nothing.
    // (Select inputId="pmodel" → Forge prefixes it, hence ends-with.)
    const modelInput = root.locator('input[id$="-pmodel"]').first();
    await modelInput.click();
    const options = root.getByRole("option");
    await expect(options.first(), "the model menu did not open").toBeVisible({ timeout: 10_000 });
    const labels = await options.allTextContents();
    expect(labels.length, `expected exactly the 3 offered tiers, got: ${labels.join(" | ")}`).toBe(3);
    expect(labels.some((l) => /sonnet 5/i.test(l)), `no Sonnet 5 in: ${labels.join(" | ")}`).toBe(true);
    expect(labels.some((l) => /opus 5/i.test(l)), `no Opus 5 in: ${labels.join(" | ")}`).toBe(true);
    expect(labels.some((l) => /superseded/i.test(l)), "a superseded tier is offered").toBe(false);
    await page.keyboard.press("Escape"); // close the menu without changing anything

    await root.getByRole("button", { name: /^cancel$/i }).first().click().catch(() => {});
  } finally {
    if (flippedPolicy) {
      // Belt and braces: never leave deletion enabled on a shared site.
      const chatPage = await page.context().newPage();
      try {
        const chatFrame = await openGlobalPage(chatPage, CHAT);
        await waitForChatApp(chatPage, chatFrame, GLOBAL_APP);
        await callResolver(chatFrame, GLOBAL_APP, "saveToolPolicy", {
          policy: { allowDestructive: false, allowBulk: true, allowAgile: true },
        });
      } finally {
        await chatPage.close();
      }
    }
  }
});
