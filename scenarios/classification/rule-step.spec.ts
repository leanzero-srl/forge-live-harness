import { test } from "@playwright/test";
import { launchHarnessContext } from "../../forge/browser";
import path from "node:path";
const out = path.join(process.cwd(), "evidence", "classification");
export const open = async (page: any) => {
  await page.goto("https://wolfaenpak.atlassian.net/jira/settings/automation", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  for (const name of [/^close$/i]) { const b = page.getByRole("button", { name }).first(); if (await b.count()) { await b.click(); await page.waitForTimeout(1000); } }
  await page.getByRole("button", { name: /create flow/i }).first().click(); await page.waitForTimeout(1500);
  await page.getByRole("menuitem", { name: /create from scratch/i }).first().click(); await page.waitForTimeout(5000);
  const discard = page.getByRole("button", { name: /discard changes/i }).first();
  if (await discard.count()) { await discard.click(); await page.waitForTimeout(6000); console.log("discarded stale draft"); }
};
const dump = async (page: any, tag: string) => {
  const items = await page.evaluate(() => Array.from(document.querySelectorAll('button,[role="button"],[role="option"],[role="combobox"],label,input,textarea,h1,h2,h3'))
    .map(e => ((e as HTMLElement).innerText || (e as HTMLInputElement).placeholder || e.getAttribute('aria-label') || '').trim().replace(/\s+/g,' ')).filter(t => t && t.length < 90));
  const skip=/^(Top Bar|Sidebar|Main Content|Collapse|Switch|Jira$|Search$|Connect apps|Create$|Ask Rovo|Notifications|Help|Settings|mihai@|Navigate|System|General|Beta|Audit|Site opt|Access|Space roles|Global perm|Work item coll|Global auto|Default|Look and|Announce|Backup|External|Import|Global mail|Outgoing|Incoming|Send email|Permission|Admin email|Filters|Dashboards|Attachments|Events|WebHooks|LexoRank|Mail)/;
  console.log(`${tag}: ${JSON.stringify([...new Set(items)].filter(t=>!skip.test(t)).slice(0,60))}`);
  await page.screenshot({ path: path.join(out, `rule-${tag}.png`) });
};
test("automation builder step 3", async () => {
  test.setTimeout(240_000);
  const ctx = await launchHarnessContext({ headed: false });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  try {
    await open(page);
    const s = page.getByPlaceholder(/search triggers/i).first();
    await s.click(); await s.fill("Attribute value changed"); await page.waitForTimeout(2500);
    await dump(page, "3a-search");
    await page.getByText(/^Attribute value changed$/i).first().click();
    await page.waitForTimeout(5000);
    await dump(page, "3b-config");
    // pick the Schema, then whatever fields appear next
    const pick = async (labelRe: RegExp, text: string, tag: string) => {
      const lab = page.getByText(labelRe).first();
      const box = lab.locator('xpath=following::*[@role="combobox" or self::input][1]').first();
      if (!(await box.count())) { console.log(`no combobox for ${labelRe}`); return; }
      await box.click(); await page.keyboard.type(text); await page.waitForTimeout(2000);
      const opt = page.getByRole("option", { name: new RegExp(text, "i") }).first();
      if (await opt.count()) await opt.click(); else await page.keyboard.press("Enter");
      await page.waitForTimeout(2500); await dump(page, tag);
    };
    await pick(/^Schema/i, "Information Governance", "3c-schema");
    await pick(/^Object type/i, "Confluence Space", "3d-objecttype");
    // react-select: the placeholder is an inert div; the real control is the hidden input
    const ph = page.locator('[id$="-placeholder"]', { hasText: /search attributes/i }).first();
    const sid = (await ph.getAttribute('id') || '').replace('-placeholder','');
    const attr = sid ? page.locator(`#${sid}-input`) : page.locator('input[id^="react-select-"][id$="-input"]').last();
    await attr.focus(); await attr.click({ force: true }); await page.keyboard.type("Classification"); await page.waitForTimeout(2000);
    const o = page.getByRole("option", { name: /^Classification$/i }).first();
    if (await o.count()) await o.click(); else await page.keyboard.press("Enter");
    await page.waitForTimeout(2000); await dump(page, "3e-attribute");
    await page.getByRole("button", { name: /^next$/i }).first().click(); await page.waitForTimeout(4000);
    await dump(page, "3f-after-next");
    // add the action: choose "Action", then the picker's own search (it autofocuses)
    await page.keyboard.press("Escape");
    await page.getByText(/^Action$/i).first().click(); await page.waitForTimeout(3000);
    await dump(page, "3g-actionpicker");
    const ps = page.locator('input[placeholder]').filter({ hasNot: page.locator('#search') });
    const pl = await ps.evaluateAll(els => els.map(e => (e as HTMLInputElement).placeholder));
    console.log("PLACEHOLDERS:", JSON.stringify(pl));
    const box = page.getByPlaceholder(/search (actions|components|for)/i).first();
    if (await box.count()) { await box.click(); await box.fill("Send web request"); } else { await page.keyboard.type("Send web request"); }
    await page.waitForTimeout(2500);
    await page.getByText(/^Send web request$/i).first().click(); await page.waitForTimeout(4000);
    await dump(page, "3h-webrequest");
    const url = "https://64d08693-b295-4664-9fda-eba81261160f.hello.atlassian-dev.net/x1/ztbkcvc0-4weGufZFBq9Vmb0mSU?secret=490880e4bf034cae60f06ffb8667da33&spaceKey={{containerObject.Space Key}}";
    const urlBox = page.getByLabel(/web request url|url/i).first();
    if (await urlBox.count()) { await urlBox.click(); await urlBox.fill(url); console.log("URL filled"); await page.waitForTimeout(1000); }
    // react-select helper: find the select by its label text, drive its hidden input
    const rs = async (labelRe: RegExp, value: string) => {
      const lab = page.getByText(labelRe).first();
      const ctl = lab.locator('xpath=following::input[starts-with(@id,"react-select-") and contains(@id,"-input")][1]').first();
      if (!(await ctl.count())) { console.log("no react-select for", labelRe); return; }
      await ctl.focus(); await ctl.click({ force: true }); await page.keyboard.type(value); await page.waitForTimeout(1500);
      const o = page.getByRole("option", { name: new RegExp(`^${value}$`, "i") }).first();
      if (await o.count()) await o.click(); else await page.keyboard.press("Enter");
      await page.waitForTimeout(1200);
    };
    await rs(/^HTTP method/i, "GET");
    await rs(/^Web request body/i, "Empty");
    await dump(page, "3j-configured");
    await page.getByRole("button", { name: /^next$/i }).first().click(); await page.waitForTimeout(3500);
    await dump(page, "3k-after-next");
    // name the flow: click the title, type, then Save and enable
    const title = page.getByText(/^Untitled flow$/i).first();
    if (await title.count()) { await title.click(); await page.waitForTimeout(800); await page.keyboard.press("Control+A"); await page.keyboard.type("Classification changed in Assets - sync Confluence space"); await page.keyboard.press("Enter"); await page.waitForTimeout(1200); }
    await page.getByRole("button", { name: /^save and enable$/i }).first().click(); await page.waitForTimeout(5000);
    await dump(page, "3l-saved");
    console.log("FINAL URL:", page.url());
  } finally { await ctx.close(); }
});
