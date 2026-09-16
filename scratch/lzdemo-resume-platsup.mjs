import { chromium } from "@playwright/test";
const PROFILE_PATH = "/private/tmp/claude-501/-Users-mihaiperdum-Projects/6b4b411b-0067-4b38-ac58-09cbf7ac76ef/scratchpad/ld-auth/profile-lz-ppm";
const APP_URL = "https://leanzero-demo.atlassian.net/jira/apps/087a8e18-d45a-4cb7-9d87-3e84101ac4f3/5c1c7532-62a8-4970-bd2c-11f909c06092";
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/demo";
import { mkdirSync } from "node:fs"; mkdirSync(OUT, { recursive: true });
const PLAN = "PLATSUP Customer Support Plan";
const bodyText = async f => (await f.locator("body").innerText().catch(() => "")) || "";
let n = 0; const shot = async (page, name) => { n++; const p = `${OUT}/${String(n).padStart(2, "0")}-${name}.png`; await page.screenshot({ path: p }); console.log("SHOT", p); };
const context = await chromium.launchPersistentContext(PROFILE_PATH, { headless: true, viewport: { width: 1600, height: 1000 } });
try {
  const page = context.pages()[0] || await context.newPage();
  await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  const sel = 'iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]';
  await page.locator(sel).first().waitFor({ state: "attached", timeout: 40000 });
  const frame = page.locator(sel).first().contentFrame();
  await page.waitForTimeout(3000);
  await frame.getByText(PLAN, { exact: false }).first().click();
  await page.waitForTimeout(3000);
  if (!/Gantt|Table|Dashboard/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  let t = await bodyText(frame);
  const staged = (t.match(/Apply (\d+) change/i) || [])[1];
  console.log("STAGED changes badge:", staged);
  await shot(page, "plan-open");
  if (!staged) throw new Error("no staged changes on PLATSUP — nothing to apply");
  await frame.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click();
  await frame.locator('[data-testid="apply-review-modal"]').first().waitFor({ state: "visible", timeout: 20000 });
  const rows = frame.locator('[data-testid="apply-change-row"]');
  const rowCount = await rows.count();
  const sample = []; for (let i = 0; i < Math.min(8, rowCount); i++) sample.push((await rows.nth(i).innerText()).replace(/\s+/g, " "));
  console.log("REVIEW rows:", rowCount); for (const s of sample) console.log("  ROW", s);
  await shot(page, "review-modal");
  await frame.locator('[data-testid="apply-review-modal"]').getByRole("button", { name: /Apply \d+ Change/i }).first().click();
  // Expect the graceful earlier-Apply dialog
  await frame.getByText("Earlier Apply found").waitFor({ state: "visible", timeout: 40000 });
  await page.waitForTimeout(800);
  t = await bodyText(frame);
  const dlg = t.slice(t.indexOf("Earlier Apply found"), t.indexOf("Earlier Apply found") + 900);
  console.log("DIALOG:\n" + dlg);
  await shot(page, "earlier-apply-found");
  const discard = frame.getByRole("button", { name: "Resume saved Apply" }); console.log("discard offered:", await frame.getByRole("button", { name: "Discard and apply current edits" }).isVisible().catch(() => false));
  console.log("resume button visible:", await discard.isVisible());
  await discard.click();
  const started = Date.now(); let last = "";
  for (;;) {
    await page.waitForTimeout(3000);
    t = await bodyText(frame);
    const title = (t.match(/(Preparing…|Writing to Jira|Verifying|Applied|Apply stopped|Earlier Apply found)/) || [])[0] || null;
    const prog = (t.match(/(\d+) of (\d+) issues?/) || [])[0] || (t.match(/(Verified|Refreshed) \d+ of \d+/) || [])[0] || "";
    const line = `${title} | ${prog}`;
    if (line !== last) { console.log(`[${Math.round((Date.now() - started) / 1000)}s]`, line); last = line; }
    if (title === "Apply stopped" || title === "Earlier Apply found") { console.log("STOPPED:\n" + t.slice(t.indexOf(title), t.indexOf(title) + 900)); await shot(page, "stopped"); break; }
    if (title === "Applied") { await shot(page, "applied"); console.log("APPLIED:\n" + t.slice(t.indexOf("Applied"), t.indexOf("Applied") + 400)); break; }
    if (Date.now() - started > 20 * 60 * 1000) { console.log("TIMEOUT"); await shot(page, "timeout"); break; }
  }
  await frame.getByRole("button", { name: "Done" }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  console.log("post-apply staged badge:", (await bodyText(frame)).match(/Apply \d+ change/i)?.[0] || "none");
  await shot(page, "after-done");
  // Jira readback for the sampled rows
  const keys = sample.map(s => (s.match(/PLATSUP-\d+/) || [])[0]).filter(Boolean);
  const jira = await page.evaluate(async keys => { const out = {}; for (const k of keys) { const r = await fetch(`/rest/api/3/issue/${k}?fields=duedate,customfield_10015,summary`, { credentials: "include", headers: { Accept: "application/json" } }); const d = await r.json(); out[k] = { start: d.fields?.customfield_10015, due: d.fields?.duedate }; } return out; }, keys);
  console.log("JIRA readback:", JSON.stringify(jira));
} finally { await context.close(); }
