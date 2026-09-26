// LIVE CHECK dev 6.81.0 — ITEM 6 (CSV) + the item-5 leftovers (wizard step, strip glosses).
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
  const downloads: any[] = [];
  page.on("download", async (d) => {
    try { const p = await d.path(); downloads.push({ name: d.suggestedFilename(), text: p ? fs.readFileSync(p, "utf8") : "(no path)" }); }
    catch (e) { downloads.push({ name: d.suggestedFilename(), text: `(err ${e})` }); }
  });
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

  // ---- item 5c: wizard step reads "Targets"
  await frame.getByRole("button", { name: /New plan|Create plan/i }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(5000);
  R.wizardBody = (await txt(frame.locator("body"))).replace(/\s+/g, " ").slice(0, 1400);
  R.wizardSteps = await f.evaluate(() => [...document.querySelectorAll("*")]
    .filter((e: any) => e.children.length === 0 && /^(Sources|Name|Targets|Milestones|Calendar|Review|Fields|Schedule|Basics)$/i.test((e.textContent || "").trim()))
    .map((e: any) => (e.textContent || "").trim()));
  console.log("WIZARD STEPS", JSON.stringify(R.wizardSteps));
  console.log("WIZARD BODY", R.wizardBody);
  await page.screenshot({ path: `${OUT}/f01-wizard.png` });
  await frame.getByRole("button", { name: /^(Cancel|Close)$/i }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(3000);

  await frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first().click();
  await page.waitForTimeout(16000);

  // ---- item 5a leftovers: strip cell glosses (title attributes)
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
  await page.screenshot({ path: `${OUT}/f02-explain-strip.png` });
  await frame.getByRole("button", { name: /^(Close|Cancel|Done)$/ }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(3000);

  // ---- item 6: CSV
  await frame.getByRole("button", { name: /^Dashboard$/i }).first().click().catch(() => {});
  await page.waitForTimeout(12000);
  const exportBtn = frame.locator("button").filter({ hasText: /^Export CSV$/i }).first();
  R.exportLabel = await txt(exportBtn);
  R.exportTitle = await exportBtn.getAttribute("title").catch(() => null);
  await exportBtn.dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(6000);
  const health = frame.locator("button").filter({ hasText: /^Health report$/i }).first();
  await health.dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(6000);
  R.downloads = downloads.map((d) => ({ name: d.name, head: String(d.text).split("\n").slice(0, 6) }));
  console.log("EXPORT BTN", JSON.stringify({ label: R.exportLabel, title: R.exportTitle }));
  for (const d of downloads) { console.log("FILE", d.name); console.log(String(d.text).slice(0, 1500)); }
  await page.screenshot({ path: `${OUT}/f03-dash.png` });

  const body = (await txt(frame.locator("body"))).replace(/\s+/g, " ");
  R.finalStaged = /Apply\s+\d+\s+change|Save\s*\(\d+\)/.test(body);
  console.log("STAGED_AFTER_CLEANUP =", R.finalStaged);
  fs.writeFileSync(`${OUT}/f-results.json`, JSON.stringify({ ...R, downloads: downloads.map((d) => ({ name: d.name, text: String(d.text) })) }, null, 2));
  expect(downloads.length).toBeGreaterThan(0);
});
