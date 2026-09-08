#!/usr/bin/env node
// Install a Marketplace app on the harness's site through the IN-PRODUCT marketplace, using the
// harness's own logged-in profile. Learned 2026-09-08 installing Kantega for the E.ON work:
//   - marketplace.atlassian.com needs its OWN login and cannot be driven headless; the in-product
//     page at /wiki/marketplace/discover (Confluence) or /jira/marketplace/discover (Jira) uses the
//     product session and can.
//   - its search box is placeholder "Describe what you're looking for"; the top-bar box is the
//     product's CONTENT search and navigates away.
//   - "Try it free" opens "Start your free trial" with a site picker and a REQUIRED "Review and
//     agree" checkbox; "Start free trial" is a silent no-op until it is ticked.
//   - install controls match /install/ loosely ("Installs information"), so match exact names.
//   - after "Start free trial" a "setting up your app" dialog runs for a minute or two — POLL for it
//     to close; a fixed short wait reports a working install as a failure.
//   - Forge apps never appear in UPM; verify by the sidebar Apps entry, then discover the deep link.
//
//   node scripts/install-marketplace-app.mjs --product confluence --app "Kantega User Management" [--site wolfaenpak]
import { chromium } from "playwright"; import fs from "node:fs";
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const PRODUCT = arg("--product", "confluence"), APP = arg("--app"), SITE = arg("--site", "wolfaenpak");
if (!APP) { console.error("--app <name fragment> required"); process.exit(64); }
const BASE = `https://${SITE}.atlassian.net`, ROOT = PRODUCT === "jira" ? "/jira" : "/wiki";
const L = (...a) => console.log("[install]", ...a);
const ctx = await chromium.launchPersistentContext(new URL("../.auth/profile", import.meta.url).pathname, { headless: true, viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
let ok = false;
try {
  await page.goto(`${BASE}${ROOT}/marketplace/discover`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(9000);
  if (/log in/i.test(await page.title())) throw new Error("session expired — npm run auth");
  const box = page.getByPlaceholder(/Describe what you're looking for/i).first();
  await box.fill(APP); await box.press("Enter"); await page.waitForTimeout(9000);
  const card = page.getByText(new RegExp(APP.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")).first();
  if (!(await card.count())) throw new Error(`no card matching "${APP}"`);
  await card.click(); await page.waitForTimeout(9000);
  L("card:", page.url());
  const already = await page.getByRole("button", { name: /^(manage|open|configure|get started)/i }).count();
  if (already && !(await page.getByRole("button", { name: /^Try it free$/i }).count())) { L("already installed (no Try it free)"); ok = true; }
  else {
    await page.getByRole("button", { name: /^Try it free$/i }).first().click({ timeout: 10000 });
    await page.waitForTimeout(8000);
    const dl = page.locator("[role=dialog]").first();
    if (!(await dl.count())) throw new Error("no trial dialog opened");
    const siteOpt = dl.getByText(new RegExp(SITE, "i")).first(); if (await siteOpt.count()) { await siteOpt.click().catch(() => {}); await page.waitForTimeout(1000); }
    // the required agreement — tick every checkbox in the dialog that is not already checked
    const boxes = dl.getByRole("checkbox"); const n = await boxes.count(); L("agreement checkboxes:", n);
    for (let i = 0; i < n; i++) { const c = boxes.nth(i); if (!(await c.isChecked().catch(() => false))) await c.check({ force: true }).catch(async () => { await c.click({ force: true }).catch(() => {}); }); }
    await page.waitForTimeout(1200);
    const start = dl.getByRole("button", { name: /^Start free trial$/i }).first();
    L("Start free trial enabled:", await start.isEnabled().catch(() => "?"));
    await start.click({ timeout: 10000 });
    // Provisioning shows "One moment, we're setting up your app — this should take a minute or two".
    // A fixed 20s wait read that as failure on 2026-09-08. Poll for the dialog to go, up to 3 min.
    for (let w = 0; w < 36 && (await page.locator("[role=dialog]").count()); w++) await page.waitForTimeout(5000);
    await page.screenshot({ path: "/tmp/install-after.png" });
    const txt = (await page.innerText("body").catch(() => "")).replace(/\n+/g, " | ");
    const dlgGone = (await page.locator("[role=dialog]").count()) === 0;
    L("dialog closed:", dlgGone); L("page says:", (txt.match(/.{0,80}(installed|installing|trial started|successfully|added).{0,120}/i) || [txt.slice(0, 200)])[0]);
    ok = dlgGone || /installed|trial started|successfully/i.test(txt);
  }
  // verify via the sidebar (the only place a Forge app shows), then discover the deep link
  await page.goto(`${BASE}${ROOT}/home`, { waitUntil: "domcontentloaded", timeout: 45000 }); await page.waitForTimeout(7000);
  const apps = page.getByRole("button", { name: /^Apps$/i }).first(); if (await apps.count()) { await apps.click().catch(() => {}); await page.waitForTimeout(2500); }
  const links = await page.$$eval("a[href]", els => els.map(e => ({ t: (e.innerText || "").trim(), h: e.getAttribute("href") || "" })));
  const entry = links.find(l => new RegExp(APP.split(" ")[0], "i").test(l.t + l.h));
  L("sidebar entry:", entry ? `${entry.t} -> ${entry.h}` : "NOT FOUND");
  if (entry) {
    await page.goto(BASE + entry.h, { waitUntil: "domcontentloaded", timeout: 45000 }); await page.waitForTimeout(8000);
    const m = page.url().match(/\/apps\/([0-9a-f-]{36})\/([0-9a-f-]{36})(?:\/([^/?#]+))?/);
    L("deep link:", page.url());
    if (m) { const [, app, env, route] = m; const K = APP.split(" ")[0].toUpperCase().replace(/[^A-Z0-9]/g, "");
      let e = fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : ""; e = e.replace(new RegExp(`^${K}_(APP_ID|ENV_ID|ROUTE)=.*\\n?`, "gm"), "");
      fs.writeFileSync(".env", e.trimEnd() + `\n${K}_APP_ID=ari:cloud:ecosystem::app/${app}\n${K}_ENV_ID=${env}\n${K}_ROUTE=${route || ""}\n`, { mode: 0o600 });
      L(`wrote .env ${K}_APP_ID/ENV_ID/ROUTE  app=${app} env=${env} route=${route || ""}`); ok = true; }
  }
} catch (e) { L("ERR", e.message.slice(0, 160)); }
await ctx.close(); process.exit(ok ? 0 : 1);
