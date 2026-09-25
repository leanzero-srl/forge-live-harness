import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ storageState: '/Users/workhorse/Projects/forge-live-harness/.auth/storage-state.json' });
const page = await ctx.newPage();
for (const u of [
  'https://wolfaenpak.atlassian.net/rest/api/3/myself',
  'https://wolfaenpak.atlassian.net/rest/api/3/search?jql=order%20by%20created&maxResults=2',
]) {
  const r = await page.goto(u, { waitUntil:'domcontentloaded', timeout:60000 });
  const txt = await page.evaluate(() => document.body ? document.body.innerText : '');
  process.stdout.write(`\n== ${u}\nSTATUS ${r.status()}\n${txt.slice(0,400)}\n`);
}
await browser.close();
