// WF-3 (UX critique 2026-09-19): the approver typed "Needs a summary section at the top" and denied;
// the author saw "In Review ▾ · Set review date" and a comment saying only "declined by Mihai Perdum".
// The reason was written to the workflow-log and shown nowhere. After the fix the comment prints the
// reason, get-page-workflow answers `lastDecision`, and the ribbon's details chip reads "Declined <date>"
// with the reason in its popover. Two tests: SERVER (hook only) and BROWSER. FAIL before, PASS after.
import { test, expect } from "../../fixtures/forge";
import { mkdirSync } from "node:fs";
import { setupWorkflowPage, loadPage, shotRibbon, inv, getKvs, strip, norm, SPACE, MIHAI, GABI } from "./_wf";
// @ts-ignore
import { getComments } from "../../data/confluence.mjs";

const OUT = process.env.OUT_DIR || "evidence/wf3-rejection-reason";
const REASON = "Needs a summary section at the top";
test.describe.configure({ timeout: 600_000 });

async function requestThenDeny(P: string) {
  const t1 = await inv("transitionWorkflow", { pageId: P, spaceKey: SPACE, to: "in_review", actor: GABI, actorName: "Gabriela Perdum" });
  expect(t1.result?.success, `to in_review (${JSON.stringify(t1.result).slice(0, 120)})`).toBe(true);
  const rq = await inv("reqTransition", { pageId: P, spaceKey: SPACE, to: "approved", actor: GABI });
  expect(rq.result?.pending, `Gabriela's request opens (${JSON.stringify(rq.result).slice(0, 160)})`).toBe(true);
  const dec = await inv("decideApproval", { pageId: P, approver: MIHAI, decision: "denied", reason: REASON });
  expect(dec.result?.success && dec.result?.outcome === "denied", `deny recorded (${JSON.stringify(dec.result).slice(0, 160)})`).toBe(true);
  expect(await getKvs(`workflow-pending-${P}`), "the request is closed").toBeFalsy();
}

test("WF-3 server: the denial comment carries the reason and get-page-workflow answers lastDecision", async () => {
  const bed = await setupWorkflowPage("wf3-reason-server");
  const P = bed.pageId;
  try {
    await requestThenDeny(P);
    const bodies = (await getComments(P)).map((c: any) => strip(c.body?.storage?.value || ""));
    console.log("### comments:", JSON.stringify(bodies));
    const declined = bodies.find((b: string) => /Approval declined/i.test(b)) || "";
    expect(declined, "a declined comment exists").toBeTruthy();
    expect.soft(declined, "…and prints the approver's reason").toContain(REASON);
    const wf = await inv("getWorkflow", { pageId: P, spaceKey: SPACE, actor: MIHAI });
    console.log("### lastDecision:", JSON.stringify(wf.result?.lastDecision));
    expect(wf.result?.lastDecision?.kind, "get-page-workflow names the last decision").toBe("denied");
    expect(wf.result?.lastDecision?.reason, "…with the reason").toBe(REASON);
    expect(wf.result?.lastDecision?.byName, "…and who").toBeTruthy();
    expect(wf.result?.lastDecision?.reviewedVersion, "…and the version reviewed").toBe(1);
  } finally {
    await bed.restore();
  }
});

test("WF-3 browser: the details chip says Declined and the popover shows the reason", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const bed = await setupWorkflowPage("wf3-reason-browser");
  const P = bed.pageId;
  try {
    await requestThenDeny(P);
    const r = await loadPage(page, P);
    expect(r, "ribbon renders").toBeTruthy();
    const chip = r!.frame.locator('[data-testid="wf-details-chip"]');
    await expect(chip, "the details chip is on the ribbon").toBeVisible({ timeout: 20_000 });
    const chipText = norm(await chip.innerText());
    console.log("### details chip:", chipText);
    expect(chipText, "the chip names the declined decision").toMatch(/^Declined /);
    await shotRibbon(page, r!.el, `${OUT}/01-ribbon-declined-chip.png`, 20);
    await chip.click();
    const sec = r!.frame.locator('[data-testid="wf-last-decision"]');
    await expect(sec, "the popover has a last-decision section").toBeVisible({ timeout: 20_000 });
    const secText = norm(await sec.innerText());
    console.log("### last decision section:", secText);
    expect(secText).toMatch(/Declined by .+ on /);
    expect(secText).toContain(REASON);
    expect(secText).toMatch(/reviewed v1/);
    await shotRibbon(page, r!.el, `${OUT}/02-popover-reason.png`, 360);
  } finally {
    await bed.restore();
  }
});
