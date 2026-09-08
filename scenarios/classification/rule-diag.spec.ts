import { test } from "@playwright/test";
import { launchHarnessContext } from "../../forge/browser";
import path from "node:path";
test("builder frames diag", async () => {
  test.setTimeout(240_000);
  const ctx = await launchHarnessContext({ headed: false });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  try {
    await page.goto("https://wolfaenpak.atlassian.net/jira/settings/automation", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(8000);
    const close = page.getByRole("button", { name: /^close$/i }).first(); if (await close.count()) { await close.click(); await page.waitForTimeout(1200); }
    await page.getByRole("button", { name: /create flow/i }).first().click(); await page.waitForTimeout(2000);
    await page.getByRole("menuitem", { name: /create from scratch/i }).first().click(); await page.waitForTimeout(8000);
    console.log("URL:", page.url());
    for (const f of page.frames()) {
      const n = await f.locator('input,textarea,[role="textbox"],[role="combobox"]').evaluateAll(els => els.map(e => (e.getAttribute('placeholder')||e.getAttribute('aria-label')||e.id||'').trim()).filter(Boolean)).catch(()=>[]);
      const hasTrig = await f.getByText(/Attribute value changed|Search triggers/i).count().catch(()=>0);
      console.log(`FRAME ${f === page.mainFrame() ? 'MAIN' : f.url().slice(0,90)} inputs=${JSON.stringify(n.slice(0,12))} triggerText=${hasTrig}`);
    }
    await page.screenshot({ path: path.join(process.cwd(), "evidence/classification/rule-diag.png") });
  } finally { await ctx.close(); }
});
