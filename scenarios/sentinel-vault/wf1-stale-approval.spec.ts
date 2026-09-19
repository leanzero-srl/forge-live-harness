// WF-1 (UX critique 2026-09-19): the page changed after Gabriela asked for approval (v1 → v2). Mihai
// clicked Approve. Before the fix the server recorded his vote, threw the request away, answered
// `{ success:true, outcome:"stale" }` (which the popover treated as "done" and closed silently) and posted
// "Approval DECLINED … by Mihai Perdum" to Gabriela — he had approved. After the fix: a stale approve is
// REFUSED (nothing recorded, the request stays); the popover shows the stale block and disables Approve;
// the approver can re-request for the live version from the popover; no "declined" comment exists.
// Two tests: SERVER (hook only, no browser profile) and BROWSER. FAIL before the fix, PASS after.
import { test, expect } from "../../fixtures/forge";
import { mkdirSync } from "node:fs";
import { setupWorkflowPage, loadPage, shotRibbon, inv, getKvs, doc, strip, norm, SPACE, MIHAI, GABI } from "./_wf";
// @ts-ignore
import { writeAdf, getComments } from "../../data/confluence.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";

const OUT = process.env.OUT_DIR || "evidence/wf1-stale-approval";
test.describe.configure({ timeout: 600_000 });

/** Draft → In Review → Gabriela requests Approved (pinned v1) → the page is edited (v2). */
async function requestThenEdit(P: string) {
  const t1 = await inv("transitionWorkflow", { pageId: P, spaceKey: SPACE, to: "in_review", actor: GABI, actorName: "Gabriela Perdum" });
  expect(t1.result?.success, `to in_review (${JSON.stringify(t1.result).slice(0, 120)})`).toBe(true);
  const rq = await inv("reqTransition", { pageId: P, spaceKey: SPACE, to: "approved", actor: GABI });
  expect(rq.result?.pending, `Gabriela's request opens (${JSON.stringify(rq.result).slice(0, 160)})`).toBe(true);
  expect((await getKvs(`workflow-pending-${P}`))?.pinnedVersion, "the request is pinned to v1").toBe(1);
  await writeAdf(P, doc(heading("Policy", 2), paragraph("This is the policy text every employee must read."), paragraph("Edited after the approval was requested.")), { message: "wf1 edit after request" });
}

test("WF-1 server: approving a stale request is refused, nothing recorded, no 'declined' comment", async () => {
  const bed = await setupWorkflowPage("wf1-stale-server");
  const P = bed.pageId;
  try {
    await requestThenEdit(P);
    const st = await inv("pageApprovals", { pageId: P });
    console.log("### approval status after edit:", JSON.stringify(st.result));
    expect(st.result?.stale, "the read model knows the request is stale").toBe(true);
    expect.soft(st.result?.liveVersion, "…and names the live version").toBe(2);

    const dec = await inv("decideApproval", { pageId: P, approver: MIHAI, decision: "approved", reason: "Looks good to me" });
    console.log("### decideApproval on stale:", JSON.stringify(dec.result));
    expect.soft(dec.result?.success, "a stale approve is refused, not accepted-and-discarded").toBe(false);
    expect.soft(dec.result?.stale, "…flagged as stale").toBe(true);
    expect.soft(dec.result?.reason || "", "…with a reason naming both versions").toMatch(/reviewed v1.*now v2/i);
    expect.soft(await getKvs(`workflow-pending-${P}`), "the request is still open").toBeTruthy();
    expect.soft((await getKvs(`workflow-approval-${P}-approved-approval-${MIHAI}`))?.status, "Mihai's vote was not recorded").toBe("pending");
    const bodies = (await getComments(P)).map((c: any) => strip(c.body?.storage?.value || ""));
    console.log("### comments:", JSON.stringify(bodies));
    expect(bodies.some((b: string) => /declined/i.test(b)), "no 'declined' comment was posted to the requester").toBe(false);
  } finally {
    await bed.restore();
  }
});

test("WF-1 browser: the popover shows the stale block, disables Approve, and re-requests for the live version", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const bed = await setupWorkflowPage("wf1-stale-browser");
  const P = bed.pageId;
  try {
    await requestThenEdit(P);
    const r = await loadPage(page, P);
    expect(r, "ribbon renders").toBeTruthy();
    await r!.frame.locator("button.wf-chip-awaiting").click();
    const staleBlock = r!.frame.locator('[data-testid="wf-appr-stale"]');
    await expect(staleBlock, "the popover shows the stale block").toBeVisible({ timeout: 20_000 });
    const staleText = norm(await staleBlock.innerText());
    console.log("### stale block:", staleText);
    expect(staleText).toMatch(/reviewed v1.*now v2/i);
    await expect(r!.frame.locator(".wf-appr-approve"), "Approve is disabled while stale").toBeDisabled();
    await shotRibbon(page, r!.el, `${OUT}/01-popover-stale.png`, 380);

    await r!.frame.locator('[data-testid="wf-appr-rerequest"]').click();
    await expect.poll(async () => (await getKvs(`workflow-pending-${P}`))?.pinnedVersion, { timeout: 30_000, message: "the request is re-pinned to v2" }).toBe(2);
    await expect(staleBlock, "the stale block is gone after the re-request").toBeHidden({ timeout: 20_000 });
    await shotRibbon(page, r!.el, `${OUT}/02-popover-rerequested.png`, 380);
    await r!.frame.locator(".wf-appr-reason-input").fill("Looks good to me");
    await r!.frame.locator(".wf-appr-approve").click();
    await expect.poll(async () => (await getKvs(`workflow-state-${P}`))?.stateId, { timeout: 30_000 }).toBe("approved");
    await page.waitForTimeout(2500);
    await shotRibbon(page, r!.el, `${OUT}/03-approved.png`, 60);
    const after = (await getComments(P)).map((c: any) => strip(c.body?.storage?.value || ""));
    console.log("### comments after:", JSON.stringify(after));
    expect(after.some((b: string) => /Approval approved/i.test(b)), "the requester is told it was approved").toBe(true);
    expect(after.some((b: string) => /declined/i.test(b)), "no 'declined' comment anywhere").toBe(false);
  } finally {
    await bed.restore();
  }
});
