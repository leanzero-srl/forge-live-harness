import { chromium } from 'playwright';
try {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: '/Users/workhorse/Projects/forge-live-harness/.auth/storage-state.json' });
  const page = await ctx.newPage();
  const r = await page.goto('https://wolfaenpak.atlassian.net/rest/api/3/project/search?maxResults=20', { waitUntil:'domcontentloaded', timeout:60000 });
  process.stdout.write('STATUS ' + r.status() + '\n');
  const txt = await page.evaluate(() => document.body ? document.body.innerText : 'NOBODY');
  process.stdout.write('LEN ' + txt.length + '\n');
  process.stdout.write(txt.slice(0, 1500) + '\n');
  await browser.close();
} catch (e) {
  process.stdout.write('ERR ' + e.message + '\n');
}
