import { test } from "@playwright/test";
import { launchHarnessContext } from "../forge/browser";
import path from "node:path";
const out = path.join(process.cwd(), "evidence", "researcher-sendemail");

const dump = async (page: any, tag: string) => {
  const items = await page.evaluate(() => Array.from(document.querySelectorAll('button,[role="button"],[role="option"],[role="combobox"],label,input,textarea,h1,h2,h3,p'))
    .map(e => ((e as HTMLElement).innerText || (e as HTMLInputElement).placeholder || e.getAttribute('aria-label') || '').trim().replace(/\s+/g,' ')).filter(t => t && t.length < 200));
  console.log(`${tag}: ${JSON.stringify([...new Set(items)].slice(0,90))}`);
  await page.screenshot({ path: path.join(out, `s-${tag}.png`), fullPage: true });
};

test("build minimal send customised email rule and read audit log", async () => {
  test.setTimeout(300_000);
  const ctx = await launchHarnessContext({ headed: false });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  try {
  await page.goto("https://wolfaenpak.atlassian.net/jira/settings/automation", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  // close any stray modal (e.g. leftover Create Task dialog from a prior aborted run)
  for (const name of [/^close$/i, /^cancel$/i]) {
    const b = page.getByRole("button", { name }).first();
    if (await b.count()) { await b.click().catch(()=>{}); await page.waitForTimeout(800); }
  }
  await page.keyboard.press("Escape").catch(()=>{});
  await page.waitForTimeout(500);
  await dump(page, "1-landing");

  await page.getByRole("button", { name: /create flow/i }).first().click();
  await page.waitForTimeout(1500);
  const fromScratch = page.getByRole("menuitem", { name: /create from scratch/i }).first();
  if (await fromScratch.count()) { await fromScratch.click(); await page.waitForTimeout(5000); }
  const discard = page.getByRole("button", { name: /discard changes/i }).first();
  if (await discard.count()) { await discard.click(); await page.waitForTimeout(6000); }
  await dump(page, "2-builder-open");

  // Trigger: Manual trigger from work item (exact text match)
  const trigSearch = page.getByPlaceholder(/search triggers/i).first();
  await trigSearch.click(); await trigSearch.fill("Manual trigger from work item"); await page.waitForTimeout(2000);
  await dump(page, "3-trigger-search");
  await page.getByText(/^Manual trigger from work item$/i).first().click();
  await page.waitForTimeout(4000);
  await dump(page, "4-trigger-picked");
  const saveTrig = page.getByRole("button", { name: /^save$/i }).first();
  if (await saveTrig.count()) { await saveTrig.click(); await page.waitForTimeout(2500); }
  await dump(page, "4b-after-save");

  // Advance past trigger panel
  const nextBtn = page.getByRole("button", { name: /^next$/i }).first();
  if (await nextBtn.count()) { await nextBtn.click(); await page.waitForTimeout(3000); }
  await dump(page, "5b-after-next");

  // Action: click the "+" add-step button on the canvas
  const addStep = page.locator('button:has-text("+")').first();
  const plusBtn = page.getByRole("button", { name: "Add step" }).first();
  if (await plusBtn.count()) { await plusBtn.click(); }
  else { await addStep.click(); }
  await page.waitForTimeout(2500);
  await dump(page, "5c-add-step-menu");
  const actionEntry = page.getByText(/^Action$/i).first();
  if (await actionEntry.count()) { await actionEntry.click(); await page.waitForTimeout(3000); }
  await dump(page, "6-actionpicker");
  const actSearch = page.getByPlaceholder(/search actions/i).first();
  await actSearch.click(); await actSearch.fill("Send customized email"); await page.waitForTimeout(2000);
  await dump(page, "7-action-search");
  const sendEmailOpt = page.getByText(/^Send customi[sz]ed email$/i).first();
  await sendEmailOpt.click(); await page.waitForTimeout(4000);
  await dump(page, "8-action-picked");

  // Recipient field - find the actual labeled recipient combobox
  const recLabel = page.getByText(/^Recipient/i).first();
  if (await recLabel.count()) {
    const box = recLabel.locator('xpath=following::*[@role="combobox" or self::input or self::textarea][1]').first();
    if (await box.count()) {
      await box.click({ force: true });
      await box.type("mihai.researcher.test@gmail.com", { delay: 30 });
      await page.waitForTimeout(1500);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(1500);
    } else { console.log("NO RECIPIENT BOX FOUND"); }
  } else { console.log("NO RECIPIENT LABEL FOUND"); }
  await dump(page, "9-recipient-filled");

  const subjLabel = page.getByText(/^Subject/i).first();
  if (await subjLabel.count()) {
    const sbox = subjLabel.locator('xpath=following::input[1]').first();
    if (await sbox.count()) { await sbox.click({force:true}); await sbox.type("Researcher test - please ignore", {delay:20}); }
  }
  await dump(page, "10-subject-filled");

  const nameBoxField = page.getByPlaceholder(/enter a name for your email/i).first();
  if (await nameBoxField.count()) { await nameBoxField.click({force:true}); await nameBoxField.type("Researcher test rule", {delay:20}); }
  await dump(page, "10b-emailname-filled");

  const contentTab = page.getByRole("tab", { name: /content/i }).first();
  if (await contentTab.count()) { await contentTab.click(); } else { await page.getByText(/^Content$/i).first().click().catch(()=>{}); }
  await page.waitForTimeout(1500);
  await dump(page, "11a-content-tab");
  const cbox = page.locator('[contenteditable="true"]').first();
  if (await cbox.count()) { await cbox.click({force:true}); await cbox.type("This is a researcher test email. Please ignore.", {delay:20}); }
  else { console.log("NO CONTENTEDITABLE FOUND"); }
  await dump(page, "11-content-filled");

  const saveAction = page.getByRole("button", { name: /^save$/i }).first();
  if (await saveAction.count()) { await saveAction.click(); await page.waitForTimeout(3000); }
  await dump(page, "12-action-saved");

  const nameBox = page.getByText(/^Untitled flow$/i).first();
  if (await nameBox.count()) {
    await nameBox.click(); await page.keyboard.press("Control+A"); await page.keyboard.type("RESEARCH TEST - send customised email - delete after");
    await page.keyboard.press("Enter"); await page.waitForTimeout(1000);
  }
  const saveEnable = page.getByRole("button", { name: /save and enable/i }).first();
  await saveEnable.click(); await page.waitForTimeout(5000);
  await dump(page, "13-flow-saved");

  console.log("CURRENT_URL:" + page.url());
  } finally {
    await ctx.close();
  }
});
