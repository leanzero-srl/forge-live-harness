import { chromium } from 'playwright';
import fs from 'fs';

const STATE = '/Users/workhorse/Projects/forge-live-harness/.auth/storage-state.json';
const SITE  = 'https://wolfaenpak.atlassian.net';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ storageState: STATE });
const page = await ctx.newPage();

const cspHits = [];
page.on('response', async (res) => {
  const h = res.headers();
  const csp = h['content-security-policy'] || h['content-security-policy-report-only'];
  if (csp && /atlassian-dev\.net|connect-src/.test(csp)) {
    cspHits.push({ url: res.url().slice(0, 120), csp });
  }
});

// find a project key first
await page.goto(`${SITE}/jira/projects`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
const loggedIn = !/id\.atlassian\.com|\/login/.test(page.url());
console.log('URL after nav:', page.url());
console.log('LOGGED IN:', loggedIn);
if (!loggedIn) { await browser.close(); process.exit(2); }

const links = await page.$$eval('a[href*="/jira/software/projects/"], a[href*="/browse/"]', as =>
  as.map(a => a.getAttribute('href')).filter(Boolean).slice(0, 10));
console.log('project links:', links.slice(0,5));
fs.writeFileSync('/tmp/lz-egress-probe/csp-nav.json', JSON.stringify({ url: page.url(), links, cspHits }, null, 2));
await browser.close();
