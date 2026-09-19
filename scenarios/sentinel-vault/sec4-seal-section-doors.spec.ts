// SEC-4 (UX critique 2026-09-19). Before the fix `list-page-headings` / `seal-section` were called
// from exactly one place — the inline panel macro — so sealing a section took six steps, two of
// them page edits (insert the panel, publish), and the byline's details modal said only "Nothing on
// this page is sealed" with no control; the section macro's own dialog sent the user "to the panel".
// After the fix the details modal (the byline's door, on every page, no macro needed) has "Seal a
// section…": the same heading picker with the range preview, the same "Holds for" step and note,
// the same resolver — and the macro copy names both doors. FAILS before, PASSES after.
import { test, expect } from "../../fixtures/forge";
import { mkdirSync } from "node:fs";
import { setupWorkflowPage, loadPage, inv, getKvs, norm, MIHAI } from "./_wf";
import { openDetailsModal } from "./_door";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";

const OUT = process.env.OUT_DIR || "evidence/sec4-seal-section-doors";
test.describe.configure({ timeout: 900_000 });
const call = async (key: string, payload: any, actor = MIHAI) => (await inv("invoke", { key, payload: JSON.stringify(payload), actor })).result;
const BODY = [heading("Scope", 2), paragraph("What is in and out."), heading("Risks", 2), paragraph("The risks we accept."), heading("Decisions", 2), paragraph("What we decided.")];

test("SEC-4 browser: a page with NO panel macro — the byline's modal seals a section (picker → Holds for → Seal), the row appears, the macro badge follows", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const bed = await setupWorkflowPage("sec4-modal-door", { body: BODY });
  const P = bed.pageId;
  let sectionId: string | null = null;
  const shot = async (name: string) => page.screenshot({ path: `${OUT}/${name}.png` });
  try {
    // the page carries no Sentinel Vault macro at all
    await inv("refreshByline", { pageId: P, force: "1" });
    await loadPage(page, P);
    const app = await openDetailsModal(page);
    await expect(app.locator('[data-testid="pd-seals-empty"]')).toContainText("Nothing on this page is sealed", { timeout: 20_000 });
    const door = app.locator('[data-testid="pd-seal-section"]');
    await expect(door, "the modal offers Seal a section…").toBeVisible();
    await shot("01-modal-empty-with-door");
    await door.click();
    const picker = app.locator('[data-testid="pd-section-picker"]');
    await expect(picker).toBeVisible();
    const risks = picker.locator('[data-testid="pd-section-pick"]', { has: app.locator(".pd-pick-text", { hasText: /^Risks$/ }) });
    await expect(risks, "the picker lists the page's headings").toBeVisible({ timeout: 20_000 });
    expect(norm(await risks.innerText()), "…with the range preview (SEC-1)").toMatch(/ends before/);
    await expect(app.locator('[data-testid="pd-section-hold"]'), "nothing is sealed on a click").toHaveCount(0);
    await risks.click();
    const hold = app.locator('[data-testid="pd-section-hold"]');
    await expect(hold, "picking opens the Holds-for step").toBeVisible();
    await expect(hold.locator('[data-testid="pd-hold-default"]')).toHaveAttribute("aria-checked", "true");
    await hold.locator('[data-testid="pd-hold-86400"]').click();
    await hold.locator('[data-testid="pd-section-note"]').fill("frozen from the modal");
    await shot("02-modal-picker-hold-step");
    await app.locator("html").evaluate((h: any) => h.setAttribute("data-color-mode", "dark"));
    await page.waitForTimeout(300);
    await shot("02b-modal-picker-hold-step-dark");
    await app.locator("html").evaluate((h: any) => h.setAttribute("data-color-mode", "light"));
    await hold.locator('[data-testid="pd-section-seal-confirm"]').click();
    const row = app.locator('[data-testid="pd-seal-row"][data-kind="section"]', { hasText: "Risks" });
    await expect(row, "the sealed row appears in the modal").toBeVisible({ timeout: 30_000 });
    expect(norm(await row.innerText())).toMatch(/Sealed by you · until/);
    expect(norm(await row.innerText())).toContain("frozen from the modal");
    await expect(app.locator('[data-testid="pd-section-picker"]'), "the picker closes after the seal").toHaveCount(0);
    await shot("03-modal-sealed-row");
    const en = await call("enumerate-section-seals", { pageId: P });
    const rec = (en?.sections || []).find((x: any) => x.sectionTitle === "Risks");
    expect(rec, "the seal exists on the server").toBeTruthy();
    sectionId = rec.sectionId;
    expect(rec.note).toBe("frozen from the modal");
    expect(Math.abs(new Date(rec.expiresAt).getTime() - (Date.now() + 86400_000)), "sealed for the chosen day").toBeLessThan(120_000);
    await app.locator('[data-testid="pd-close"]').click();
    // the page now carries the sealed-section wrapper; its badge says so (no panel was ever inserted)
    await loadPage(page, P);
    let badge = "";
    await expect.poll(async () => {
      for (const fr of page.frames()) {
        if (!fr.url().includes("17516615")) continue;
        const b = fr.locator('[data-testid="sec-view-badge"]');
        if ((await b.count().catch(() => 0)) > 0) { badge = norm(await b.first().innerText().catch(() => "")); if (/until/.test(badge)) return true; }
      }
      return false;
    }, { timeout: 60_000, message: "the macro badge shows the seal" }).toBe(true);
    console.log("### badge:", badge);
    expect(badge).toMatch(/^Sealed by you · until/);
    const kvs = await getKvs(`section-protection-${sectionId}`);
    expect(kvs?.lockedBy).toBe(MIHAI);
  } finally {
    if (sectionId) await call("unseal-section", { sectionId }, MIHAI).catch(() => {});
    await bed.restore();
  }
});
