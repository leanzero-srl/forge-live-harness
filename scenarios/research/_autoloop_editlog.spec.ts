import { test } from "@playwright/test";
import { launchHarnessContext } from "../../forge/browser";
const RULE = process.env.RULE || "01a08a43-fcae-70e9-b6a9-9e9f954916ac";
const MSG = process.env.MSG || "";
test("edit log message", async () => {
  test.setTimeout(300_000);
  const ctx = await launchHarnessContext({ headed: false });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  try {
    await page.goto(`https://wolfaenpak.atlassian.net/jira/settings/automation#/rule/${RULE}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(8000);
    const cl = page.getByRole("button", { name: /^close$/i }).first(); if (await cl.count() && await cl.isVisible()) { await cl.click({ force: true }); await page.waitForTimeout(1000); }
    await page.getByText(/Add value to the audit log/).first().click(); await page.waitForTimeout(3000);
    const la = page.getByLabel(/log message/i).first(); await la.click(); await la.fill(MSG); await page.waitForTimeout(1000);
    console.log("VALUE:", await la.inputValue());
    await page.getByRole("button", { name: /^save$/i }).first().click(); await page.waitForTimeout(5000);
    console.log("saved:", await page.getByText(/flow has been updated/i).count());
  } finally { await ctx.close(); }
});
