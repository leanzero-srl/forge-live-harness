import { test } from "@playwright/test";
import { launchHarnessContext } from "../forge/browser";
const RULE_ID = "01a0d80a-79a4-7546-aa9b-35a973242d75";
test("delete the researcher test flow", async () => {
  test.setTimeout(120_000);
  const ctx = await launchHarnessContext({ headed: false });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  try {
    await page.goto(`https://wolfaenpak.atlassian.net/jira/settings/automation#/rule/${RULE_ID}/details`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    await page.screenshot({ path: "evidence/researcher-sendemail/pre-delete.png", fullPage: true });
    const moreActions = page.getByRole("button", { name: /^more actions$/i }).first();
    await moreActions.click({ force: true });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "evidence/researcher-sendemail/more-actions-menu.png", fullPage: true });
    const deleteItem = page.getByRole("menuitem", { name: /^delete$/i }).first();
    if (await deleteItem.count()) { await deleteItem.click(); await page.waitForTimeout(1500); }
    else { console.log("NO DELETE MENUITEM"); }
    await page.screenshot({ path: "evidence/researcher-sendemail/delete-confirm.png", fullPage: true });
    const okBtn = page.getByRole("button", { name: /^ok$|^delete$/i }).first();
    if (await okBtn.count()) { await okBtn.click(); await page.waitForTimeout(3000); }
    await page.screenshot({ path: "evidence/researcher-sendemail/post-delete.png", fullPage: true });
    console.log("URL_AFTER_DELETE:" + page.url());
  } finally { await ctx.close(); }
});
