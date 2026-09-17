// TESTER scratch: read the LIVE glance text on LZPT-194 / 205 / 203.
import { test } from "@playwright/test";
import { assertLoggedIn, launchHarnessContext } from "../../forge/browser";
const BASE_URL = process.env.JIRA_BASE_URL!;
const OUT = process.env.SHOT_DIR || "/tmp";
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
test("glance text", async () => {
  const ctx = await launchHarnessContext();
  const page = await ctx.newPage();
  try {
    await page.setViewportSize({ width: 1600, height: 1100 });
    await assertLoggedIn(page);
    for (const key of ["LZPT-194", "LZPT-205", "LZPT-203"]) {
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
      await page.waitForTimeout(3000);
      const g: any = await f.evaluate(() => {
        const root = document.querySelector('[data-testid="issue-glance"]') as HTMLElement | null;
        if (!root) return null;
        const items = Array.from(root.querySelectorAll('[data-item]')).map((li: any) => ({ id: li.getAttribute('data-item'), text: li.innerText.trim().replace(/\s+/g, ' ') }));
        return { state: root.getAttribute('data-state'), mode: root.getAttribute('data-mode'), plan: (root.querySelector('.lz-card span') as any)?.textContent?.trim() || null,
          tabs: Array.from(root.querySelectorAll('[role="tab"]')).map((t: any) => t.getAttribute('data-mode')),
          items, text: root.innerText.trim() };
      });
      console.log(`\n===== ${key} state=${g?.state} mode=${g?.mode} plan=${g?.plan} tabs=${JSON.stringify(g?.tabs)}`);
      console.log(g?.text);
      console.log("ITEMS =", JSON.stringify(g?.items, null, 1));
      await page.screenshot({ path: `${OUT}/40-glance-${key}.png` });
    }
  } finally { await ctx.close().catch(() => {}); }
});
