// TESTER (6.62.0, items 3+4): the LIVE glance on LZPT-194 / 205 / 203 and on a
// member of the seeded INHERITED-EDGE loop (shape A). Read-only.
import { test } from "@playwright/test";
import { assertLoggedIn, launchHarnessContext } from "../../forge/browser";
import * as fs from "fs";
const BASE_URL = process.env.JIRA_BASE_URL!;
const OUT = process.env.SHOT_DIR || "/tmp";
const STATE = process.env.STATE_FILE || "/tmp/lz-6620-seed.json";
test.describe.configure({ retries: 0, timeout: 900_000 });

async function glanceFrame(page: any, timeoutMs = 90_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    for (const f of page.frames()) {
      const hit = await f.evaluate(() => !!document.querySelector('[data-testid="issue-glance"]')).catch(() => false);
      if (hit) return f;
    }
    await page.waitForTimeout(1500);
  }
  return null;
}
const read = (f: any) => f.evaluate(() => {
  const root = document.querySelector('[data-testid="issue-glance"]') as HTMLElement | null;
  if (!root) return null;
  return {
    state: root.getAttribute('data-state'), mode: root.getAttribute('data-mode'),
    plan: (root.querySelector('.lz-card span') as any)?.textContent?.trim() || null,
    tabs: Array.from(root.querySelectorAll('[role="tab"]')).map((t: any) => t.getAttribute('data-mode')),
    planBtns: Array.from(root.querySelectorAll('[role="group"] button')).map((b: any) => (b.textContent || '').trim()),
    items: Array.from(root.querySelectorAll('[data-item]')).map((li: any) => ({ id: li.getAttribute('data-item'), text: (li.innerText || '').trim().replace(/\s+/g, ' ') })),
    text: root.innerText.trim(),
  };
});

test("glance text on LZPT and on the seeded loop", async () => {
  const st = JSON.parse(fs.readFileSync(STATE, "utf8"));
  const keys = ["LZPT-194", "LZPT-205", "LZPT-203", st.A.map.Y, st.A.map.C1];
  const ctx = await launchHarnessContext();
  const page = await ctx.newPage();
  try {
    await page.setViewportSize({ width: 1600, height: 1100 });
    await assertLoggedIn(page);
    for (const key of keys) {
      await page.goto(`${BASE_URL}/browse/${key}`, { waitUntil: "domcontentloaded" });
      let f = await glanceFrame(page, 25_000);
      if (!f) {
        await page.getByRole("button", { name: /View app actions/i }).first().click({ timeout: 30_000 }).catch(() => {});
        await page.waitForTimeout(2000);
        await page.getByRole("menuitem", { name: /LeanZero Management Position/i }).first().click({ timeout: 20_000 }).catch(() => {});
        await page.waitForTimeout(4000);
        f = await glanceFrame(page, 90_000);
      }
      if (!f) { console.log(`===== ${key}: GLANCE NEVER MOUNTED`); continue; }
      await page.waitForTimeout(3500);
      const g: any = await read(f);
      console.log(`\n===== ${key} state=${g?.state} mode=${g?.mode} plan=${JSON.stringify(g?.plan)} tabs=${JSON.stringify(g?.tabs)} planChips=${JSON.stringify(g?.planBtns)}`);
      console.log(`----- TEXT:\n${g?.text}`);
      console.log("ITEMS =", JSON.stringify(g?.items, null, 1));
      await page.screenshot({ path: `${OUT}/glance-${key}.png` });
      // if the seeded plan is not the selected one, switch to it
      if (key.startsWith("WFH-") && g?.plan && !/INH-/.test(g.plan)) {
        const want = (g.planBtns || []).find((n: string) => /INH-/.test(n));
        if (want) {
          await f.evaluate((n: string) => { (Array.from(document.querySelectorAll('[role="group"] button')).find((x: any) => (x.textContent || '').trim() === n) as HTMLButtonElement)?.click(); }, want);
          await page.waitForTimeout(7000);
          const g2: any = await read(f);
          console.log(`===== ${key} AFTER SWITCH to "${want}" state=${g2?.state} plan=${JSON.stringify(g2?.plan)}`);
          console.log(`----- TEXT:\n${g2?.text}`);
          await page.screenshot({ path: `${OUT}/glance-${key}-switched.png` });
        } else console.log(`===== ${key}: no INH- plan chip offered; chips=${JSON.stringify(g?.planBtns)}`);
      }
    }
  } finally { await ctx.close().catch(() => {}); }
});
