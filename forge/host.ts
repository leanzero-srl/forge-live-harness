// Navigation for Forge modules that are NOT deep-linkable (the CDN strips URL
// params): jira:issuePanel and confluence:macro. You must open the host object
// (issue / page) and drive its UI to reveal the app. v1 targets are globalPages
// (deep-linkable), so these helpers are provided for completeness and the issue/
// macro scenarios that come next.
import { type Page } from "@playwright/test";
import { BASE_URL } from "../config/env";

/**
 * Open a Jira issue and expand a named issue panel. Returns once the panel
 * container is visible (the Forge iframe inside is then entered via enterForgeSurface).
 */
export async function openIssuePanel(page: Page, issueKey: string, panelTitle: string): Promise<void> {
  await page.goto(`${BASE_URL}/browse/${issueKey}`, { waitUntil: "domcontentloaded" });
  // Issue panels render under the "Details"/glance area; many themes expose a
  // button labelled with the panel title that toggles it open.
  const toggle = page.getByRole("button", { name: new RegExp(panelTitle, "i") }).first();
  if ((await toggle.count().catch(() => 0)) > 0) {
    const expanded = await toggle.getAttribute("aria-expanded").catch(() => null);
    if (expanded === "false") await toggle.click().catch(() => {});
  }
  // Wait for the Forge iframe to appear in the panel region.
  await page
    .locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]')
    .first()
    .waitFor({ state: "attached", timeout: 30_000 });
}

/**
 * Open a Confluence page that contains a Forge macro. Macros render inline in the
 * page body; navigate to the page (view mode) and wait for the macro iframe.
 */
export async function openConfluenceMacro(page: Page, contentId: string): Promise<void> {
  await page.goto(`${BASE_URL}/wiki/pages/viewpage.action?pageId=${contentId}`, {
    waitUntil: "domcontentloaded",
  });
  await page
    .locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]')
    .first()
    .waitFor({ state: "attached", timeout: 30_000 });
}
