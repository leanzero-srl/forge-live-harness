import { test } from "@playwright/test";
import { launchHarnessContext } from "../../forge/browser";
import path from "node:path";
const out = path.join(process.cwd(), "evidence", "plans-settings");
const B = "https://wolfaenpak.atlassian.net";
const dump = async (page: any, tag: string, sel = "main") => {
  const txt = await page.evaluate((s: string) => (document.querySelector(s) as HTMLElement)?.innerText || document.body.innerText, sel);
  console.log(`\n===== ${tag} (${page.url()}) =====\n${txt.slice(0, 6000)}`);
  await page.screenshot({ path: path.join(out, `${tag}.png`), fullPage: true });
};
const closeModals = async (page: any) => { for (let i=0;i<2;i++){ const b = page.getByRole("button", { name: /^(close|dismiss|got it|skip)$/i }).first(); if (await b.count()) { await b.click().catch(()=>{}); await page.waitForTimeout(800);} } };
test("plans readonly", async () => {
  test.setTimeout(500_000);
  const ctx = await launchHarnessContext({ headed: false });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  // (1) hierarchy config
  await page.goto(`${B}/jira/settings/issues/issue-hierarchy`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000); await closeModals(page);
  await dump(page, "1-hierarchy");
  // (2) plans list
  await page.goto(`${B}/jira/plans`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000); await closeModals(page);
  await dump(page, "2a-plans-list");
  const links = await page.locator('a[href*="/jira/plans/"]').evaluateAll(as => as.map(a => (a as HTMLAnchorElement).href).filter(h => /\/jira\/plans\/\d+/.test(h)));
  console.log("PLAN LINKS: " + JSON.stringify([...new Set(links)].slice(0,10)));
  if (!links.length) { console.log("NO PLANS FOUND"); await ctx.close(); return; }
  const planUrl = links[0].replace(/(\/jira\/plans\/\d+).*/, "$1");
  await page.goto(`${planUrl}/scenarios/1/timeline`, { waitUntil: "domcontentloaded" }).catch(()=>{});
  await page.waitForTimeout(10000); await closeModals(page);
  await dump(page, "2b-timeline");
  const vs = page.getByRole("button", { name: /view settings/i }).first();
  if (await vs.count()) { await vs.click(); await page.waitForTimeout(3000); await dump(page, "2c-view-settings", "body");
    // try to open hierarchy dropdowns
    const combos = page.locator('[role="dialog"] button, [role="dialog"] [role="combobox"], [data-testid*="view-settings"] button');
    const names = await combos.evaluateAll(es => es.map(e => (e as HTMLElement).innerText.trim()).filter(Boolean));
    console.log("VIEW SETTINGS CONTROLS: " + JSON.stringify(names));
    for (const n of names.filter(x => /epic|story|initiative|subtask|sub-task|level/i.test(x)).slice(0,2)) {
      const c = page.locator('[role="dialog"] button, [role="dialog"] [role="combobox"]').filter({ hasText: n }).first();
      await c.click({ force: true }).catch(()=>{}); await page.waitForTimeout(1500);
      const opts = await page.locator('[role="option"], [role="menuitem"]').evaluateAll(es => es.map(e => (e as HTMLElement).innerText.trim()));
      console.log(`OPTIONS for "${n}": ` + JSON.stringify(opts));
      await page.screenshot({ path: path.join(out, `2d-options-${n.replace(/\W+/g,'_').slice(0,30)}.png`) });
      await page.keyboard.press("Escape"); await page.waitForTimeout(800);
    }
  } else console.log("VIEW SETTINGS BUTTON: not present");
  await page.keyboard.press("Escape");
  // (3) plan settings
  for (const [tag, sub] of [["3a-settings", "settings"], ["3b-issue-sources", "settings/issue-sources"], ["3c-exclusion-rules", "settings/exclusion-rules"]]) {
    await page.goto(`${planUrl}/${sub}`, { waitUntil: "domcontentloaded" }).catch(()=>{});
    await page.waitForTimeout(9000); await closeModals(page);
    await dump(page, tag);
  }
  await ctx.close();
});
