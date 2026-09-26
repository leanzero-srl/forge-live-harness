// WF-4 (UX critique 2026-09-19): after Approve or Deny the ribbon's left half kept reading
// "1 Waiting for you · 1 approval waiting for your decision" while the chip said the page had moved —
// onTransitioned only reloaded the workflow + approvals, never `ribbon-summary`, whose waitingOnMe.approvals
// drives the pill. After the fix a decision re-runs the whole evaluation: the pill is gone and a one-line
// confirmation sits next to the chip. Browser only; two beds (approve, deny). FAILS before, PASSES after.
import { test, expect } from "../../fixtures/forge";
import { mkdirSync } from "node:fs";
import { setupWorkflowPage, loadPage, shotRibbon, inv, getKvs, norm, SPACE, GABI } from "./_wf";

const OUT = process.env.OUT_DIR || "evidence/wf4-ribbon-after-decision";
test.describe.configure({ timeout: 600_000 });

async function openRequest(P: string) {
  const t1 = await inv("transitionWorkflow", { pageId: P, spaceKey: SPACE, to: "in_review", actor: GABI, actorName: "Gabriela Perdum" });
  expect(t1.result?.success, `to in_review (${JSON.stringify(t1.result).slice(0, 120)})`).toBe(true);
  const rq = await inv("reqTransition", { pageId: P, spaceKey: SPACE, to: "approved", actor: GABI });
  expect(rq.result?.pending, `Gabriela's request opens (${JSON.stringify(rq.result).slice(0, 160)})`).toBe(true);
}

for (const decision of ["approved", "denied"] as const) {
  test(`WF-4: after ${decision === "approved" ? "Approve" : "Deny"} the 'Waiting for you' pill is gone and the outcome is said`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const bed = await setupWorkflowPage(`wf4-${decision}`);
    const P = bed.pageId;
    try {
      await openRequest(P);
      const r = await loadPage(page, P);
      expect(r, "ribbon renders").toBeTruthy();
      const pill = r!.frame.locator('[data-testid="ribbon-pill"]');
      await expect(pill, "control: the pill says Waiting for you before the decision").toContainText("Waiting for you", { timeout: 20_000 });
      await r!.frame.locator("button.wf-chip-awaiting").click();
      await r!.frame.locator(".wf-appr-reason-input").fill(decision === "approved" ? "Looks good to me" : "Needs a summary section at the top");
      const btn = r!.frame.locator(decision === "approved" ? ".wf-appr-approve" : ".wf-appr-deny");
      await expect(btn, "the decision button is live").toBeEnabled({ timeout: 10_000 });
      await btn.click();
      await expect.poll(async () => decision === "approved" ? (await getKvs(`workflow-state-${P}`))?.stateId : !(await getKvs(`workflow-pending-${P}`)), { timeout: 30_000 }).toBe(decision === "approved" ? "approved" : true);
      // The pill must follow the decision without a reload.
      await expect(pill, "the Waiting-for-you pill is gone after the decision").toHaveCount(0, { timeout: 20_000 });
      const notice = r!.frame.locator('[data-testid="wf-notice"]');
      await expect(notice, "a one-line outcome sits next to the chip").toBeVisible({ timeout: 10_000 });
      const text = norm(await notice.innerText());
      console.log(`### notice (${decision}):`, text, "| ribbon:", norm(await r!.frame.locator('[data-testid="ribbon-bar"]').innerText()));
      expect(text).toMatch(decision === "approved" ? /^Approved — the page is now Approved/ : /^Denied — Gabriela Perdum has been told/);
      await expect(r!.frame.locator(".wf-chip-label").first(), "the state chip agrees").toHaveText(decision === "approved" ? /^Approved( v\d+)?$/ : "In Review"); // WF-6: "Approved vN"
      await shotRibbon(page, r!.el, `${OUT}/01-after-${decision}.png`, 20);
      expect(norm(await r!.frame.locator('[data-testid="ribbon-bar"]').innerText())).not.toMatch(/waiting for your decision/i);
    } finally {
      await bed.restore();
    }
  });
}
