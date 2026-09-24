import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ storageState: '/Users/workhorse/Projects/forge-live-harness/.auth/storage-state.json' });
const page = await ctx.newPage();
const r = await page.goto('https://wolfaenpak.atlassian.net/rest/api/3/project/search?maxResults=20', { waitUntil:'domcontentloaded', timeout:60000 });
const txt = await page.evaluate(() => document.body.innerText);
try {
  const j = JSON.parse(txt);
  console.log(j.values.map(p => `${p.key} (${p.name})`).join('\n'));
} catch { console.log('RAW:', txt.slice(0,500)); }
await browser.close();
