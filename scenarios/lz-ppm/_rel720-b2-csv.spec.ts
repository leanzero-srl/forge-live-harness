// dev 7.20.0 release proof — fixture follow-up: fresh open after the Apply (anything staged?), header
// word on a plan with no late ticket, and the Dashboard Export CSV captured from the Blob.
import { test, expect } from "../../fixtures/forge";
import { boot, openPlan, tab, shot, bodyText, isStaged, log, OUT, bars, header, FX } from "./_rel720-lib";
import fs from "node:fs";

test.describe.configure({ retries: 0, timeout: 900_000 });

test("rel720 B2: fixture fresh open + Dashboard CSV", async ({ page }) => {
  const { frame, real } = await boot(page);
  await openPlan(page, frame, FX);
  await tab(page, frame, "gantt");
  await page.waitForTimeout(5000);
  log("B2_STAGED_ON_OPEN", await isStaged(frame));
  log("B2_SAVE_BTN", await real.evaluate(() => { const b = document.querySelector('[data-testid="plan-save-btn"]') as any; return b ? { text: b.textContent, has: b.getAttribute("data-has-changes"), state: b.getAttribute("data-save-state"), title: b.getAttribute("title") } : null; }));
  log("B2_APPLY_BTN", await frame.locator('[data-testid="plan-apply-btn"]').first().textContent().catch(() => null));
  log("B2_HEADER", await header(real));
  log("B2_BARS", await bars(real));
  await shot(page, "b2-01-open");
  await tab(page, frame, "dashboard"); await page.waitForTimeout(4000);
  await real.evaluate(() => {
    (window as any).__csv = [];
    const orig = URL.createObjectURL.bind(URL);
    (URL as any).createObjectURL = (b: any) => { try { b.text().then((t: string) => (window as any).__csv.push(t)); } catch (e) { /* */ } return orig(b); };
    document.addEventListener("click", (e: any) => { const a = e.target?.closest?.("a[download]"); if (a) e.preventDefault(); }, true);
    const oc = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: any) { if (this.hasAttribute("download")) return; return oc.call(this); };
  });
  await frame.getByRole("button", { name: /Export CSV/ }).first().click();
  await page.waitForTimeout(4000);
  const csv = await real.evaluate(() => (window as any).__csv);
  fs.writeFileSync(`${OUT}/b2-dashboard.csv`, (csv || []).join("\n-----\n"));
  log("CSV_COUNT", (csv || []).length);
  log("CSV_HEAD", ((csv || [])[0] || "").split("\n")[0]);
  log("CSV_LINES", (csv || []).join("\n").split("\n").filter((l: string) => /1\+1|2\+3/.test(l)));
  await shot(page, "b2-02-dashboard");
  log("B2_END_STAGED", await isStaged(frame));
  expect(true).toBe(true);
});
