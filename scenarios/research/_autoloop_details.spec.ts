import { test } from "@playwright/test";
import { launchHarnessContext } from "../../forge/browser";
import path from "node:path";
const out = path.join(process.cwd(), "evidence", "autotest");
const RULE = process.env.RULE || "01a08a43-fcae-70e9-b6a9-9e9f954916ac";
const STOP = process.env.STOP || "zzz";
const dump = async (page: any, tag: string) => {
  const items = await page.evaluate(() => Array.from(document.querySelectorAll('button,[role="button"],[role="option"],[role="combobox"],[role="checkbox"],label,input,textarea,h1,h2,h3,[role="menuitem"],[role="tab"]'))
    .map(e => ((e as HTMLElement).innerText || (e as HTMLInputElement).placeholder || e.getAttribute('aria-label') || '').trim().replace(/\s+/g,' ')).filter(t => t && t.length < 90));
  console.log(`${tag}: ${JSON.stringify([...new Set(items)].slice(0,80))}`);
  await page.screenshot({ path: path.join(out, `${tag}.png`) });
  if (tag.startsWith(STOP)) throw new Error("STOP at " + tag);
};
test("set allow rule trigger", async () => {
  test.setTimeout(300_000);
  const ctx = await launchHarnessContext({ headed: false });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  try {
    await page.goto(`https://wolfaenpak.atlassian.net/jira/settings/automation#/rule/${RULE}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(8000);
    const cl = page.getByRole("button", { name: /^close$/i }).first(); if (await cl.count()) { await cl.click({ force: true }); await page.waitForTimeout(1000); }
    await dump(page, "20-rule");
    await page.getByRole("button", { name: /more actions/i }).first().click(); await page.waitForTimeout(1500);
    await dump(page, "21-more");
    const det = page.getByRole("menuitem", { name: /details|settings/i }).first();
    if (await det.count()) { await det.click(); await page.waitForTimeout(3000); }
    await dump(page, "22-details");
    await page.keyboard.press("Escape");
    const sl = page.locator('a, button, span').filter({ hasText: /^Settings$/ }).filter({ has: page.locator(':scope') }).last();
    const hdr = page.locator('header, [data-testid*="header"]').getByRole("button").filter({ hasNot: page.locator('text=/./') });
    console.log("hdr buttons", await hdr.count());
    await page.mouse.click(1143, 79); await page.waitForTimeout(3000);
    const links = await page.locator('a, button, span, [role="link"]').filter({ hasText: /^Settings$/ }).evaluateAll(els => els.map(e => e.tagName + "." + e.className.toString().slice(0,40) + " href=" + e.getAttribute("href")));
    console.log("SETTINGS-ELS:", JSON.stringify(links));
    const cand = page.locator('a, button, [role="link"], [role="button"]').filter({ hasText: /^Settings$/ }).last();
    await cand.click({ force: true }); await page.waitForTimeout(3000);
    console.log("URL now", page.url());
    await dump(page, "22b-settings");
    console.log("TOGGLES:", JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll('input[type="checkbox"],[role="switch"],[role="checkbox"]')).map(e => ({ id: (e as any).id, name: (e as any).name, al: e.getAttribute('aria-label'), lb: document.getElementById(e.getAttribute('aria-labelledby') || '')?.innerText, checked: (e as any).checked ?? e.getAttribute('aria-checked') })))));
    let cb = page.getByText(/Allow other automations and user actions to trigger this flow/i).first();
    await cb.click({ force: true }); await page.waitForTimeout(1500);
    console.log("RADIOS:", JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll('input[type="radio"]')).map(e => ({ v: (e as any).value, c: (e as any).checked })))));
    cb = page.locator('nomatch');
    if (!(await cb.count())) cb = page.getByText(/allow (rule|flow) trigger/i).first().locator('xpath=following::input[@type="checkbox"][1]').first();
    if (!(await cb.count())) cb = page.getByText(/allow (rule|flow) trigger/i).first().locator('xpath=preceding::input[@type="checkbox"][1]').first();
    console.log("cb count", await cb.count(), await cb.count() ? await cb.isChecked() : "");
    if (false) { await cb.check({ force: true }); await page.waitForTimeout(1000); console.log("checked; now", await cb.isChecked()); }
    await dump(page, "23-checked");
    const save = page.getByRole("button", { name: /^save$/i }).first();
    if (await save.count()) { await save.click(); await page.waitForTimeout(5000); }
    await dump(page, "24-saved");
  } finally { await ctx.close(); }
});
