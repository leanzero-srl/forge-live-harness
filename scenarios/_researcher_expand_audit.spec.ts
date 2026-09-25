import { test } from "@playwright/test";
import { launchHarnessContext } from "../forge/browser";
import path from "node:path";
const RULE_ID = "01a0d80a-79a4-7546-aa9b-35a973242d75";
test("expand audit log row and read error", async () => {
  test.setTimeout(120_000);
  const ctx = await launchHarnessContext({ headed: false });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  try {
    await page.goto(`https://wolfaenpak.atlassian.net/jira/settings/automation#/rule/${RULE_ID}/audit-log`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(7000);
    // click the row containing "Some errors" to expand it (chevron at start of row)
    const row = page.locator('tr,[role="row"]').filter({ hasText: "Some errors" }).first();
    await row.click({ force: true });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "evidence/researcher-sendemail/expanded-row.png", fullPage: true });
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log("BODY_START");
    console.log(bodyText);
    console.log("BODY_END");
  } finally { await ctx.close(); }
});
