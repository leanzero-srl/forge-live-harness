// Shared "does this Forge surface render real content live" flow, used by the
// per-app scenarios. Navigate → step-1 frame dump → enter the Forge surface →
// assert it mounted and isn't blank. Each assertion carries an expectation so a
// failure produces a specific, assessable bundle.
import { expect } from "../../fixtures/forge";
import type { Page } from "@playwright/test";
import type { Recorder } from "../../capture/recorder";
import type { Target } from "../../config/targets";
import { BASE_URL } from "../../config/env";
import { dumpForgeFrames, enterForgeSurface } from "../../forge/frame";
import { assertLoggedIn } from "../../forge/browser";
import { openIssuePanel } from "../../forge/host";

export async function checkForgeRenders(page: Page, recorder: Recorder, T: Target): Promise<void> {
  const url = T.deepLink(T.envId);
  if (!url) throw new Error(`${T.id}: module is not deep-linkable; needs a forge/host.ts path`);

  recorder.setTarget({
    product: T.product, app: T.app, appId: T.appId, module: T.module,
    moduleType: T.moduleType, surface: T.surface, url: BASE_URL + url, repo: T.repo,
  });

  await assertLoggedIn(page);

  await recorder.step(
    "navigate to app surface",
    async () => { await page.goto(url, { waitUntil: "domcontentloaded" }); },
    {
      action: "navigate",
      expectation: {
        assertion: "app URL loads without redirect to id.atlassian.com",
        narrative: `The ${T.app} ${T.moduleType} loads (not the login screen).`,
      },
    },
  );

  recorder.setFrames(await dumpForgeFrames(page));

  const surface = await enterForgeSurface(page, { surface: T.surface, readySelector: T.readySelector });
  recorder.attachSurface(surface);

  await recorder.step(
    "app mounts in its Forge surface",
    async () => {
      if (surface.kind === "custom") {
        await expect(
          page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first(),
        ).toBeAttached();
      }
    },
    {
      expectation: {
        assertion: "Forge Custom UI iframe present (or UI-Kit host) for the module",
        narrative: "The app's Forge surface mounts in the host page.",
      },
    },
  );

  await recorder.step(
    "surface shows content (not blank)",
    async () => {
      const root = surface.kind === "custom" ? surface.frame.locator("body") : page.locator("body");
      await expect(root).toContainText(/\S/, { timeout: 20_000 });
    },
    {
      expectation: {
        assertion: "the surface's body contains non-whitespace text",
        narrative: `The ${T.app} surface renders real content (headings/data/UI), not an empty/blank panel.`,
      },
    },
  );
}

/**
 * Render smoke for a jira:issuePanel — NOT deep-linkable, so navigate to a host
 * issue and expand the named glance (forge/host.ts), then assert the panel's
 * Forge iframe mounted with real content. The empty state ("not part of any PPM
 * plan") is still real content — this proves the module renders, not membership.
 */
export async function checkIssuePanelRenders(
  page: Page, recorder: Recorder, T: Target, issueKey: string, panelTitle: string,
): Promise<void> {
  recorder.setTarget({
    product: T.product, app: T.app, appId: T.appId, module: T.module,
    moduleType: T.moduleType, surface: T.surface, url: `${BASE_URL}/browse/${issueKey}`, repo: T.repo,
  });

  await assertLoggedIn(page);

  await recorder.step(
    "open issue + expand the app panel",
    async () => { await openIssuePanel(page, issueKey, panelTitle); },
    {
      action: "navigate",
      expectation: {
        assertion: `issue ${issueKey} opens and the "${panelTitle}" panel iframe attaches`,
        narrative: `The ${T.app} issue panel is reachable from a real Jira issue.`,
      },
    },
  );

  recorder.setFrames(await dumpForgeFrames(page));
  const surface = await enterForgeSurface(page, { surface: T.surface, readySelector: T.readySelector });
  recorder.attachSurface(surface);

  await recorder.step(
    "panel shows content (not blank)",
    async () => {
      const root = surface.kind === "custom" ? surface.frame.locator("body") : page.locator("body");
      await expect(root).toContainText(/\S/, { timeout: 20_000 });
    },
    {
      expectation: {
        assertion: "the panel body contains non-whitespace text",
        narrative: `The ${T.app} issue panel renders real content (membership or the empty-state), not a blank panel.`,
      },
    },
  );
}
