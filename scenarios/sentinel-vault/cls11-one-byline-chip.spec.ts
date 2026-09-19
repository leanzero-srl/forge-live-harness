// CLS-11 (UX critique 2026-09-19). Before the fix the byline row on the test site showed THREE
// "Sentinel Vault" chips — the staging install's ("Unclassified (Staging)", and on a fresh page
// "Sentinel Vault (Staging) (Staging)") beside the development one — which misdirected the critique
// itself (a spec clicked the wrong app's chip). The manifest's byline title already carries no
// environment word (the host adds one); the fix is test-site hygiene: the staging install was
// removed from wolfaenpak (2026-09-20). This spec pins it: exactly ONE Sentinel Vault byline chip,
// and it is the development one. FAILS while a second install sits on the site, PASSES after.
import { test, expect } from "../../fixtures/forge";
import { mkdirSync } from "node:fs";
import { setupWorkflowPage, loadPage, inv, norm } from "./_wf";

const OUT = process.env.OUT_DIR || "evidence/cls11-one-byline-chip";
test.describe.configure({ timeout: 600_000 });

test("CLS-11 browser: one Sentinel Vault chip on the byline row, and it is the development install's", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const bed = await setupWorkflowPage("cls11-byline");
  const P = bed.pageId;
  try {
    await inv("refreshByline", { pageId: P, force: "1" });
    await loadPage(page, P);
    const chips = page.locator('button[data-testid="byline-forge-app-button"]');
    await expect(chips.first()).toBeVisible({ timeout: 60_000 });
    // Confluence's own "Show more" folds the byline — open it so every chip is counted
    const more = page.locator("button", { hasText: /^Show more$/ });
    if (await more.count()) await more.first().click().catch(() => {});
    const texts: string[] = [];
    const n = await chips.count();
    for (let i = 0; i < n; i++) texts.push(norm(await chips.nth(i).innerText()));
    console.log("### byline chips:", JSON.stringify(texts));
    const ours = texts.filter((t) => /Sentinel Vault|Draft|Unclassified|Sealed \(/.test(t) && !/RESTRICTED/.test(t));
    expect(ours.length, "exactly one Sentinel Vault chip").toBe(1);
    expect(ours[0]).toMatch(/\(Development\)$/);
    expect(ours[0], "the environment word appears once").not.toMatch(/\(Development\).*\(Development\)|\(Staging\)/);
    const box = await chips.first().boundingBox();
    await page.screenshot({ path: `${OUT}/01-byline-one-chip.png`, clip: box ? { x: Math.max(0, box.x - 300), y: Math.max(0, box.y - 40), width: 800, height: 110 } : undefined });
  } finally {
    await bed.restore();
  }
});
