// WF-6 (UX critique 2026-09-19, owner: "yes"). Before the fix the workflow state lived ONLY on the
// ribbon: dismiss it and the page had no status anywhere — the byline chip was classification only
// and the details modal had no workflow block. After the fix ONE status ("state + one qualifier":
// `Draft`, `Awaiting approval 0 of 1`, `Approved v3`, `Declined Sep 20`, `Review overdue`) is
// folded into the `sentinel-byline` property on EVERY transition / approval / enforcement
// (`Level · State` when classification is on, the state alone when it is off — CLS-1) and the
// modal gets a Workflow block above Seals. Server half through the hook (no browser); browser half
// dismisses the ribbon and proves the chip and the modal still say where the page is. FAILS before,
// PASSES after.
import { test, expect } from "../../fixtures/forge";
import { mkdirSync } from "node:fs";
import { setupWorkflowPage, loadPage, shotRibbon, inv, getKvs, setKvs, delKvs, norm, SPACE, MIHAI, GABI } from "./_wf";
import { openDetailsModal, findDevChip } from "./_door";
// @ts-ignore
import { BASE } from "../../data/confluence.mjs";

const OUT = process.env.OUT_DIR || "evidence/wf6-byline-state";
const GLOBAL = "admin-settings-global";
const PROP = "sentinel-byline";
test.describe.configure({ timeout: 900_000 });

const auth = "Basic " + Buffer.from(`${process.env.JIRA_ADMIN_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");
async function readByline(pageId: string): Promise<{ title: string; icon: string; tooltip: string } | null> {
  const r = await fetch(`${BASE}/wiki/api/v2/pages/${pageId}/properties?key=${PROP}`, { headers: { Authorization: auth, Accept: "application/json" } });
  if (!r.ok) throw new Error(`property read → ${r.status}`);
  return ((await r.json()) as any).results?.[0]?.value || null;
}
const decodeIcon = (icon: string) => decodeURIComponent(icon.replace(/^data:image\/svg\+xml;utf8,/, ""));
const call = async (key: string, payload: any, actor = MIHAI) => (await inv("invoke", { key, payload: JSON.stringify(payload), actor })).result;

async function classificationSwitch() {
  const before = await getKvs(GLOBAL);
  const set = async (on: boolean) => setKvs(GLOBAL, { ...(before || {}), classificationEnabled: on });
  const restore = async () => { if (before == null) await delKvs(GLOBAL).catch(() => {}); else await setKvs(GLOBAL, before); };
  return { set, restore };
}

test("WF-6 server: the byline carries the state through every transition; the summary carries a Workflow block", async () => {
  const bed = await setupWorkflowPage("wf6-server");
  const P = bed.pageId;
  const cls = await classificationSwitch();
  try {
    // ── Draft, classification off: the state alone (nothing else to say) ──────────────────────
    await cls.set(false);
    await inv("refreshByline", { pageId: P, force: "1" });
    const b0 = await readByline(P);
    console.log("### Draft/off byline:", JSON.stringify(b0));
    expect(b0?.title, "Draft, classification off → the chip reads the state").toBe("Draft");
    // ── Draft, classification on: Level · State ───────────────────────────────────────────────
    await cls.set(true);
    await inv("refreshByline", { pageId: P, force: "1" });
    expect((await readByline(P))?.title, "classification on → Level · State").toBe("Unclassified · Draft");
    await cls.set(false);

    // ── In Review — written BY the transition itself (no manual refresh) ─────────────────────
    const t1 = await inv("transitionWorkflow", { pageId: P, spaceKey: SPACE, to: "in_review", actor: GABI, actorName: "Gabriela Perdum" });
    expect(t1.result?.success, `to in_review (${JSON.stringify(t1.result).slice(0, 120)})`).toBe(true);
    await expect.poll(async () => (await readByline(P))?.title, { timeout: 20_000, message: "the transition rewrote the chip" }).toBe("In Review");

    // ── an open approval request: "Awaiting approval 0 of 1" ─────────────────────────────────
    const rq = await inv("reqTransition", { pageId: P, spaceKey: SPACE, to: "approved", actor: GABI });
    expect(rq.result?.pending, `request opens (${JSON.stringify(rq.result).slice(0, 160)})`).toBe(true);
    await expect.poll(async () => (await readByline(P))?.title, { timeout: 20_000 }).toBe("Awaiting approval 0 of 1");
    const s1 = await call("page-details-summary", { pageId: P });
    console.log("### pending summary.workflow:", JSON.stringify(s1?.workflow).slice(0, 400));
    expect(s1?.workflow?.assigned, "the summary carries a workflow block").toBe(true);
    expect(s1?.workflow?.status?.text).toBe("Awaiting approval 0 of 1");
    expect(s1?.workflow?.pending?.toStateName).toBe("Approved");
    expect(s1?.workflow?.pending?.iCanDecide, "Mihai (the approver) is told he can decide").toBe(true);

    // ── approved: "Approved vN", green ───────────────────────────────────────────────────────
    const dec = await inv("decideApproval", { pageId: P, approver: MIHAI, decision: "approved", reason: "Looks good" });
    expect(dec.result?.success && dec.result?.transitioned, `approve completes (${JSON.stringify(dec.result).slice(0, 160)})`).toBe(true);
    const rec = await getKvs(`workflow-state-${P}`);
    await expect.poll(async () => (await readByline(P))?.title, { timeout: 20_000 }).toBe(`Approved v${rec.approvedVersion}`);
    const b3 = await readByline(P);
    console.log("### approved byline:", JSON.stringify(b3));
    expect(decodeIcon(b3!.icon), "the disc carries the success tone").toContain('fill="#15803D"');
    expect(b3!.tooltip, "the tooltip spells the status out").toMatch(/Workflow: Approved — v\d+/);
    const s2 = await call("page-details-summary", { pageId: P });
    console.log("### approved summary.workflow:", JSON.stringify(s2?.workflow).slice(0, 500));
    expect(s2?.workflow?.state?.id).toBe("approved");
    expect(s2?.workflow?.status?.tone).toBe("success");
    expect(s2?.workflow?.enforced).toBe(true);
    expect(s2?.workflow?.approvalSummary, "the approval record is summarised in one sentence").toMatch(/Approved for version \d+ on /);
    expect(s2?.workflow?.available?.length, "the same Move-to targets the ribbon offers").toBeGreaterThan(0);

    // ── classification on + approved: Level · State ──────────────────────────────────────────
    await cls.set(true);
    await inv("refreshByline", { pageId: P, force: "1" });
    expect((await readByline(P))?.title).toBe(`Unclassified · Approved v${rec.approvedVersion}`);
    await cls.set(false);

    // ── review overdue beats everything (set-review-due refuses a past date, so the elapsed
    //    date is planted on the record the way time would leave it, then the chip is refreshed) ──
    await setKvs(`workflow-state-${P}`, { ...(await getKvs(`workflow-state-${P}`)), reviewDueAt: "2026-01-01T00:00:00.000Z" });
    await inv("refreshByline", { pageId: P, force: "1" });
    expect((await readByline(P))?.title, "an elapsed review date wins over Approved").toBe("Review overdue");
    expect(decodeIcon((await readByline(P))!.icon)).toContain('fill="#B91C1C"');
  } finally {
    await cls.restore();
    await bed.restore();
  }
});

test("WF-6 server: a denied request reads 'Declined <date>' on the chip", async () => {
  const bed = await setupWorkflowPage("wf6-denied");
  const P = bed.pageId;
  const cls = await classificationSwitch();
  try {
    await cls.set(false);
    const t1 = await inv("transitionWorkflow", { pageId: P, spaceKey: SPACE, to: "in_review", actor: GABI, actorName: "Gabriela Perdum" });
    expect(t1.result?.success).toBe(true);
    const rq = await inv("reqTransition", { pageId: P, spaceKey: SPACE, to: "approved", actor: GABI });
    expect(rq.result?.pending).toBe(true);
    const dec = await inv("decideApproval", { pageId: P, approver: MIHAI, decision: "denied", reason: "Needs a summary" });
    expect(dec.result?.outcome).toBe("denied");
    const today = new Date().toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" }); // the lambda pins the chip's date to UTC
    await expect.poll(async () => (await readByline(P))?.title, { timeout: 20_000 }).toBe(`Declined ${today}`);
    const b = await readByline(P);
    console.log("### declined byline:", JSON.stringify(b));
    expect(decodeIcon(b!.icon)).toContain('fill="#B91C1C"');
    const s = await call("page-details-summary", { pageId: P });
    expect(s?.workflow?.lastDecision?.reason).toBe("Needs a summary");
  } finally {
    await cls.restore();
    await bed.restore();
  }
});

test("WF-6 browser: with the ribbon dismissed the chip and the modal still say where the page is", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const bed = await setupWorkflowPage("wf6-browser");
  const P = bed.pageId;
  const cls = await classificationSwitch();
  const shot = async (name: string) => page.screenshot({ path: `${OUT}/${name}.png` });
  try {
    await cls.set(false);
    // Approve the page (direct steward transition through the approval path).
    await inv("transitionWorkflow", { pageId: P, spaceKey: SPACE, to: "in_review", actor: GABI, actorName: "Gabriela Perdum" });
    const rq = await inv("reqTransition", { pageId: P, spaceKey: SPACE, to: "approved", actor: GABI });
    expect(rq.result?.pending).toBe(true);
    const dec = await inv("decideApproval", { pageId: P, approver: MIHAI, decision: "approved", reason: "ok" });
    expect(dec.result?.transitioned).toBe(true);
    const rec = await getKvs(`workflow-state-${P}`);
    await expect.poll(async () => (await readByline(P))?.title, { timeout: 20_000 }).toBe(`Approved v${rec.approvedVersion}`);

    const r = await loadPage(page, P);
    expect(r, "ribbon renders").toBeTruthy();
    await shotRibbon(page, r!.el, `${OUT}/01-ribbon-approved.png`);
    await r!.frame.locator('[data-testid="ribbon-dismiss"]').click();
    await page.waitForTimeout(1500);
    const chip = await findDevChip(page);
    const chipText = norm(await chip.innerText());
    console.log("### chip after dismiss:", chipText);
    expect(chipText, "the chip says the state without the ribbon").toMatch(new RegExp(`^Approved v${rec.approvedVersion}`));
    const box = await chip.boundingBox();
    await page.screenshot({ path: `${OUT}/02-chip-no-ribbon.png`, clip: box ? { x: Math.max(0, box.x - 260), y: Math.max(0, box.y - 40), width: 700, height: 110 } : undefined });

    const app = await openDetailsModal(page);
    const wf = app.locator('[data-testid="pd-workflow"]');
    await expect(wf, "the modal has a Workflow block").toBeVisible();
    const seals = app.locator('[data-testid="pd-seals"]');
    const [wfBox, sealBox] = [await wf.boundingBox(), await seals.boundingBox()];
    expect(wfBox!.y, "…ABOVE Seals").toBeLessThan(sealBox!.y);
    await expect(wf.locator('[data-testid="pd-wf-state"]')).toHaveText(`Approved v${rec.approvedVersion}`);
    const text = norm(await wf.innerText());
    console.log("### workflow block:", text);
    expect(text).toMatch(/Approved for version \d+ on/);
    expect(text).toMatch(/Move to/);
    await shot("03-modal-workflow");
    await page.evaluate(() => { document.documentElement.dataset.colorMode = "dark"; });
    await app.locator("html").evaluate((h: any) => h.setAttribute("data-color-mode", "dark"));
    await page.waitForTimeout(400);
    await shot("03b-modal-workflow-dark");
    // Move to from the modal: back to Draft (a plain transition, no signature on WFH).
    await wf.locator('[data-testid="pd-wf-move"]').click();
    await wf.locator('[data-testid="pd-wf-move-draft"]').click();
    await expect.poll(async () => (await getKvs(`workflow-state-${P}`))?.stateId, { timeout: 30_000 }).toBe("draft");
    await expect(wf.locator('[data-testid="pd-wf-state"]'), "the block follows the move").toHaveText("Draft", { timeout: 20_000 });
    await shot("04-modal-after-move");
    await expect.poll(async () => (await readByline(P))?.title, { timeout: 20_000 }).toBe("Draft");
  } finally {
    await cls.restore();
    await bed.restore();
  }
});
