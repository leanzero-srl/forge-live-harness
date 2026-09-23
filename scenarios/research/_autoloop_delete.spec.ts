import { test } from "@playwright/test";
import { launchHarnessContext } from "../../forge/browser";
const RULE = process.env.RULE || "01a08a43-fcae-70e9-b6a9-9e9f954916ac";
test("delete rule", async () => {
  test.setTimeout(200_000);
  const ctx = await launchHarnessContext({ headed: false });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  try {
    await page.goto(`https://wolfaenpak.atlassian.net/jira/settings/automation#/rule/${RULE}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(8000);
    const cl = page.getByRole("button", { name: /^close$/i }).first(); if (await cl.count() && await cl.isVisible()) { await cl.click({ force: true }); await page.waitForTimeout(1000); }
    await page.getByRole("button", { name: /more actions/i }).first().click(); await page.waitForTimeout(1500);
    await page.getByRole("menuitem", { name: /^delete$/i }).first().click(); await page.waitForTimeout(2000);
    await page.screenshot({ path: "evidence/autotest/98-delete-dialog.png" });
    console.log("BTNS:", JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll('[role="dialog"] button, [role="alertdialog"] button, section[role="dialog"] button')).map(b => (b as HTMLElement).innerText.trim()))));
    const conf = page.locator('[role="dialog"], [role="alertdialog"]').getByRole("button", { name: /^(OK|delete|confirm)$/i }).first();
    if (await conf.count()) { await conf.click(); } else { await page.getByRole("button", { name: /delete (flow|rule)|confirm/i }).last().click(); }
    await page.waitForTimeout(5000);
    console.log("URL after delete:", page.url());
    await page.goto(`https://wolfaenpak.atlassian.net/jira/settings/automation#/rule/${RULE}`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(8000);
    console.log("rule still present:", await page.getByText(/AUTOT dynamic index loop test/).count());
    await page.screenshot({ path: "evidence/autotest/99-after-delete.png" });
  } finally { await ctx.close(); }
});
