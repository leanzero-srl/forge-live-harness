import { test } from "@playwright/test";
import { launchHarnessContext } from "../../forge/browser";
import path from "node:path";
const out = path.join(process.cwd(), "evidence", "autotest2");
const STOP = process.env.STOP || "zzz";
const dump = async (page: any, tag: string) => {
  const items = await page.evaluate(() => Array.from(document.querySelectorAll('button,[role="button"],[role="option"],[role="combobox"],[role="checkbox"],label,input,textarea,h1,h2,h3,[role="menuitem"]'))
    .map(e => ((e as HTMLElement).innerText || (e as HTMLInputElement).placeholder || e.getAttribute('aria-label') || '').trim().replace(/\s+/g,' ')).filter(t => t && t.length < 90));
  const skip=/^(Top Bar|Sidebar|Main Content|Collapse|Switch|Jira$|Search$|Connect apps|Create$|Ask Rovo|Notifications|Help|Settings|mihai@|Navigate|System|General|Beta|Audit|Site opt|Access|Space roles|Global perm|Work item coll|Global auto|Default|Look and|Announce|Backup|External|Import|Global mail|Outgoing|Incoming|Send email|Permission|Admin email|Filters|Dashboards|Attachments|Events|WebHooks|LexoRank|Mail)/;
  console.log(`${tag}: ${JSON.stringify([...new Set(items)].filter(t=>!skip.test(t)).slice(0,80))}`);
  await page.screenshot({ path: path.join(out, `${tag}.png`) });
  if (tag.startsWith(STOP)) throw new Error("STOP at " + tag);
};
const rsByPlaceholder = async (page: any, phRe: RegExp, value: string, optRe?: RegExp) => {
  const ph = page.locator('[id$="-placeholder"]', { hasText: phRe }).first();
  const sid = (await ph.getAttribute('id') || '').replace('-placeholder','');
  const ctl = sid ? page.locator(`#${sid}-input`) : page.locator('input[id^="react-select-"][id$="-input"]').last();
  await ctl.focus(); await ctl.click({ force: true }); await page.keyboard.type(value); await page.waitForTimeout(2000);
  const o = page.getByRole("option", { name: optRe ?? new RegExp(`^${value}$`, "i") }).first();
  if (await o.count()) await o.click(); else await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
};
const rsByLabel = async (page: any, labelRe: RegExp, value: string, optRe?: RegExp) => {
  const lab = page.getByText(labelRe).first();
  const ctl = lab.locator('xpath=following::input[starts-with(@id,"react-select-") and contains(@id,"-input")][1]').first();
  await ctl.evaluate((e: HTMLElement) => { e.scrollIntoView({ block: "center" }); e.focus(); });
  await page.waitForTimeout(500);
  const focused = await page.evaluate(() => (document.activeElement as HTMLElement)?.id);
  console.log("focused:", focused);
  if (!focused?.startsWith("react-select")) { await ctl.click({ force: true }); }
  await page.keyboard.type(value); await page.waitForTimeout(2500);
  const o = page.getByRole("option", { name: optRe ?? new RegExp(`^${value}$`, "i") }).first();
  if (await o.count()) await o.click(); else await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
};
const addComponent = async (page: any, kind: RegExp, search: string, exact: RegExp) => {
  await page.keyboard.press("Escape");
  await page.getByText(kind).first().click(); await page.waitForTimeout(3000);
  const pls = await page.locator('input[placeholder]').evaluateAll(els => els.map(e => (e as HTMLInputElement).placeholder));
  console.log("PLACEHOLDERS:", JSON.stringify(pls));
  const box = page.getByPlaceholder(/^search (actions|conditions)/i).first();
  if (await box.count()) { await box.click(); await box.fill(search); } await page.waitForTimeout(2500);
  await dump(page, "xx-search-" + search.replace(/\W+/g, "_"));
  await page.getByText(exact).first().click(); await page.waitForTimeout(4000);
};
test("build loop rule", async () => {
  test.setTimeout(400_000);
  const ctx = await launchHarnessContext({ headed: false });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  try {
    await page.goto("https://wolfaenpak.atlassian.net/jira/settings/automation", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(7000);
    const cl = page.getByRole("button", { name: /^close$/i }).first(); if (await cl.count()) { await cl.click(); await page.waitForTimeout(1000); }
    await page.getByRole("button", { name: /create flow/i }).first().click(); await page.waitForTimeout(1500);
    await page.getByRole("menuitem", { name: /create from scratch/i }).first().click(); await page.waitForTimeout(5000);
    const discard = page.getByRole("button", { name: /discard changes/i }).first();
    if (await discard.count()) { await discard.click(); await page.waitForTimeout(6000); }
    const s = page.getByPlaceholder(/search triggers/i).first();
    await s.click(); await s.fill("value"); await page.waitForTimeout(2500);
    await dump(page, "00-triggers");
    await page.getByText(/^(Value changes for|Field value changed)$/i).first().click(); await page.waitForTimeout(4000);
    await dump(page, "01-trigger");
    await page.getByText(/^Select a field$/i).first().click({ force: true }); await page.waitForTimeout(2000);
    await dump(page, "01b-fieldopen");
    console.log("active:", await page.evaluate(() => { const a = document.activeElement as HTMLElement; return a?.tagName + "#" + a?.id + "." + a?.className; }));
    await page.keyboard.type("Remaining"); await page.waitForTimeout(2500);
    await dump(page, "01c-typed");
    const o = page.getByRole("option", { name: /^Remaining$/i }).first();
    if (await o.count()) await o.click(); else await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);
    await dump(page, "02-trigger-field");
    await page.getByRole("button", { name: /^next$/i }).first().click(); await page.waitForTimeout(4000);
    await dump(page, "03-after-trigger");
    // Condition: field is not empty
    await addComponent(page, /^Condition$/i, "field", /^(Work item fields condition|Issue fields condition)$/i);
    await dump(page, "04-cond");
    const akPick = async (labelRe: RegExp, text: string, optRe: RegExp) => {
      const inp = page.getByText(labelRe).first().locator('xpath=following::input[contains(@class,"ak-select__input")][1]').first();
      await inp.evaluate((e: HTMLElement) => { e.scrollIntoView({ block: "center" }); e.focus(); });
      await page.waitForTimeout(600);
      const ctrl = inp.locator('xpath=ancestor::*[contains(@class,"ak-select__control")][1]');
      if (await ctrl.count()) await ctrl.click({ force: true });
      await page.waitForTimeout(800);
      await page.keyboard.type(text); await page.waitForTimeout(2500);
      console.log("OPTIONS for", text, JSON.stringify(await page.getByRole("option").allInnerTexts()));
      const o = page.getByRole("option", { name: optRe }).first();
      if (await o.count()) await o.click(); else { await page.keyboard.press("Enter"); }
      await page.waitForTimeout(1500);
    };
    await akPick(/^Field\*/i, "Remaining", /^Remaining$/i);
    await dump(page, "04a-field");
    await akPick(/^Condition\*/i, "empty", /^is not empty$/i);
    await dump(page, "04c-cond");
    await dump(page, "05-cond-filled");
    await page.getByRole("button", { name: /^next$/i }).first().click(); await page.waitForTimeout(4000);
    // Log action
    await addComponent(page, /^Action$/i, "Log action", /^Log action$/i);
    await dump(page, "06-log");
    const msg = 'first={{issue.Remaining.split(",").first}} rest={{issue.Remaining.substringAfter(",")}} n={{issue.Remaining.split(",").size}} raw={{issue.Remaining}}'; const _unused = 'ctr={{issue.Counter}} size={{issue.Emails.split(",").size}} A={{issue.Emails.split(",").get(issue.Counter)}} B={{issue.Emails.split(",").get(issue.Counter.asNumber)}} C={{issue.Emails.split(",").get(idx)}} D={{issue.Emails.split(",").get({{idx}})}} E={{issue.Emails.split(",").get(idx.asNumber)}} idx={{idx}}';
    const la = page.getByLabel(/log message/i).first(); await la.click(); await la.fill(msg);
    await dump(page, "07-log-filled");
    await page.getByRole("button", { name: /^next$/i }).first().click(); await page.waitForTimeout(4000);
    // Edit issue
    await addComponent(page, /^Action$/i, "Edit", /^Edit (issue|work item)( fields)?$/i);
    await dump(page, "08-edit");
    const ts = page.getByPlaceholder(/type to search/i).first();
    if (await ts.count()) { await ts.click(); await ts.fill("Remaining"); } else { await page.getByText(/choose fields to set/i).first().click({ force: true }); await page.keyboard.type("Remaining"); }
    await page.waitForTimeout(2500);
    await dump(page, "08b-typed");
    const o2 = page.getByRole("option", { name: /^Remaining$/i }).first();
    if (await o2.count()) await o2.click(); else { await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter"); }
    await page.waitForTimeout(2500);
    await dump(page, "09-edit-field");
    console.log("INPUTS:", JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll('input,textarea,[contenteditable="true"]')).map(e => ({ id: (e as any).id, name: (e as any).name, ph: (e as any).placeholder, al: e.getAttribute('aria-label'), lb: e.getAttribute('aria-labelledby'), ce: e.getAttribute('contenteditable') })).filter(x => x.id || x.name || x.ph || x.al || x.ce))));
    await page.keyboard.press("Escape"); await page.waitForTimeout(1500);
    await dump(page, "09b-escaped");
    const inp2 = await page.evaluate(() => Array.from(document.querySelectorAll('input,textarea')).map(e => ({ id: (e as any).id, name: (e as any).name, ph: (e as any).placeholder, lb: e.getAttribute('aria-labelledby') })).filter(x => x.id || x.name || x.ph));
    console.log("INPUTS2:", JSON.stringify(inp2));
    const cf = page.getByPlaceholder(/this field will be cleared/i).first();
    if (await cf.count()) { await cf.click(); await cf.fill('{{issue.Remaining.substringAfter(",")}}'); console.log("filled Counter input"); }
    else { const adv = page.locator('#advancedFields'); await adv.click(); await adv.fill('{"fields": {"Counter": "{{issue.Counter.plus(1)}}"}}'); console.log("used advancedFields JSON"); }
    await dump(page, "10-edit-filled");
    await page.getByRole("button", { name: /^next$/i }).first().click(); await page.waitForTimeout(4000);
    await dump(page, "11-after-edit");
    // rule details: allow rule trigger
    const rd = page.getByText(/rule details|flow details/i).first(); if (await rd.count()) { await rd.click(); await page.waitForTimeout(3000); }
    await dump(page, "12-details");
    const cb = page.getByLabel(/allow rule trigger|allow flow trigger|allow other rule/i).first();
    if (await cb.count()) { await cb.check({ force: true }); console.log("allow rule trigger checked"); }
    await dump(page, "13-details-checked");
    const title = page.getByText(/^Untitled flow$/i).first();
    if (await title.count()) { await title.click(); await page.waitForTimeout(800); await page.keyboard.press("Control+A"); await page.keyboard.type("AUTOT2 remaining loop test"); await page.keyboard.press("Enter"); await page.waitForTimeout(1200); }
    await page.getByRole("button", { name: /^save and enable$/i }).first().click(); await page.waitForTimeout(6000);
    await dump(page, "14-saved");
    console.log("FINAL URL:", page.url());
  } finally { await ctx.close(); }
});
