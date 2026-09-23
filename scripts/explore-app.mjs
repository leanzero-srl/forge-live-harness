// Read-mostly feature walk of a Forge app: click every nav item, then every tab within it; capture text + screenshot
// per screen; optionally record a captioned video. No form is submitted. Env: BASE, HARNESS_PROFILE, URL, NAV (a|b|c),
// OUT dir, LABEL, VIDEO=1. Prints a JSON index of screens with char counts and the words that matter for a licence app.
import { chromium } from 'playwright'; import fs from 'fs'; import path from 'path';
const { URL: url, HARNESS_PROFILE: profile, OUT = 'scratch/explore', LABEL = 'test site', VIDEO } = process.env;
const NAV = (process.env.NAV ?? 'Dashboard|Scheduling and Cleanup|Users|History|Settings').split('|');
fs.mkdirSync(OUT, { recursive: true });
const ctx = await chromium.launchPersistentContext(profile, { headless: true, viewport:{width:1440,height:900}, ...(VIDEO ? { recordVideo:{ dir: OUT, size:{width:1440,height:900} } } : {}) });
const p = await ctx.newPage(); const index = [];
const hold = ms => p.waitForTimeout(ms);
const caption = async (t, s='') => { if (!VIDEO) return; await p.evaluate(([t,s]) => { let c=document.getElementById('lz-cap'); if(!c){c=document.createElement('div');c.id='lz-cap';document.body.appendChild(c);} c.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#0052CC;color:#fff;font:600 22px/1.3 -apple-system,Helvetica,Arial;padding:16px 28px'; c.innerHTML=`<div>${t}</div><div style="font-weight:400;font-size:16px;margin-top:4px">${s}</div>`; }, [t,s]); };
const appFrame = () => p.frames().filter(f => f !== p.mainFrame() && /cdn|forge|atlassian-dev|ecosystem/i.test(f.url())).sort((a,b)=>b.url().length-a.url().length)[0] ?? p.frames().find(f=>f!==p.mainFrame());
const textOf = async () => { let best=''; for (const f of p.frames()) { try { const t=(await f.locator('body').innerText()).replace(/\s+/g,' ').trim(); if (t.length>best.length && f!==p.mainFrame()) best=t; } catch {} } return best; };
const snap = async (name, title, sub) => { await caption(title, sub); await hold(VIDEO ? 6000 : 1500); const t = await textOf(); const fn = `${OUT}/${String(index.length+1).padStart(2,'0')}-${name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}`; await p.screenshot({ path: fn+'.png', fullPage: false }); fs.writeFileSync(fn+'.txt', t); const kw=(t.match(/dry.?run|review|preview|test mode|revert|schedule|inactive|days|remove (product )?access|deactivate|suspend|notify|e-?mail|export|csv|history|log/gi)||[]).map(x=>x.toLowerCase()); index.push({ screen: name, chars: t.length, keywords: [...new Set(kw)].slice(0,14) }); console.log(`  ${name}: ${t.length} chars`); };
const clickIn = async (text) => { for (const f of p.frames()) { const l = f.getByText(text, { exact:true }).first(); if (await l.count()) { try { await l.click({ timeout:4000 }); await hold(4000); return true; } catch {} } } return false; };
await p.goto(url, { waitUntil:'domcontentloaded', timeout:60000 }); await hold(12000);
if (VIDEO) { await caption(`Kantega on the ${LABEL}`, 'Every screen, read only. Nothing is changed.'); await hold(5000); }
await snap('landing', `Kantega, ${LABEL}. Landing.`, 'What the administrator sees now that the key is in.');
for (const n of NAV) {
  const ok = await clickIn(n); if (!ok) { console.log(`  ${n}: not found`); index.push({ screen:n, missing:true }); continue; }
  await snap(n, `${n}.`, '');
  // tabs within this screen
  const seen = new Set();
  for (const f of p.frames()) { if (f===p.mainFrame()) continue; let tabs=[]; try { tabs = await f.getByRole('tab').allInnerTexts(); } catch {} for (const t of tabs.map(x=>x.trim()).filter(Boolean)) { if (seen.has(t) || t===n) continue; seen.add(t); try { await f.getByRole('tab', { name: t, exact:true }).first().click({ timeout:3000 }); await hold(3500); await snap(`${n} - ${t}`, `${n}, tab ${t}.`, ''); } catch {} } }
}
if (VIDEO) { await caption('End of the walk.', 'Full text of every screen and a screenshot each are in the evidence folder.'); await hold(4000); }
fs.writeFileSync(`${OUT}/index.json`, JSON.stringify(index, null, 1));
const v = VIDEO ? p.video() : null; await ctx.close(); if (v) console.log('VIDEO', await v.path());
console.log(JSON.stringify(index));
