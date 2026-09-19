// SCRATCH 6.69.0 — item 1's glance half: LZPT-215 (positive room, no CRITICAL PATH
// chip) and LZPT-209 (NO ROOM + CRITICAL PATH). Read-only.
import { test, expect } from "../../fixtures/forge";
import { assertLoggedIn } from "../../forge/browser";
const BASE_URL = process.env.JIRA_BASE_URL || "https://wolfaenpak.atlassian.net";
const SHOT = "/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6690";
test.describe.configure({ retries: 1, timeout: 420_000 });

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

test("6690 glance: LZPT-215 has room, LZPT-209 has none", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  for (const key of ["LZPT-215", "LZPT-209"]) {
    await page.goto(`${BASE_URL}/browse/${key}`, { waitUntil: "domcontentloaded" });
    let f = await glanceFrame(page, 25_000);
    if (!f) {
      await page.getByRole("button", { name: /View app actions/i }).first().click({ timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(2000);
      await page.getByRole("menuitem", { name: /LeanZero Management Position/i }).first().click({ timeout: 20_000 })
        .catch(async () => { await page.getByText(/^LeanZero Management Position$/).first().click({ timeout: 20_000 }).catch(() => {}); });
      await page.waitForTimeout(4000);
      f = await glanceFrame(page, 90_000);
    }
    if (!f) { console.log(`${key}: GLANCE NEVER MOUNTED`); continue; }
    await page.waitForTimeout(3000);
    const g = await f.evaluate(() => {
      const root = document.querySelector('[data-testid="issue-glance"]') as HTMLElement | null;
      if (!root) return null;
      return {
        state: root.getAttribute("data-state"), mode: root.getAttribute("data-mode"),
        headerChips: [...root.querySelectorAll(".lz-card .lz-badge")].map((b) => (b.textContent || "").trim()),
        items: [...root.querySelectorAll("[data-item]")].map((li) => ({
          id: li.getAttribute("data-item"),
          chip: (li.querySelector(".lz-badge") as HTMLElement | null)?.textContent?.trim() || null,
          text: (li as HTMLElement).innerText.replace(/\n/g, " ").trim().slice(0, 220),
        })),
        full: root.innerText,
      };
    });
    console.log(`=== ${key} ===`);
    console.log("HEADER_CHIPS:", JSON.stringify(g?.headerChips));
    console.log("ITEMS:", JSON.stringify(g?.items, null, 1));
    console.log("HAS_CRITICAL_PATH_CHIP:", /CRITICAL PATH/.test(g?.full || ""));
    console.log("FULL:\n" + (g?.full || "(none)"));
    await page.screenshot({ path: `${SHOT}/i1-glance-${key}.png` });
  }
  expect(true).toBeTruthy();
});
