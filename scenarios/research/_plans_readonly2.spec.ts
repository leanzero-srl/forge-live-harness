import { test } from "@playwright/test";
import { launchHarnessContext } from "../../forge/browser";
import path from "node:path";
const out = path.join(process.cwd(), "evidence", "plans-settings");
const planUrl = "https://wolfaenpak.atlassian.net/jira/plans/1";
const dump = async (page: any, tag: string, sel = "main") => {
  const txt = await page.evaluate((s: string) => (document.querySelector(s) as HTMLElement)?.innerText || document.body.innerText, sel);
  console.log(`\n===== ${tag} (${page.url()}) =====\n${txt.replace(/^[\s\S]*?Resize panel\n/, "").slice(0, 3500)}`);
  await page.screenshot({ path: path.join(out, `${tag}.png`), fullPage: true });
};
test("plans readonly 2", async () => {
  test.setTimeout(400_000);
  const ctx = await launchHarnessContext({ headed: false });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(`${planUrl}/scenarios/1/timeline`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(10000);
  await page.getByRole("button", { name: /view settings/i }).first().click(); await page.waitForTimeout(3000);
  const dlg = page.locator('[data-testid*="view-settings"], [role="dialog"], section:has-text("Color by")').last();
  console.log("VIEW SETTINGS PANEL TEXT:\n" + (await dlg.innerText().catch(()=>"n/a")));
  const names = await page.locator('button, [role="combobox"], select, [role="switch"], input').evaluateAll(es => es.map(e => ((e as HTMLElement).innerText || e.getAttribute('aria-label') || '').trim()).filter(x => /hierarchy|epic|story|level|initiative/i.test(x)));
  console.log("HIERARCHY-ish CONTROLS anywhere on page: " + JSON.stringify(names));
  await page.screenshot({ path: path.join(out, `2c-view-settings-panel.png`) });
  await page.keyboard.press("Escape");
  // filter bar: hierarchy filter?
  const f = page.getByRole("button", { name: /^filter/i }).first(); if (await f.count()) { await f.click(); await page.waitForTimeout(2500); await dump(page, "2e-filter-panel", "body"); await page.keyboard.press("Escape"); }
  for (const [tag, sub] of [["3a-settings", "settings"], ["3b-issue-sources", "settings/issue-sources"], ["3c-exclusion-rules", "settings/exclusion-rules"]]) {
    await page.goto(`${planUrl}/${sub}`, { waitUntil: "domcontentloaded" }).catch(()=>{});
    await page.waitForTimeout(9000); await dump(page, tag);
  }
  await ctx.close();
});
