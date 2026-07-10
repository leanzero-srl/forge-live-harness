// PERMANENT accessibility + microcopy regression guard consolidating the it35/36/37 SHIPPED fixes
// (previously verified only with throwaway specs). Guards against silent regression of:
//   it35  overlay sort-picker keyboard-operability (role=listbox/option + tabindex) + close aria-label
//   it37  overlay owner-seal status label converged to "My Reservation" (was "Yours")
//   it36  inline-panel label-add button accessible name (glyph "+" is not the accessible name)
// Dev-scoped (env 17516615). Read-only.
import { test, expect } from "../../fixtures/forge";
const PAGE = "https://wolfaenpak.atlassian.net/wiki/pages/viewpage.action?pageId=265912321";
const DEV = "17516615";
test.describe.configure({ retries: 1 });

async function openPageIframes(page: any) {
  await page.goto(PAGE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);
  return page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"], iframe[src*="atlassian-dev.net"]');
}
async function findDevPanel(iframes: any) {
  const n = await iframes.count();
  for (let i = 0; i < n; i++) {
    const src = (await iframes.nth(i).getAttribute("src").catch(() => "")) || "";
    if (!src.includes(DEV)) continue;
    const cf = iframes.nth(i).contentFrame();
    if ((await cf.locator(".sv-panel-container").count().catch(() => 0)) > 0) return cf;
  }
  return null;
}
async function openDevOverlay(page: any, iframes: any) {
  const n = await iframes.count(); let bi = -1;
  for (let i = 0; i < n; i++) { const s = (await iframes.nth(i).getAttribute("src").catch(() => "")) || ""; if (!s.includes(DEV)) continue; const t = (await iframes.nth(i).contentFrame().locator("body").innerText().catch(() => "")) || ""; if (/Manage Attachments/i.test(t) && (await iframes.nth(i).contentFrame().locator(".sv-panel-container").count().catch(() => 0)) === 0) bi = i; }
  await iframes.nth(bi).contentFrame().locator(".ribbon-action", { hasText: "Manage" }).click();
  await page.waitForTimeout(5000);
  const all = page.locator("iframe"); const m = await all.count(); let ov: any = null, best = 0;
  for (let i = 0; i < m; i++) { const s = (await all.nth(i).getAttribute("src").catch(() => "")) || ""; if (!s.includes(DEV)) continue; const cf = all.nth(i).contentFrame(); if ((await cf.locator(".artifact-card .action-btn").count().catch(() => 0)) <= 0) continue; const b = await all.nth(i).boundingBox().catch(() => null); const a = b ? b.width * b.height : 0; if (a > best) { best = a; ov = cf; } }
  return ov;
}

test("overlay a11y + microcopy: sort keyboard-operable, close named, owner status = My Reservation", async ({ page }) => {
  const iframes = await openPageIframes(page);
  const ov = await openDevOverlay(page, iframes);
  expect(ov, "dev overlay opened").toBeTruthy();
  // it35: close button accessible name
  expect(await ov.locator(".modal-close").getAttribute("aria-label")).toBe("Close Sentinel Vault overlay");
  // it37: owner-seal status label converged
  expect((await ov.locator(".status-lozenge.locked-by-me").first().innerText()).trim().toLowerCase()).toContain("my reservation");
  // it35: sort-picker keyboard-operability
  const trig = ov.locator(".sort-picker .column-picker-trigger");
  expect(await trig.getAttribute("aria-haspopup")).toBe("listbox");
  await trig.click(); await page.waitForTimeout(400);
  expect(await trig.getAttribute("aria-expanded")).toBe("true");
  const opts = ov.locator('.sort-picker .column-picker-dropdown[role="listbox"] [role="option"]');
  expect(await opts.count()).toBeGreaterThanOrEqual(2);
  expect(await opts.first().getAttribute("tabindex")).toBe("0");
});

test("inline-panel a11y: the '+' label-add button has an accessible name", async ({ page }) => {
  const iframes = await openPageIframes(page);
  const panel = await findDevPanel(iframes);
  expect(panel, "dev inline-panel present").toBeTruthy();
  const add = panel.locator(".label-add-btn").first();
  await expect(add).toBeVisible({ timeout: 12000 });
  expect(await add.getAttribute("aria-label")).toBe("Add a label");
});
