import { test } from "@playwright/test";
import { launchHarnessContext } from "../forge/browser";
const RULE_ID = "01a0d80a-79a4-7546-aa9b-35a973242d75";
test("delete the researcher test flow (retry)", async () => {
  test.setTimeout(120_000);
  const ctx = await launchHarnessContext({ headed: false });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  try {
    await page.goto(`https://wolfaenpak.atlassian.net/jira/settings/automation#/rule/${RULE_ID}/details`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(10000);
    let moreActions = page.getByRole("button", { name: /^more actions$/i }).first();
    if (!(await moreActions.count())) { await page.waitForTimeout(5000); moreActions = page.getByRole("button", { name: /^more actions$/i }).first(); }
    await page.screenshot({ path: "evidence/researcher-sendemail/before-more-actions.png", fullPage: true });
    await moreActions.click({ force: true, timeout: 30000 });
    await page.waitForTimeout(1500);
    const deleteItem = page.getByRole("menuitem", { name: /^delete$/i }).first();
    await deleteItem.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "evidence/researcher-sendemail/delete-confirm2.png", fullPage: true });
    const okBtn = page.getByRole("button", { name: "OK", exact: true }).first();
    console.log("OK_BTN_COUNT:" + await okBtn.count());
    await okBtn.click({ force: true });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: "evidence/researcher-sendemail/post-delete2.png", fullPage: true });
    console.log("URL_AFTER_DELETE:" + page.url());
  } finally { await ctx.close(); }
});
