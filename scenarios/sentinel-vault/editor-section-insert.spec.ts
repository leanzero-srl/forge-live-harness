// Sentinel Vault — the Sealed Section macro inserted through the REAL Confluence editor
// (insert menu → Custom UI config dialog → "Insert section" → publish). Every other section
// spec seeds the seal via the dev hook, so this path had NO coverage, and on 2026-09-14 the owner
// found it broken in production: the editor rejected `view.submit({})` with
// 'Invalid "config" provided. Expected object' and the dialog only said "Could not insert".
// Fixed by submitting `{ config: {} }`. This spec keeps the editor contract honest.
import { test, expect } from "../../fixtures/forge";
import { BASE_URL } from "../../config/env";
import { spaceIdByKey, createPage, deletePage } from "../../data/confluence.mjs";
import { heading, paragraph } from "../../data/adf.mjs";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
let PAGE = "";

test.describe.configure({ timeout: 180_000 });

test.beforeAll(async () => {
  const spaceId = await spaceIdByKey(SPACE);
  const created = await createPage({
    spaceId, title: `HARNESS sv-editor-insert ${Date.now()}`,
    adf: { type: "doc", version: 1, content: [heading("Alpha", 2), paragraph("alpha body")] },
  });
  PAGE = String(created.id);
});
test.afterAll(async () => { if (PAGE) await deletePage(PAGE).catch(() => {}); });

test("editor: insert the Sealed Section macro through the config panel", async ({ page }) => {
  const logs: string[] = [];
  page.on("console", (m) => logs.push(`[${m.type()}] ${m.location().url.slice(0, 60)} :: ${m.text()}`));
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

  await page.goto(`${BASE_URL}/wiki/pages/resumedraft.action?draftId=${PAGE}`, { waitUntil: "domcontentloaded" });
  const editor = page.locator('[data-testid="ak-editor-main-toolbar"], .ProseMirror').first();
  await editor.waitFor({ timeout: 60_000 });
  const para = page.locator('.ProseMirror p:has-text("alpha body")').first();
  await para.waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2000);
  await para.click({ position: { x: 80, y: 8 } });
  await page.waitForTimeout(500);
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  // toolbar "+" insert menu (more robust than the slash popup under automation)
  const plus = page.locator('[data-testid="ak-editor-main-toolbar"] button[aria-label*="Insert"], button[aria-label="Insert elements"], button[aria-label="Insert /"]').first();
  if (await plus.count()) { await plus.click(); } else { await page.keyboard.type("/", { delay: 80 }); }
  await page.waitForTimeout(1500);
  await page.keyboard.type("Sealed Section", { delay: 60 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "test-results/editor-section-insert-1-menu.png" });
  const item = page.locator('[role="option"], [data-testid*="quick-insert"] button, [data-testid="element-browser"] [role="listitem"], [data-testid="element-items"] button').filter({ hasText: /Sealed Section/i }).first();
  if (await item.count()) { console.log("### picked menu item"); await item.click(); } else { console.log("### no menu item found, pressing Enter"); await page.keyboard.press("Enter"); }
  await page.waitForTimeout(5000);
  
  // the config panel is a Custom UI iframe; find the button inside any frame
  let clicked = false;
  for (let i = 0; i < 20 && !clicked; i++) {
    for (const f of page.frames()) {
      const btn = f.locator("button.sec-btn");
      if (await btn.count()) {
        console.log("### config frame:", f.url().slice(0, 100));
        await btn.first().click();
        clicked = true;
        break;
      }
    }
    if (!clicked) await page.waitForTimeout(1000);
  }
  console.log("### clicked Insert:", clicked);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: "test-results/editor-section-insert-2-after.png" });
  for (const f of page.frames()) {
    const btn = f.locator("button.sec-btn");
    if (await btn.count()) console.log("### button text now:", await btn.first().innerText());
  }
  console.log("### CONSOLE:\n" + logs.filter((l) => /SECTION|submit/i.test(l)).join("\n"));
  expect(clicked, "the Insert section button was found").toBe(true);
  // the config dialog closes on a successful submit → no sec-btn left in any frame
  let stillOpen = false;
  for (const f of page.frames()) if (await f.locator("button.sec-btn").count()) stillOpen = true;
  expect(stillOpen, "config dialog closed after Insert (submit accepted)").toBe(false);
  // publish and verify the wrapper landed in the page body
  await page.getByRole("button", { name: /^(Update|Publish)$/ }).first().click();
  await page.waitForTimeout(6000);
  const res = await page.request.get(`${BASE_URL}/wiki/api/v2/pages/${PAGE}?body-format=atlas_doc_format`);
  const body = (await res.json()).body.atlas_doc_format.value as string;
  const keys = [...body.matchAll(/"extensionKey":"([^"]+)"/g)].map((m) => m[1]);
  console.log("### extensionKeys after publish:", keys);
  expect(keys.some((k) => /sentinel-vault-sealed-section/.test(k)), "sealed-section bodiedExtension is on the page").toBe(true);
});
