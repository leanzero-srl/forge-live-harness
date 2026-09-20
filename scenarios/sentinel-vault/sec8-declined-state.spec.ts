// SEC-8 (UX critique 2026-09-19). Before the fix a declined requester saw nothing: the ribbon still
// said "Locked … Request edit" and pressing it answered "A previous request was declined; you can
// ask again after 2026-09-19 20:19 UTC" (an ISO-UTC stamp for a human), the row was a DISABLED
// "Request edit" whose explanation lived in a title tooltip, the owner was never asked for a reason,
// and My work had no card for the requester's own requests. After the fix the declined request is
// a VISIBLE state — "Declined · ask again Tue 22:19" on the row and on the ribbon's pill, with the
// owner's optional word ("The owner said …") — the server refusal carries `retryAt` and no clock,
// the modal's Decline opens a reason bar, and My work has "Your edit requests" (pending / declined /
// granted). Server half through the hook; browser half as Mihai (the requester) and as the owner.
// FAILS before, PASSES after.
import { test, expect } from "../../fixtures/forge";
import { mkdirSync } from "node:fs";
import { setupWorkflowPage, loadPage, shotRibbon, inv, getKvs, norm, MIHAI, GABI } from "./_wf";
import { openDetailsModal } from "./_door";
import { getTarget } from "../../config/targets";
import { enterForgeSurface } from "../../forge/frame";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";

const OUT = process.env.OUT_DIR || "evidence/sec8-declined-state";
test.describe.configure({ timeout: 900_000 });
const call = async (key: string, payload: any, actor = MIHAI) => (await inv("invoke", { key, payload: JSON.stringify(payload), actor })).result;
const BODY = [heading("Scope", 2), paragraph("What is in and out."), heading("Risks", 2), paragraph("The risks we accept."), heading("Decisions", 2), paragraph("What we decided.")];
const CLOCK = "[A-Z][a-z]{2} \\d{2}:\\d{2}";

async function sealRisksAsGabi(P: string) {
  const hs = await call("list-page-headings", { pageId: P }, GABI);
  const risks = (hs?.headings || []).find((h: any) => h.text === "Risks");
  const s = await call("seal-section", { pageId: P, headingIndex: risks.index, headingText: "Risks", lockDuration: 2 * 86400 }, GABI);
  expect(s?.success, `Gabriela seals Risks (${JSON.stringify(s).slice(0, 160)})`).toBe(true);
  return s.sectionId as string;
}

test("SEC-8 server: a decline carries the owner's reason; the refusal carries retryAt and no clock; the requester's own list says Declined", async () => {
  const bed = await setupWorkflowPage("sec8-server", { body: BODY });
  const P = bed.pageId;
  let sectionId: string | null = null;
  try {
    sectionId = await sealRisksAsGabi(P);
    const rq = await call("request-section-edit", { sectionId, reason: "need to add a risk" }, MIHAI);
    expect(rq?.success, `Mihai asks (${JSON.stringify(rq).slice(0, 120)})`).toBe(true);
    const mine0 = await call("list-my-requests", {}, MIHAI);
    console.log("### my requests (pending):", JSON.stringify(mine0));
    expect((mine0?.requests || []).find((r: any) => r.id === sectionId)?.status, "the requester's own list shows it pending").toBe("pending");

    const dn = await call("deny-section-edit", { sectionId, requesterAccountId: MIHAI, reason: "not during the freeze" }, GABI);
    expect(dn?.success, `Gabriela declines with a word (${JSON.stringify(dn).slice(0, 120)})`).toBe(true);
    const rec = await getKvs(`section-edit-request-${sectionId}-${MIHAI}`);
    console.log("### request record:", JSON.stringify(rec));
    expect(rec?.status).toBe("denied");
    expect(rec?.deniedReason, "the owner's word is on the record").toBe("not during the freeze");

    const st = await call("check-section-edit", { sectionId }, MIHAI);
    console.log("### status for Mihai:", JSON.stringify(st));
    expect(st?.status).toBe("denied");
    expect(st?.retryAt, "the status carries when he may ask again").toBeTruthy();
    expect(st?.deniedReason).toBe("not during the freeze");

    const again = await call("request-section-edit", { sectionId, reason: "please" }, MIHAI);
    console.log("### asking again:", JSON.stringify(again));
    expect(again?.success).toBe(false);
    expect(again?.retryAt, "the refusal carries retryAt for the surface to format").toBeTruthy();
    expect(again?.reason, "…and no UTC / ISO stamp in the sentence").not.toMatch(/UTC|\d{4}-\d{2}-\d{2}/);

    const sum = await call("page-details-summary", { pageId: P }, MIHAI);
    const row = (sum?.seals || []).find((r: any) => r.id === sectionId);
    console.log("### modal row for Mihai:", JSON.stringify({ myEditStatus: row?.myEditStatus, myRetryAt: row?.myRetryAt, myDeniedReason: row?.myDeniedReason }));
    expect(row?.myEditStatus).toBe("denied");
    expect(row?.myDeniedReason, "the modal row carries the owner's word").toBe("not during the freeze");

    const rs = await call("ribbon-summary", { pageId: P }, MIHAI);
    console.log("### ribbon lockedFor:", JSON.stringify(rs?.lockedFor));
    expect(rs?.lockedFor?.myRequest, "the ribbon's seal is in the declined state").toBe("denied");
    expect(rs?.lockedFor?.retryAt).toBeTruthy();
    expect(rs?.lockedFor?.deniedReason).toBe("not during the freeze");

    const mine1 = await call("list-my-requests", {}, MIHAI);
    const meRow = (mine1?.requests || []).find((r: any) => r.id === sectionId);
    console.log("### my requests (declined):", JSON.stringify(meRow));
    expect(meRow?.status).toBe("denied");
    expect(meRow?.deniedReason).toBe("not during the freeze");
    expect(meRow?.retryAt).toBeTruthy();
    expect(meRow?.name).toBe("Risks");

    // a direct grant turns the same row into "granted" with the grant's expiry
    const g = await call("grant-section-edit", { sectionId, editorAccountId: MIHAI }, GABI);
    expect(g?.success, `grant (${JSON.stringify(g).slice(0, 120)})`).toBe(true);
    const mine2 = await call("list-my-requests", {}, MIHAI);
    const gRow = (mine2?.requests || []).find((r: any) => r.id === sectionId);
    console.log("### my requests (granted):", JSON.stringify(gRow));
    expect(gRow?.status).toBe("granted");
    expect(gRow?.expiresAt).toBeTruthy();
    expect(gRow?.name, "a grant still names the section (the index row carries it)").toBe("Risks");
    expect(gRow?.pageId).toBe(P);
  } finally {
    if (sectionId) await call("unseal-section", { sectionId }, GABI).catch(() => {});
    await bed.restore();
  }
});

test("SEC-8 browser: the requester sees Declined · ask again W on the ribbon and the row, the owner's Decline asks for a word, My work lists it", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const bed = await setupWorkflowPage("sec8-browser", { body: BODY });
  const P = bed.pageId;
  let sectionId: string | null = null;
  let mineId: string | null = null;
  try {
    sectionId = await sealRisksAsGabi(P);
    // Mihai's own seal on Decisions, with a pending request from Gabriela — for the owner's Decline bar.
    const hs = await call("list-page-headings", { pageId: P }, MIHAI);
    const dec = (hs?.headings || []).find((h: any) => h.text === "Decisions");
    const sM = await call("seal-section", { pageId: P, headingIndex: dec.index, headingText: "Decisions", lockDuration: 2 * 86400 }, MIHAI);
    expect(sM?.success).toBe(true);
    mineId = sM.sectionId;
    const rqG = await call("request-section-edit", { sectionId: mineId, reason: "one typo" }, GABI);
    expect(rqG?.success).toBe(true);
    // Mihai asks on Risks; Gabriela declines with a word.
    const rq = await call("request-section-edit", { sectionId, reason: "need to add a risk" }, MIHAI);
    expect(rq?.success).toBe(true);
    const dn = await call("deny-section-edit", { sectionId, requesterAccountId: MIHAI, reason: "not during the freeze" }, GABI);
    expect(dn?.success).toBe(true);

    // ── the ribbon: a Declined pill with the retry clock, the owner's word, no Request edit ────
    const r = await loadPage(page, P);
    expect(r, "ribbon renders").toBeTruthy();
    const pill = r!.frame.locator('[data-testid="ribbon-pill"]');
    await expect(pill).toHaveText(new RegExp(`^Declined · ask again ${CLOCK}$`), { timeout: 20_000 });
    const sentence = norm(await r!.frame.locator('[data-testid="ribbon-status"]').innerText());
    console.log("### ribbon:", await pill.innerText(), "|", sentence);
    expect(sentence).toMatch(/was declined by Gabriela Perdum: “not during the freeze”/);
    await expect(r!.frame.locator('[data-testid="ribbon-request-edit"]'), "no Request edit while declined").toHaveCount(0);
    await shotRibbon(page, r!.el, `${OUT}/01-ribbon-declined.png`);

    // ── the modal: Risks row is a Declined state; Decisions row's Decline opens a reason bar ──
    const app = await openDetailsModal(page);
    const risks = app.locator('[data-testid="pd-seal-row"][data-kind="section"]', { hasText: "Risks" });
    await expect(risks).toBeVisible({ timeout: 20_000 });
    const primary = risks.locator('[data-testid="pd-primary"]');
    await expect(primary).toHaveAttribute("data-action", "declined");
    await expect(primary).toHaveText(new RegExp(`^Declined · ask again ${CLOCK}$`));
    expect(await primary.getAttribute("title"), "the owner's word is on the state").toContain("not during the freeze");
    const decisions = app.locator('[data-testid="pd-seal-row"][data-kind="section"]', { hasText: "Decisions" });
    await expect(decisions.locator('[data-testid="pd-decline"]')).toBeVisible();
    await page.screenshot({ path: `${OUT}/02-modal-declined-row.png` });
    await app.locator("html").evaluate((h: any) => h.setAttribute("data-color-mode", "dark"));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/02b-modal-declined-row-dark.png` });
    await app.locator("html").evaluate((h: any) => h.setAttribute("data-color-mode", "light"));
    await decisions.locator('[data-testid="pd-decline"]').click();
    const bar = decisions.locator('[data-testid="pd-reason-bar"]');
    await expect(bar, "Decline opens the optional-reason bar").toBeVisible();
    await bar.locator('[data-testid="pd-reason-input"]').fill("fix it after Friday");
    await page.screenshot({ path: `${OUT}/03-modal-decline-reason.png` });
    await bar.locator('[data-testid="pd-reason-confirm"]').click();
    await expect.poll(async () => (await getKvs(`section-edit-request-${mineId}-${GABI}`))?.deniedReason, { timeout: 30_000 }).toBe("fix it after Friday");
    await app.locator('[data-testid="pd-close"]').click();

    // ── My work: "Your edit requests" lists Mihai's declined request with the word and the clock ─
    const T = getTarget("sentinel-my-work");
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    await enterForgeSurface(page, { surface: "custom", readySelector: '[data-testid="mw-page"]', timeout: 60_000 }).catch(() => {});
    // My work renders in one of several hosted-resources iframes; find the frame by its content (skill trap 2026-09-20).
    let mw: any = null;
    await expect.poll(async () => {
      const ifr = page.locator("iframe");
      const n = await ifr.count();
      for (let i = 0; i < n; i++) {
        const f = ifr.nth(i).contentFrame();
        if ((await f.locator('[data-testid="mw-my-request-row"]').count().catch(() => 0)) > 0) { mw = f; return true; }
      }
      return false;
    }, { timeout: 90_000, message: "My work rendered with my requests" }).toBe(true);
    const card = mw.locator('[data-testid="mw-my-requests"]');
    await expect(card).toBeVisible({ timeout: 30_000 });
    const row = card.locator('[data-testid="mw-my-request-row"]', { hasText: "Risks" });
    await expect(row, "my declined request is listed").toBeVisible({ timeout: 30_000 });
    const line = norm(await row.locator('[data-testid="mw-my-request-line"]').innerText());
    console.log("### My work row:", line);
    expect(line).toMatch(new RegExp(`^Declined: “not during the freeze” · ask again ${CLOCK}`));
    await expect(row.locator('[data-testid="mw-my-request-state"]')).toHaveText("Declined");
    await card.scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: `${OUT}/04-my-work-your-requests.png` });
  } finally {
    if (sectionId) await call("unseal-section", { sectionId }, GABI).catch(() => {});
    if (mineId) await call("unseal-section", { sectionId: mineId }, MIHAI).catch(() => {});
    await bed.restore();
  }
});
