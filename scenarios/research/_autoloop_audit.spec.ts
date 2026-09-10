import { test } from "@playwright/test";
import { launchHarnessContext } from "../../forge/browser";
import path from "node:path";
import fs from "node:fs";
const out = path.join(process.cwd(), "evidence", "autotest");
const RULE = process.env.RULE || "01a08a43-fcae-70e9-b6a9-9e9f954916ac";
const TAG = process.env.TAG || "audit";
test("read audit log", async () => {
  test.setTimeout(300_000);
  const ctx = await launchHarnessContext({ headed: false });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  try {
    await page.goto(`https://wolfaenpak.atlassian.net/jira/settings/automation#/rule/${RULE}/audit-log`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(8000);
    const cl = page.getByRole("button", { name: /^close$/i }).first(); if (await cl.count() && await cl.isVisible()) { await cl.click({ force: true }); await page.waitForTimeout(1000); }
    if (!/audit/.test(page.url())) { await page.mouse.click(1172, 79); await page.waitForTimeout(4000); }
    // expand every row
    const rows = page.locator('button[aria-expanded="false"]');
    const n = await rows.count(); console.log("rows to expand:", n);
    for (let i = 0; i < n; i++) { const r = page.locator('button[aria-expanded="false"]').first(); if (!(await r.count())) break; await r.click({ force: true }); await page.waitForTimeout(800); }
    // click any "Show more" links
    for (const t of [/show more/i]) { const b = page.getByRole("button", { name: t }); const c = await b.count(); for (let i = 0; i < c; i++) { try { await b.nth(i).click({ force: true }); } catch {} } }
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(out, `${TAG}.png`), fullPage: true });
    const txt = await page.locator('main').innerText().catch(() => page.innerText('body'));
    fs.writeFileSync(path.join(out, `${TAG}.txt`), txt);
    console.log("URL", page.url());
    console.log(txt.slice(0, 6000));
  } finally { await ctx.close(); }
});
