// One-off (owner-sanctioned 2026-08-14): remove the legacy "Attachment Locker" dev app from
// wolfaenpak's Manage Apps. Uses the shared harness Chrome profile (mihai, site admin).
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "/tmp/sv-upm";
import { mkdirSync } from "node:fs";
mkdirSync(OUT, { recursive: true });

const ctx = await chromium.launchPersistentContext(path.join(ROOT, ".auth", "profile"), {
  headless: false,
  viewport: { width: 1440, height: 900 },
});
let page = ctx.pages()[0] || (await ctx.newPage());
try {
  // UPM is retired — the wiki page offers a context-carrying "Take me there" deep link into
  // admin.atlassian.com Connected Apps; an Atlassian account chooser may interpose.
  await page.goto("https://wolfaenpak.atlassian.net/wiki/plugins/servlet/upm", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  const take = page.locator('button:has-text("Take me there"), a:has-text("Take me there")').first();
  if (await take.count()) {
    const [popup] = await Promise.all([
      page.context().waitForEvent("page", { timeout: 8000 }).catch(() => null),
      take.click(),
    ]);
    if (popup) { await popup.waitForLoadState("domcontentloaded"); page = popup; }
  }
  await page.waitForTimeout(6000);
  const cont = page.locator('button:has-text("Continue")').first();
  if (await cont.count()) { await cont.click(); await page.waitForTimeout(8000); }
  await page.screenshot({ path: `${OUT}/1-upm.png`, fullPage: true });

  const row = page.locator('tr:has-text("Attachment Locker"), div[role="row"]:has-text("Attachment Locker"), a:has-text("Attachment Locker")').first();
  if (!(await row.count())) {
    console.log("NOT-FOUND: no 'Attachment Locker' row on Manage apps");
    process.exit(2);
  }
  await row.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/2-expanded.png`, fullPage: true });

  const uninstall = page.locator('button:has-text("Uninstall"), a:has-text("Uninstall")').first();
  if (!(await uninstall.count())) {
    console.log("NO-UNINSTALL-BUTTON: row expanded but no Uninstall control");
    process.exit(3);
  }
  await uninstall.click();
  await page.waitForTimeout(1500);
  const confirm = page.locator('[role="dialog"] button:has-text("Uninstall"), section[role="dialog"] button:has-text("Uninstall"), button:has-text("Uninstall app")').last();
  if (await confirm.count()) await confirm.click();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUT}/3-after.png`, fullPage: true });

  const still = await page.locator(':has-text("Attachment Locker")').count();
  console.log(still === 0 ? "UNINSTALLED: Attachment Locker gone from Manage apps" : `POST-CHECK: ${still} 'Attachment Locker' text nodes remain (verify screenshot)`);
} finally {
  await ctx.close();
}
