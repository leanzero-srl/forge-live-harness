import { test } from "@playwright/test";
import { launchHarnessContext } from "../forge/browser";
import path from "node:path";
const out = path.join(process.cwd(), "evidence", "researcher-sendemail");
const RULE_ID = "01a0d80a-79a4-7546-aa9b-35a973242d75";

const dump = async (page: any, tag: string) => {
  const items = await page.evaluate(() => Array.from(document.querySelectorAll('button,[role="button"],[role="option"],label,input,textarea,h1,h2,h3,p,div[role="row"],td,li'))
    .map(e => ((e as HTMLElement).innerText || (e as HTMLInputElement).placeholder || e.getAttribute('aria-label') || '').trim().replace(/\s+/g,' ')).filter(t => t && t.length < 400));
  console.log(`${tag}: ${JSON.stringify([...new Set(items)].slice(0,150))}`);
  await page.screenshot({ path: path.join(out, `t-${tag}.png`), fullPage: true });
};

test("trigger the rule manually from a work item and read audit log", async () => {
  test.setTimeout(240_000);
  const ctx = await launchHarnessContext({ headed: false });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  try {
    // Go directly to the full issue page (avoids the list-view modal overlay)
    await page.goto("https://wolfaenpak.atlassian.net/browse/JT-9", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    const doneBtn = page.getByRole("button", { name: /^done$/i }).first();
    if (await doneBtn.count()) { await doneBtn.click().catch(()=>{}); await page.waitForTimeout(1000); }
    await dump(page, "b-issue-view");

    // The lightning-bolt "Automation" button lists flows manually triggerable from this issue
    const automationBtn = page.getByRole("button", { name: /^automation$/i }).first();
    if (await automationBtn.count()) { await automationBtn.click({force:true}); await page.waitForTimeout(1500); }
    else {
      const actionsBtn = page.getByRole("button", { name: /^actions$/i }).first();
      if (await actionsBtn.count()) { await actionsBtn.click({force:true}); await page.waitForTimeout(1500); }
    }
    await dump(page, "c-actions-menu");

    const flowItem = page.getByText(/Send email 'Researcher test rule'|RESEARCH TEST/i).first();
    if (await flowItem.count()) { await flowItem.click(); await page.waitForTimeout(4000); }
    else { console.log("NO_FLOW_MENU_ITEM_FOUND"); }
    await dump(page, "d-after-trigger-click");

    // Confirm dialog if present
    const runBtn = page.getByRole("button", { name: /^run$|^confirm$|^yes$/i }).first();
    if (await runBtn.count()) { await runBtn.click(); await page.waitForTimeout(3000); }
    await dump(page, "e-after-confirm");

    // Go to the flow's audit log
    await page.goto(`https://wolfaenpak.atlassian.net/jira/settings/automation#/rule/${RULE_ID}/audit-log`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(7000);
    await dump(page, "f-audit-log-landing");

    // Expand the most recent row(s)
    const expandButtons = page.locator('button[aria-expanded="false"]');
    const n = await expandButtons.count();
    console.log("EXPAND_BUTTONS_COUNT:" + n);
    for (let i = 0; i < Math.min(n, 3); i++) {
      await expandButtons.nth(i).click().catch(()=>{});
      await page.waitForTimeout(1500);
    }
    await dump(page, "g-audit-log-expanded");

    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log("AUDIT_LOG_FULL_TEXT_START");
    console.log(bodyText.slice(0, 6000));
    console.log("AUDIT_LOG_FULL_TEXT_END");
  } finally {
    await ctx.close();
  }
});
