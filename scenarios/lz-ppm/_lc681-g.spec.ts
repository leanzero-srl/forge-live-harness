// LIVE CHECK dev 6.81.0 — ITEM 6 (CSV, captured WITHOUT triggering a download:
// the anchor click is intercepted and the blob URL read back) + item-5 leftovers.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/shots";
const NAME = "Derived Lag Bed";
test.describe.configure({ retries: 1, timeout: 2_400_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";

test("item 6 — CSV columns and provenance", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.frame;
  const f: any = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 150_000 });
  await page.waitForTimeout(3000);
  const R: any = {};

  // item 5c: wizard
  await frame.getByRole("button", { name: /New plan|Create plan/i }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(5000);
  R.wizardBody = (await txt(frame.locator("body"))).replace(/\s+/g, " ").slice(0, 1500);
  R.wizardSteps = await f.evaluate(() => [...document.querySelectorAll("*")]
    .filter((e: any) => e.children.length === 0 && /^(Sources|Name|Targets|Milestones|Calendar|Review|Fields|Schedule|Basics)$/i.test((e.textContent || "").trim()))
    .map((e: any) => (e.textContent || "").trim()));
  console.log("WIZARD STEPS", JSON.stringify(R.wizardSteps));
  console.log("WIZARD BODY", R.wizardBody);
  await page.screenshot({ path: `${OUT}/g01-wizard.png` });
  await frame.getByRole("button", { name: /^(Cancel|Close)$/i }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(3000);

  await frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first().click();
  await page.waitForTimeout(16000);

  // item 5a: strip glosses
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await frame.locator('[data-testid="plan-explain-btn"]').first().dispatchEvent("click").catch(async () => {
    await frame.getByRole("button", { name: /Explain this plan/i }).first().dispatchEvent("click");
  });
  await page.waitForTimeout(22000);
  R.stripCells = await f.evaluate(() => {
    const strip: any = document.querySelector('[data-testid="explain-facts-strip"]');
    if (!strip) return [];
    return [...strip.children].map((c: any) => ({ text: (c.innerText || "").replace(/\n/g, " ~ "), title: c.getAttribute("title"), inner: [...c.querySelectorAll("*")].map((x: any) => x.getAttribute("title")).filter(Boolean) }));
  });
  console.log("STRIP CELLS", JSON.stringify(R.stripCells, null, 1));
  await page.screenshot({ path: `${OUT}/g02-explain-strip.png` });
  await frame.getByRole("button", { name: /^(Close|Cancel|Done)$/ }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(3000);

  // item 6
  await frame.getByRole("button", { name: /^Dashboard$/i }).first().click().catch(() => {});
  await page.waitForTimeout(12000);
  // Intercept the anchor click so NO download is ever started (a real download
  // kills this headless context) and read the blob back through fetch.
  await f.evaluate(() => {
    (window as any).__hrefs = [];
    const proto: any = HTMLAnchorElement.prototype;
    if (!(proto as any).__patched) {
      const orig = proto.click;
      proto.click = function () {
        if (this.download && String(this.href).startsWith("blob:")) { (window as any).__hrefs.push({ name: this.download, href: this.href }); return; }
        return orig.apply(this, arguments as any);
      };
      (proto as any).__patched = true;
    }
  });
  const btnInfo = async (re: RegExp) => {
    const b = frame.locator("button").filter({ hasText: re }).first();
    return { label: (await txt(b)).replace(/\n/g, " "), title: await b.getAttribute("title").catch(() => null) };
  };
  R.exportBtn = await btnInfo(/^Export CSV$/i);
  R.healthBtn = await btnInfo(/^Health report$/i);
  await frame.locator("button").filter({ hasText: /^Export CSV$/i }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(4000);
  await frame.locator("button").filter({ hasText: /^Health report$/i }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(4000);
  R.files = await f.evaluate(async () => {
    const out: any[] = [];
    for (const h of (window as any).__hrefs || []) {
      try { out.push({ name: h.name, text: await (await fetch(h.href)).text() }); }
      catch (e) { out.push({ name: h.name, text: `(err ${e})` }); }
    }
    return out;
  });
  console.log("BUTTONS", JSON.stringify({ exp: R.exportBtn, health: R.healthBtn }));
  for (const fl of R.files) { console.log("FILE", fl.name); console.log(String(fl.text).slice(0, 1800)); }
  await page.screenshot({ path: `${OUT}/g03-dash.png` });

  const body = (await txt(frame.locator("body"))).replace(/\s+/g, " ");
  R.finalStaged = /Apply\s+\d+\s+change|Save\s*\(\d+\)/.test(body);
  console.log("STAGED_AFTER_CLEANUP =", R.finalStaged);
  fs.writeFileSync(`${OUT}/g-results.json`, JSON.stringify(R, null, 2));
  expect(R.files.length).toBeGreaterThan(0);
});
