import { chromium } from 'playwright';

const PROFILE = '/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-lz-ppm';
const URL = 'https://leanzero-demo.atlassian.net/jira/settings/apps/087a8e18-d45a-4cb7-9d87-3e84101ac4f3/5c1c7532-62a8-4970-bd2c-11f909c06092/ppm-admin-settings';
const SS = '/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad';

const ctx = await chromium.launchPersistentContext(PROFILE, { headless: true, viewport: { width: 1600, height: 1200 } });
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4000);

const frame = page.frameLocator('iframe[data-testid="hosted-resources-iframe"]');
await frame.getByText('API Access', { exact: true }).first().click();
await page.waitForTimeout(2000);

await frame.getByPlaceholder('Name (e.g. CI reporter)').fill('demo-build-admin');

const roleSelect = frame.locator('button').filter({ hasText: 'Viewer' }).first();
await roleSelect.click();
await page.waitForTimeout(500);
await frame.getByText('Admin — also delete plans, snapshots and reports', { exact: true }).click();
await page.waitForTimeout(500);

await frame.getByRole('button', { name: 'Create token' }).click();
await page.waitForTimeout(2000);
await page.screenshot({ path: `${SS}/mint-08-created.png`, fullPage: true });

const text = await frame.locator('body').innerText();
console.log(text);

await ctx.close();
