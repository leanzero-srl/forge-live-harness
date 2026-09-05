// COVERAGE-MATRIX #7 (depth) — the doc-ribbon APPROVAL dialog journey that page-ribbon-workflow
// left as a residual ("the deep dialog interaction is a residual"). Seeding a REAL pending approval
// via the hook IS possible: requestApproval(approvers=<mihai>) writes workflow-pending-{pageId} +
// one per-approver record, and the signed-in harness user (mihai) is then the LIVE approver, so the
// whole journey runs in the browser on a THROWAWAY page:
//   assignWorkflow → transition to In Review → requestApproval to=Approved (mihai, mode=any)
//   → the ribbon renders the caution "Awaiting your approval" chip with a "0 of 1" count
//   → clicking opens the approval panel (role=dialog): heading, "0 of 1 approved" progress,
//     the "(you)" approver row, and live Approve/Deny controls
//   → keyboard: Escape closes the dialog and focus RETURNS to the chip (the a11y contract)
//   → reopen → Approve → decide-approval completes the transition (mode=any quorum met)
//   → KVS: workflow-state-{id}.stateId === "approved" and workflow-pending-{id} is cleared
//   → UI: the chip re-renders as the solid state chip labelled "Approved".
// Lesson (1) note: NO kvs.query-backed surface is involved — the ribbon's get-page-approvals
// resolver is a direct kvs.get(workflow-pending-{pageId}) (strongly consistent), so a plain
// get-visibility check on the seeded pending record suffices before loading the page.
// pinnedVersion is deliberately NOT passed — a pinned version would arm the staleness gate (§1.5)
// and block completion if anything bumps the page version between seed and click.
// Self-cleaning: throwaway page; workflow state/idx/pending/approval keys deleted in finally
// (workflow-log-* cleaned best-effort via the eventually-consistent what=query).
import { test, expect } from "../../fixtures/forge";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage, writeAdf } from "../../data/confluence.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const DEV = "17516615";
const OUT = "/tmp/sv-ribbon-approval";
// The signed-in harness user — seeded as the approver so the browser session can decide for real.
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";

const inv = (fn: string, params: Record<string, string>) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const queryKvs = async (prefix: string): Promise<string[]> => (await getTestState("sentinel-vault", { what: "query", prefix })).keys || [];
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });

test.describe.configure({ timeout: 240_000, retries: 1 });

test("#7: approval dialog — opens from the awaiting chip, Escape returns focus, Approve completes the transition", async ({ page }) => {
  const { mkdirSync } = await import("node:fs");
  mkdirSync(OUT, { recursive: true });
  const spaceId = await spaceIdByKey(SPACE);
  expect(spaceId, `space ${SPACE} resolves`).toBeTruthy();
  const p = await createPage({ spaceId, title: `HARNESS sv-ribbon-approval ${Date.now()}`, adf: doc(heading("Doc", 2), paragraph("approval dialog journey")) });
  try {
    // ── seed: workflow → In Review → pending approval with MIHAI as the sole approver (mode=any)
    const asg = await inv("assignWorkflow", { pageId: p.id, spaceKey: SPACE, workflowId: "default", actor: "sv-aql-appr" });
    expect(asg.result, "workflow assigned").toBeTruthy();
    await inv("transitionWorkflow", { pageId: p.id, spaceKey: SPACE, to: "in_review", actor: "sv-aql-appr" });
    expect((await getKvs(`workflow-state-${p.id}`))?.stateId, "page is In Review before the approval opens").toBe("in_review");
    await inv("requestApproval", {
      pageId: p.id, spaceKey: SPACE, to: "approved", toName: "Approved",
      approvers: MIHAI, mode: "any", actor: "sv-aql-appr",
    });
    const pending = await getKvs(`workflow-pending-${p.id}`);
    expect(pending?.approvers?.includes(MIHAI), "pending approval seeded with mihai as approver").toBeTruthy();

    // ── load the page and poll for the dev doc-ribbon frame carrying the AWAITING chip
    await page.goto(`https://wolfaenpak.atlassian.net/wiki/pages/viewpage.action?pageId=${p.id}`, { waitUntil: "domcontentloaded" });
    const ifr = page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"], iframe[src*="atlassian-dev.net"]');
    let ribbon: any = null;
    for (let t = 0; t < 25 && !ribbon; t++) {
      const n = await ifr.count();
      for (let i = 0; i < n; i++) {
        const src = (await ifr.nth(i).getAttribute("src").catch(() => "")) || "";
        if (!src.includes(DEV)) continue;
        const cf = ifr.nth(i).contentFrame();
        if ((await cf.locator(".wf-chip-awaiting").count().catch(() => 0)) > 0) { ribbon = cf; break; }
      }
      if (!ribbon) await page.waitForTimeout(1500);
    }
    expect(ribbon, "the doc-ribbon renders the awaiting-approval chip").toBeTruthy();

    const chip = ribbon.locator("button.wf-chip.wf-chip-awaiting").first();
    const chipText = ((await chip.innerText().catch(() => "")) as string).replace(/\s+/g, " ").trim();
    // mihai is a pending approver of THIS approval, so the chip must address him directly.
    expect(chipText, "chip addresses the signed-in approver").toContain("Awaiting your approval");
    expect(chipText, "chip shows the N-of-M count").toContain("0 of 1");
    await ribbon.locator("body").screenshot({ path: `${OUT}/1-awaiting-chip.png` }).catch(() => {});

    // ── open the approval panel (role=dialog) and verify the "N of M" progress + decide controls
    await chip.click();
    const dialog = ribbon.locator('[role="dialog"].wf-appr-panel');
    await expect(dialog, "approval panel opens as role=dialog").toBeVisible({ timeout: 8000 });
    await expect(chip, "chip reflects the open dialog").toHaveAttribute("aria-expanded", "true");
    const progress = ((await dialog.locator(".wf-appr-progress").innerText()) as string).trim();
    expect(progress, "dialog shows N-of-M progress").toBe("0 of 1 approved");
    const myRow = ((await dialog.locator(".wf-appr-list").innerText()) as string).replace(/\s+/g, " ");
    expect(myRow, "approver list marks the signed-in user").toContain("(you)");
    await expect(dialog.locator("button.wf-appr-approve"), "Approve control present").toBeVisible();
    await expect(dialog.locator("button.wf-appr-deny"), "Deny control present").toBeVisible();
    await ribbon.locator("body").screenshot({ path: `${OUT}/2-dialog-open.png` }).catch(() => {});
    console.log(`### approval dialog open — progress "${progress}" ✓`);

    // ── keyboard: Escape closes the dialog and focus returns to the chip trigger
    await page.waitForTimeout(600); // let the open-effect's rAF focus the panel first
    await page.keyboard.press("Escape");
    await expect(dialog, "Escape closes the dialog").toBeHidden({ timeout: 5000 });
    await expect(chip, "aria-expanded resets on close").toHaveAttribute("aria-expanded", "false");
    const focusReturned = await chip.evaluate((el: HTMLElement) => el === el.ownerDocument.activeElement);
    expect(focusReturned, "focus returns to the awaiting chip after Escape").toBeTruthy();
    console.log("### Escape closed the dialog + focus returned to the chip ✓");

    // ── reopen and APPROVE — mode=any, so this one decision completes the transition
    await chip.click();
    await expect(dialog).toBeVisible({ timeout: 8000 });
    // A6: an approver can open exactly the version they are approving.
    const pinnedLink = dialog.locator('[data-testid="wf-pinned-version-link"]');
    if (await pinnedLink.count()) {
      const href = (await pinnedLink.getAttribute("href")) || "";
      expect(href, "the pinned-version link names the page and a version").toMatch(new RegExp(`pageId=${p.id}.*pageVersion=\\d+`));
      console.log("### pinned-version link ✓", href.slice(href.indexOf("pageId")));
    }
    await dialog.locator(".wf-appr-reason-input").fill("Reviewed the budget table — approved");
    await dialog.locator("button.wf-appr-approve").click();

    // record updated: state flips to approved and the pending marker clears (direct kvs gets)
    const state = await waitForTerminal(async () => {
      const v = await getKvs(`workflow-state-${p.id}`);
      return v?.stateId === "approved" ? v : null;
    }, { timeout: 60_000, label: "workflow-state reaches approved" });
    expect(state.stateId).toBe("approved");
    await waitForTerminal(async () => ((await getKvs(`workflow-pending-${p.id}`)) == null ? true : null),
      { timeout: 30_000, label: "workflow-pending cleared" });
    console.log("### Approve recorded — state approved, pending cleared ✓");

    // UI settles: the awaiting chip is replaced by the solid state chip labelled "Approved"
    let uiApproved = false;
    for (let t = 0; t < 14 && !uiApproved; t++) {
      const label = ((await ribbon.locator("button.wf-chip .wf-chip-label").first().innerText().catch(() => "")) as string).trim();
      if (label === "Approved") { uiApproved = true; break; }
      await page.waitForTimeout(1500);
    }
    expect(uiApproved, "the ribbon chip re-renders as the Approved state chip").toBeTruthy();
    await ribbon.locator("body").screenshot({ path: `${OUT}/3-approved-chip.png` }).catch(() => {});
    console.log("### chip now shows the Approved state ✓");

    // ── A4: the evidence chip opens the approval record with the decision just made
    const evChip = ribbon.locator('[data-testid="wf-evidence-chip"]');
    await expect(evChip, "the Approved v{n} evidence chip renders next to the state chip").toBeVisible({ timeout: 20_000 });
    const evLabel = ((await evChip.innerText()) as string).replace(/\s+/g, " ").trim();
    expect(evLabel, "the chip names the approved version").toMatch(/Approval record · v\d+/);
    await evChip.click();
    const evPanel = ribbon.locator('[data-testid="wf-evidence-panel"]');
    await expect(evPanel, "the Approval record dialog opens").toBeVisible({ timeout: 8000 });
    const evText = ((await evPanel.innerText()) as string).replace(/\s+/g, " ");
    expect(evText, "the record names the approver").toContain("Mihai Perdum");
    expect(evText, "…their decision").toMatch(/Approved/);
    expect(evText, "…and the reason typed in the dialog").toContain("Reviewed the budget table");
    const rows = evPanel.locator('[data-testid="wf-evidence-decision"]');
    expect(await rows.count(), "one decision row").toBe(1);
    // ── A6: the approved-version link points at the historical version of THIS page
    const link = evPanel.locator('[data-testid="wf-approved-version-link"]');
    await expect(link, "View approved version link present").toBeVisible();
    const href = (await link.getAttribute("href")) || "";
    const m = href.match(/pageVersion=(\d+)/);
    expect(m, `the link carries pageVersion (href: ${href})`).toBeTruthy();
    expect(href, "…for this page").toContain(`pageId=${p.id}`);
    expect(String(state.approvedVersion), "…and it is the approvedVersion on the record").toBe(m![1]);
    await ribbon.locator("body").screenshot({ path: `${OUT}/4-evidence-panel.png` }).catch(() => {});
    // Make the approved version HISTORICAL first: Confluence canonicalises a viewpage URL for the
    // CURRENT version to the pretty /spaces/…/pages/{id}/ URL and drops pageVersion, so a click
    // to the current version is indistinguishable from staying put. A later version written over
    // REST (as the signed-in admin — a sanctioned edit) turns v{n} into a real historical view; the
    // link keeps pointing at the REVIEWED version (approvalRecord.pinnedVersion), not the moving
    // enforce baseline.
    await writeAdf(p.id, doc(heading("Doc", 2), paragraph("approval dialog journey"), paragraph("a later, sanctioned edit")), { message: "harness: later version" });
    // Follow it BY CLICKING inside the iframe: the ribbon is a sandboxed frame, so a plain
    // target="_top" anchor is dropped by the browser — the click must navigate through the Forge
    // bridge router (the review caught exactly this). A top-level page.goto would prove nothing.
    await link.click();
    await page.waitForURL((u) => u.toString().includes(`pageId=${p.id}`) && u.toString().includes(`pageVersion=${m![1]}`), { timeout: 30_000 });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);
    expect(page.url(), "the click navigated the TOP window to the historical version URL").toContain(`pageVersion=${m![1]}`);
    const topTitle = await page.title();
    expect(topTitle, "the page rendered (not a 404)").not.toMatch(/Page Not Found/i);
    console.log(`### evidence chip + approved-version link ✓ (v${m![1]})`);
  } finally {
    for (const k of [
      `workflow-state-${p.id}`,
      `workflow-pending-${p.id}`,
      `workflow-autoassigned-${p.id}`,
      `workflow-approval-${p.id}-approved-approval-${MIHAI}`,
      `workflow-idx-${SPACE}-draft-${p.id}`,
      `workflow-idx-${SPACE}-in_review-${p.id}`,
      `workflow-idx-${SPACE}-approved-${p.id}`,
    ]) await delKvs(k).catch(() => {});
    // transition-log keys carry a timestamp suffix — enumerate via the (eventually consistent)
    // query and delete what it can see; leftovers are inert log rows on a deleted page.
    for (const prefix of [`workflow-log-${p.id}-`, `workflow-approval-${p.id}-`]) {
      const keys = await queryKvs(prefix).catch(() => [] as string[]);
      for (const k of keys) await delKvs(k).catch(() => {});
    }
    await deletePage(p.id).catch(() => {});
  }
});
