// Records a captioned walkthrough of the three candidate apps. Read-only: navigation and clicks on nav items only.
import { chromium } from 'playwright';
import fs from 'fs'; import path from 'path';
const base = process.env.BASE ?? 'https://wolfaenpak.atlassian.net';
const profile = process.env.HARNESS_PROFILE ?? path.resolve('.auth/profile');
const label = process.env.SITE_LABEL ?? 'LeanZero test site (wolfaenpak)';
const out = process.env.OUT ?? 'scratch/video/wolfaenpak';
const env = Object.fromEntries(fs.readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>[l.split('=')[0], l.slice(l.indexOf('=')+1)]));
const uuid = s => s.replace('ari:cloud:ecosystem::app/','');
const K = `${base}/wiki/apps/${uuid(env.KANTEGA_APP_ID)}/${env.KANTEGA_ENV_ID}/${env.KANTEGA_ROUTE}`;
const T = `${base}/wiki/apps/${uuid(env.TECHTIME_APP_ID)}/${env.TECHTIME_ENV_ID}/${env.TECHTIME_ROUTE}`;
const R = `${base}/jira/apps/${uuid(env.RESOLUTION_APP_ID)}/${env.RESOLUTION_ENV_ID}`;
const only = (process.env.ONLY ?? 'kantega,techtime,resolution').split(',');

const ctx = await chromium.launchPersistentContext(profile, { headless: true, viewport:{width:1440,height:900}, recordVideo:{ dir: out, size:{width:1440,height:900} } });
const p = await ctx.newPage();
const caption = async (title, sub='') => { await p.evaluate(([t,s]) => {
  let c = document.getElementById('lz-cap'); if (!c) { c = document.createElement('div'); c.id='lz-cap'; document.body.appendChild(c); }
  c.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#0052CC;color:#fff;font:600 22px/1.3 -apple-system,Helvetica,Arial;padding:16px 28px;box-shadow:0 -2px 12px rgba(0,0,0,.3)';
  c.innerHTML = `<div>${t}</div><div style="font-weight:400;font-size:16px;opacity:.95;margin-top:4px">${s}</div>`;
}, [title, sub]); };
const hold = ms => p.waitForTimeout(ms);
const frames = async (fr) => { for (const f of p.frames()) { if (f !== p.mainFrame()) { try { await f.evaluate(()=>0); } catch {} } } };
const ready = async (text, ms=45000) => { const t0=Date.now(); while (Date.now()-t0<ms) { for (const f of p.frames()) { try { if (await f.getByText(text).first().count()) return true; } catch {} } await hold(1000); } return false; };
const go = async (u, t, s, wait=12000, needle='') => { await p.goto(u, { waitUntil:'domcontentloaded', timeout:60000 }); if (needle) console.log('ready', needle, await ready(needle)); await hold(2500); await caption(t, s); await hold(wait); };
const clickIn = async (text, t, s, wait=7000) => {
  for (const f of p.frames()) { const l = f.getByText(text, { exact:true }).first(); if (await l.count()) { try { await l.click({ timeout:4000 }); } catch {} break; } }
  await hold(1500); await caption(t, s); await hold(wait);
};
// title card
await p.goto('about:blank'); await p.setContent(`<body style="margin:0;background:#172B4D;color:#fff;font-family:-apple-system,Helvetica,Arial;display:flex;align-items:center;justify-content:center;height:100vh"><div style="max-width:1000px"><div style="font-size:44px;font-weight:700">Rolling licence management, the three candidate apps</div><div style="font-size:26px;margin-top:18px;opacity:.9">Recorded ${new Date().toISOString().slice(0,10)} on the ${label}. Read-only walk. No account is changed.</div><div style="font-size:22px;margin-top:28px;opacity:.8">1. Kantega User Management &amp; License Optimizer (Confluence)<br>2. TechTime User Management for Confluence<br>3. resolution User Management and License Optimizer (Jira)</div></div></body>`); await hold(7000);

if (only.includes('kantega')) {
  await go(K, '1 of 3. Kantega, Confluence. The screen an administrator sees right after install.', 'Two step setup: generate an organisation API key at admin.atlassian.com, paste it here. Scheduling and Cleanup, Users and History stay dimmed until then.', 12000, 'Welcome to Kantega');
  await clickIn('Settings', 'Kantega. Settings.', 'This is where the key and the organisation ID go. The app asks for an API key without scopes, one year expiry at most.', 9000);
  await clickIn('Scheduling and Cleanup', 'Kantega. Scheduling and Cleanup, before a key.', 'Locked. Once unlocked, a schedule can be set to Add to list for review instead of Remove access, which is its dry run.', 6000);
  await clickIn('Dashboard', 'Kantega. Dashboard.', 'Once configured this shows protected, active, low usage and inactive users per product, and a licence count history.', 5000);
}
if (only.includes('techtime')) {
  await go(T, '2 of 3. TechTime, Confluence. Right after install.', 'It lives under Confluence administration and says Source required. A Source is an organisation API key.', 12000, 'Source required');
  await clickIn('Sources', 'TechTime. Sources.', 'The key goes here. Reports, User Search and Bulk Actions, Scheduled Actions and Run Logs open only after that.', 9000);
  await clickIn('Troubleshooting', 'TechTime. Troubleshooting.', 'One of two screens that open without a key. Scheduled actions carry a Test Mode flag, which is its dry run.', 6000);
}
if (only.includes('resolution')) {
  await go(R, '3 of 3. resolution, Jira. Right after install.', 'Nothing renders until the signed in administrator grants the app access on their behalf. Its documentation also asks for an organisation API key in Settings. It has no dry run mode.', 12000, 'Allow access');
}
await p.goto('about:blank'); await p.setContent(`<body style="margin:0;background:#172B4D;color:#fff;font-family:-apple-system,Helvetica,Arial;display:flex;align-items:center;justify-content:center;height:100vh"><div style="max-width:1000px;font-size:28px;line-height:1.5">All three run on Forge, inside Atlassian's infrastructure.<br>Both Confluence apps need an organisation API key before anything works.<br>Kantega and TechTime have a dry run. resolution does not.<br><br><span style="opacity:.8;font-size:22px">Next: the same walk with a key entered, on the E.ON sandbox, once the key is approved.</span></div></body>`); await hold(8000);
const v = p.video(); await ctx.close(); const vp = await v.path(); console.log('VIDEO', vp, fs.statSync(vp).size);
