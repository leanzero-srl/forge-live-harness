// WF-3 (c) (UX critique 2026-09-19, done 2026-09-20): the requester's own approval requests had
// no home — the inbox is the approvers', the ribbon is per page, and a requester whose request
// was declined or refused as stale had to go back to every page to find out. After the fix the
// request writes wfreq-mine-{requester}-{pageId} (the SEC-8 requester-index pattern), the resolver
// list-my-approval-requests confirms every row against the pending record / the page's record /
// the log, and My work has an "Approvals you asked for" card. Server half through the hook;
// browser half on My work as the harness user (Mihai = the requester, Gabriela = the approver).
import { test, expect } from "../../fixtures/forge";
import { mkdirSync } from "node:fs";
import { setupWorkflowPage, inv, getKvs, norm, SPACE, MIHAI, GABI } from "./_wf";
import { getTarget } from "../../config/targets";
import { enterForgeSurface } from "../../forge/frame";

const OUT = process.env.OUT_DIR || "evidence/wf3c-my-approval-requests";
test.describe.configure({ timeout: 900_000 });
const call = async (key: string, payload: any, actor = MIHAI) => (await inv("invoke", { key, payload: JSON.stringify(payload), actor })).result;

// My work renders in one of several hosted-resources iframes; enterForgeSurface picks by index and
// has landed on the wrong one — find the frame by its content instead.
async function findMwFrame(page: any) {
  let mw: any = null;
  await expect.poll(async () => {
    const ifr = page.locator("iframe");
    const n = await ifr.count();
    for (let i = 0; i < n; i++) {
      const f = ifr.nth(i).contentFrame();
      if ((await f.locator('[data-testid="mw-my-approval-row"]').count().catch(() => 0)) > 0) { mw = f; return true; }
    }
    return false;
  }, { timeout: 90_000, message: "My work rendered with the card" }).toBe(true);
  return mw;
}

test("WF-3 (c) server: the requester sees waiting → declined (with the word) → approved, and a stale refusal", async () => {
  const bed = await setupWorkflowPage("wf3c-server"); // Mihai sole approver
  const P = bed.pageId;
  try {
    const t1 = await inv("transitionWorkflow", { pageId: P, spaceKey: SPACE, to: "in_review", actor: GABI, actorName: "Gabriela Perdum" });
    expect(t1.result?.success).toBe(true);
    const rq = await call("request-transition", { pageId: P, toStateId: "approved" }, GABI);
    expect(rq?.pending, `Gabriela's request opens (${JSON.stringify(rq).slice(0, 120)})`).toBe(true);
    expect(await getKvs(`wfreq-mine-${GABI}-${P}`), "the requester index row is written").toBeTruthy();
    let mine = (await call("list-my-approval-requests", {}, GABI))?.requests || [];
    let row = mine.find((r: any) => String(r.pageId) === P);
    console.log("### pending:", JSON.stringify(row));
    expect(row?.status).toBe("pending");
    expect([row?.decided, row?.approverCount]).toEqual([0, 1]);
    expect(row?.pageTitle, "the row carries the page title").toMatch(/HARNESS wf3c-server/);
    expect(((await call("list-my-approval-requests", {}, MIHAI))?.requests || []).some((r: any) => String(r.pageId) === P), "the approver does not see it as HIS request").toBe(false);
    // declined with a word
    const d = await inv("decideApproval", { pageId: P, approver: MIHAI, decision: "denied", reason: "needs a summary" });
    expect(d.result?.success).toBe(true);
    mine = (await call("list-my-approval-requests", {}, GABI))?.requests || [];
    row = mine.find((r: any) => String(r.pageId) === P);
    console.log("### declined:", JSON.stringify(row));
    expect(row?.status).toBe("denied");
    expect(row?.reason).toBe("needs a summary");
    expect(row?.byName).toBeTruthy();
    // ask again → approved
    const rq2 = await call("request-transition", { pageId: P, toStateId: "approved" }, GABI);
    expect(rq2?.pending, `second request (${JSON.stringify(rq2).slice(0, 120)})`).toBe(true);
    const a = await inv("decideApproval", { pageId: P, approver: MIHAI, decision: "approved", reason: "ok" });
    expect(a.result?.success && a.result?.transitioned).toBe(true);
    mine = (await call("list-my-approval-requests", {}, GABI))?.requests || [];
    row = mine.find((r: any) => String(r.pageId) === P);
    console.log("### approved:", JSON.stringify(row));
    expect(row?.status).toBe("approved");
    expect(row?.approvedVersion, "the approved version rides the row").toBeGreaterThanOrEqual(1);
  } finally {
    await call("request-transition", { pageId: P, toStateId: "draft" }, MIHAI).catch(() => {});
    await bed.restore();
  }
});

test("WF-3 (c) browser: My work lists the approval I asked for — Waiting, then Declined with the approver's word", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const bed = await setupWorkflowPage("wf3c-browser", { approvers: [{ id: GABI, name: "Gabriela Perdum" }] });
  const P = bed.pageId;
  try {
    const t1 = await inv("transitionWorkflow", { pageId: P, spaceKey: SPACE, to: "in_review", actor: MIHAI, actorName: "Mihai Perdum" });
    expect(t1.result?.success).toBe(true);
    const rq = await call("request-transition", { pageId: P, toStateId: "approved" }, MIHAI);
    expect(rq?.pending, `Mihai's request opens (${JSON.stringify(rq).slice(0, 120)})`).toBe(true);
    const T = getTarget("sentinel-my-work");
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    await enterForgeSurface(page, { surface: "custom", readySelector: '[data-testid="mw-page"]', timeout: 60_000 }).catch(() => {});
    let mw: any = await findMwFrame(page);
    const card = mw.locator('[data-testid="mw-my-approval-requests"]');
    await expect(card, "the card is on My work").toBeVisible({ timeout: 30_000 });
    let row = card.locator('[data-testid="mw-my-approval-row"]', { hasText: "wf3c-browser" });
    await expect(row, "my request is listed").toBeVisible({ timeout: 30_000 });
    let line = norm(await row.locator('[data-testid="mw-my-approval-line"]').innerText());
    console.log("### waiting row:", line);
    expect(line).toMatch(/^Waiting for the approvers · 0 of 1 decided · asked /);
    await expect(row.locator('[data-testid="mw-my-approval-state"]')).toHaveText("Waiting");
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/01-my-work-waiting.png` });
    // Gabriela declines with a word
    const d = await inv("decideApproval", { pageId: P, approver: GABI, decision: "denied", reason: "add the risk table first" });
    expect(d.result?.success).toBe(true);
    // A reload leaves enterForgeSurface's iframe handle stale (it picked nth(3) before the reload):
    // navigate afresh and find the My work frame by its content.
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    mw = await findMwFrame(page);
    row = mw.locator('[data-testid="mw-my-approval-row"]', { hasText: "wf3c-browser" });
    await expect(row).toBeVisible({ timeout: 30_000 });
    line = norm(await row.locator('[data-testid="mw-my-approval-line"]').innerText());
    console.log("### declined row:", line);
    expect(line).toMatch(/^Declined by Gabriela Perdum: “add the risk table first” · /);
    await expect(row.locator('[data-testid="mw-my-approval-state"]')).toHaveText("Declined");
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/02-my-work-declined.png` });
    await mw.locator("html").evaluate((h: any) => h.setAttribute("data-color-mode", "dark"));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/02b-my-work-declined-dark.png` });
  } finally {
    await call("request-transition", { pageId: P, toStateId: "draft" }, MIHAI).catch(() => {});
    await bed.restore();
  }
});
