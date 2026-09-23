import { test } from "@playwright/test";
import { launchHarnessContext } from "../../forge/browser";
import fs from "node:fs";
const RULE = process.env.RULE!; const TAG = process.env.TAG || "audit-each";
test("read audit rows one by one", async () => {
  test.setTimeout(400_000);
  const ctx = await launchHarnessContext({ headed: false });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  try {
    await page.goto(`https://wolfaenpak.atlassian.net/jira/settings/automation#/rule/${RULE}/audit-log`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(8000);
    const cl = page.getByRole("button", { name: /^close$/i }).first(); if (await cl.count() && await cl.isVisible()) { await cl.click({ force: true }); await page.waitForTimeout(1000); }
    if (!(await page.getByText(/Audit log ID/).count())) { await page.mouse.click(1172, 79); await page.waitForTimeout(5000); }
    console.log("url", page.url(), "buttons:", JSON.stringify(await page.locator('button').evaluateAll(els => els.map(e => e.getAttribute('aria-label') || '').filter(t => /operations/.test(t)).slice(0, 3))));
    console.log("EXP:", JSON.stringify(await page.locator('[aria-expanded]').evaluateAll(els => els.map(e => e.tagName + "|" + e.getAttribute('aria-expanded') + "|" + (e.getAttribute('aria-label') || (e as HTMLElement).innerText.slice(0, 40))).slice(0, 15))));
    await page.getByRole("button", { name: /show (more|less) operations/i }).first().waitFor({ timeout: 60000 }).catch(() => {});
    const rows = page.getByRole("button", { name: /show (more|less) operations/i });
    const n = await rows.count(); console.log("rows:", n); let all = "";
    for (let i = 0; i < n; i++) {
      const b = page.getByRole("button", { name: /show (more|less) operations/i }).nth(i);
      if (/more/i.test((await b.getAttribute("aria-label")) || (await b.innerText()))) { await b.click({ force: true, timeout: 5000 }); await page.waitForTimeout(1500); }
      const tr = b.locator('xpath=ancestor::tr[1]'); const txt = (await tr.innerText()) + "\n" + (await tr.locator('xpath=following-sibling::tr[1]').innerText().catch(() => ""));
      all += `=== ROW ${i} ===\n${txt}\n`;
    }
    fs.writeFileSync(`evidence/autotest/${TAG}.txt`, all); console.log(all);
  } finally { await ctx.close(); }
});
