import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { enterForgeSurface } from "../../forge/frame";
import { mkdirSync } from "node:fs";
const T = getTarget("sentinel-steward-console");
test.describe.configure({ retries: 1 });
const OUT = "/tmp/sv-steward";
test("steward-console loads past spinner + tabs + save (deep)", async ({ page }) => {
  const errs: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push("CONSOLE.ERR: " + m.text().slice(0,180)); });
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + String(e).slice(0,180)));
  mkdirSync(OUT, { recursive: true });
  const shot = async (n: string) => { await page.screenshot({ path: `${OUT}/${n}.png` }); };
  const t0 = Date.now();
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  // readySelector .admin-title — a spinner won't match, so this FAILS if the console hangs.
  const surface = await enterForgeSurface(page, { surface: "custom", readySelector: ".admin-title", timeout: 45000 });
  if (surface.kind !== "custom") throw new Error("no custom iframe");
  const app = surface.frame;
  console.log(`### loaded in ${((Date.now()-t0)/1000).toFixed(0)}s`);
  const title = (await app.locator(".admin-title").innerText().catch(()=>"")).trim();
  console.log("### title:", JSON.stringify(title));
  await shot("st-01-loaded");

  // walk tabs if present
  const tabs = app.locator(".tab-navigation .tab-button");
  const n = await tabs.count().catch(()=>0);
  const names: string[] = [];
  for (let i=0;i<n;i++) names.push((await tabs.nth(i).innerText().catch(()=>"")).trim());
  console.log("### steward tabs:", JSON.stringify(names));
  for (let i=0;i<n;i++){ await tabs.nth(i).click().catch(()=>{}); await page.waitForTimeout(1000); await shot(`st-tab-${i}-${(names[i]||i).replace(/\W+/g,'')}`); const body=(await app.locator("body").innerText().catch(()=>"")).replace(/\s+/g," "); if(/could not load|failed to load|unable to load/i.test(body)) errs.push(`tab ${names[i]} error banner`); if(/\bPreparing\b/i.test(body)) errs.push(`tab ${names[i]} stuck spinner`); }

  // interact: toggle a pref + Save (verify it16 save-surfacing live)
  const anyToggle = app.locator('.settings-row input[type=checkbox]').first();
  if (await anyToggle.count().catch(()=>0)) { const was=await anyToggle.isChecked().catch(()=>null); await anyToggle.click().catch(()=>{}); await page.waitForTimeout(500);
    await app.locator('button:has-text("Save"), .btn-primary').first().click().catch((e)=>errs.push("st-save: "+e.message)); await page.waitForTimeout(1800); await shot("st-after-save");
    const msg = await app.locator(".alert-success, .alert-error, [class*='message']").allInnerTexts().catch(()=>[]); console.log("### steward save msg:", JSON.stringify(msg.slice(0,3)));
    if (was!==null){ const now=await anyToggle.isChecked().catch(()=>null); if(now!==was){ await anyToggle.click().catch(()=>{}); await page.waitForTimeout(400); await app.locator('button:has-text("Save"), .btn-primary').first().click().catch(()=>{}); await page.waitForTimeout(1200);} }
  }
  console.log("\n### ERRORS (" + errs.length + "):"); errs.slice(0,25).forEach(e=>console.log("  "+e));
});
