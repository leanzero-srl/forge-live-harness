// A7 (ledger #55) — the cross-space "My work" global page. Comala's Document Report filters to
// "my pending approvals"; ours had the same answers scattered over each space's console and each
// page's panel. One page composes three caller-scoped resolvers: approvals waiting on me, edit
// requests on files I hold sealed, and the files I hold sealed. Proven in the REAL page: a seeded
// approval and a seeded edit request render with their titles, Approve on the approval moves the
// page's record, the page link navigates the TOP window (router.navigate, not a dropped
// target=_top), and the fixture seal Mihai owns is listed.
// P1-3 (UX review 2026-09-14, 2026-09-15): the page is now the HUB — a seeded SECTION edit request on a
// section Mihai holds sealed is listed and approved from here (grant written), the header total from
// count-my-work reflects it and drops with the decisions, and a lister that FAILS renders an error
// with Retry (intercepted at the Forge invoke), never the "nothing waiting" copy.
// @covers resolver:list-my-edit-requests resolver:list-my-section-edit-requests resolver:approve-section-edit resolver:count-my-work resolver:enumerate-operator-seals resolver:approve-edit-request manifest:confluence:globalPage:my-work
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { enterForgeSurface } from "../../forge/frame";
import { BASE_URL } from "../../config/env";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage, purgePage } from "../../data/confluence.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";
import { mkdirSync } from "node:fs";

const T = getTarget("sentinel-my-work");
const SPACE = process.env.SENTINEL_SPACE_KEY || "WFH";
const ATT = process.env.SV_ATTACHMENT_ID || "att265945089"; // fixture seal, owned by Mihai
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const GABI = "712020:2b9d007d-db0d-47c9-b4ae-953f55501f55";
const REQUESTER = "sv-aql-mywork-req";
const SECTION = `sv-aql-mywork-sec-${Date.now()}`;
const OUT = "/tmp/sv-my-work";
const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const queryKvs = async (prefix: string): Promise<string[]> => (await getTestState("sentinel-vault", { what: "query", prefix })).keys || [];
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });

test.describe.configure({ timeout: 300_000, retries: 1 });

test("My work lists my approvals, edit requests and seals across spaces; Approve works from the page", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const seal = await getKvs(`protection-${ATT}`);
  expect(seal?.lockedBy, `fixture seal protection-${ATT} owned by Mihai (run npm run ensure-fixture)`).toBe(MIHAI);
  const spaceId = await spaceIdByKey(SPACE);
  const p = await createPage({ spaceId, title: `HARNESS sv-my-work ${Date.now()}`, adf: doc(heading("Mine", 2), paragraph("my work seed")) });
  await delKvs(`edit-request-${ATT}-${GABI}`).catch(() => {});
  try {
    // P1-3 seed: a section Mihai holds sealed on the seeded page, and Gabriela asking to edit it.
    await setKvs(`section-protection-${SECTION}`, {
      sectionId: SECTION, lockedBy: MIHAI, sectionTitle: "Quarterly totals", pageId: p.id, spaceKey: SPACE,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    });
    const sr = await inv("requestSectionEdit", { section: SECTION, actor: GABI, reason: "Need to fix the section totals" });
    expect(sr.result?.success, `Gabriela's SECTION edit request lands (got ${JSON.stringify(sr.result)})`).toBe(true);
    expect(await getKvs(`sectionreq-owner-${MIHAI}-${SECTION}-${GABI}`), "the section owner index row is written with the request").toBeTruthy();
    // Seed: an approval waiting on Mihai, and Gabriela asking to edit Mihai's sealed fixture file.
    await inv("assignWorkflow", { pageId: p.id, spaceKey: SPACE, workflowId: "default", actor: REQUESTER });
    await inv("transitionWorkflow", { pageId: p.id, spaceKey: SPACE, to: "in_review", actor: REQUESTER });
    const ra = await inv("requestApproval", { pageId: p.id, spaceKey: SPACE, to: "approved", toName: "Approved", approvers: MIHAI, mode: "any", actor: REQUESTER });
    expect(ra.result?.pending, `approval requested (got ${JSON.stringify(ra.result)})`).toBe(true);
    const er = await inv("requestEditAccess", { att: ATT, reason: "Need to fix the totals", actor: GABI });
    expect(er.result?.success, `Gabriela's edit request lands (got ${JSON.stringify(er.result)})`).toBe(true);
    // Both inboxes read a per-caller INDEX prefix (eventually consistent) and confirm by key —
    // wait until the seeded rows are visible to the queries before loading the page, or the
    // first render can legitimately say "nothing waiting" (flaked once in sv-it66-final).
    for (let i = 0; i < 10; i++) {
      const a = ((await inv("listMyApprovals", { actor: MIHAI })).result?.approvals || []) as any[];
      const e = ((await inv("listMyEditRequests", { actor: MIHAI })).result?.requests || []) as any[];
      if (a.some((x) => String(x.pageId) === String(p.id)) && e.some((x) => x.requesterAccountId === GABI)) break;
      await new Promise((r) => setTimeout(r, 1500));
    }

    // The section index has no hook lister to poll; the prefix query is eventually consistent, so
    // the page is (re)opened until the row is there — bounded.
    let app: any = null;
    let secRow: any = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
      const s = await enterForgeSurface(page, { surface: "custom", readySelector: '[data-testid="mw-page"]', timeout: 60000 });
      app = (s as any).frame;
      await expect(app.locator('[data-testid="mw-page"]')).toBeVisible({ timeout: 30000 });
      secRow = app.locator('[data-testid="mw-section-request-row"]', { hasText: "Need to fix the section totals" });
      if (await secRow.waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false)) break;
    }

    // Approvals waiting on me — the seeded page, by title.
    const inbox = app.locator('[data-testid="wf-inbox"]');
    await expect(inbox, "the approvals inbox renders with items").toBeVisible({ timeout: 30000 });
    const mine = inbox.locator(".wf-inbox-row", { hasText: p.title });
    await expect(mine, "the seeded approval is listed by page title").toBeVisible();

    // Edit requests on my sealed files — Gabriela's, with her reason.
    const reqRow = app.locator('[data-testid="mw-request-row"]', { hasText: "Need to fix the totals" });
    await expect(reqRow, "Gabriela's edit request is listed with her reason").toBeVisible({ timeout: 20000 });
    expect((await reqRow.innerText()).toLowerCase(), "…naming the file").toContain((seal.attachmentName || "").toLowerCase().slice(0, 12));

    // P1-3: the section request, with its reason, section title and page link.
    await expect(secRow, "Gabriela's SECTION edit request is listed with her reason").toBeVisible({ timeout: 20000 });
    expect(await secRow.innerText(), "…naming the section").toContain("Quarterly totals");
    await expect(secRow.locator("a", { hasText: "this page" }), "…with a link to the page").toBeVisible();
    // F11: the time, not only the date.
    expect(await secRow.innerText(), "the row shows the time of the request (F11)").toMatch(/Asked .*\d{1,2}:\d{2}/);
    // count-my-work: the header total counts the approval, the file request and the section request.
    const totalEl = app.locator('[data-testid="mw-total"]');
    await expect(totalEl, "the header total renders").toBeVisible({ timeout: 20000 });
    const totalBefore = Number(await totalEl.getAttribute("data-total"));
    expect(totalBefore, "count-my-work counts at least the three seeded items").toBeGreaterThanOrEqual(3);
    // Mihai is a site admin on wolfaenpak: the access-requests card applies to him (rendered, empty or
    // not); a plain user would not see it at all.
    await expect(app.locator('[data-testid="mw-access-requests"]'), "the space-admin access requests card renders for a site admin").toBeVisible({ timeout: 30000 });
    console.log(`### P1-3: section request row ✓, header total ${totalBefore} ✓, access card ✓`);

    // Files I hold sealed — the fixture seal.
    const seals = app.locator('[data-testid="mw-seals"]');
    await expect(seals.locator('[data-testid="mw-seal-row"]').first(), "at least one sealed file is listed").toBeVisible({ timeout: 30000 });
    const sealRows = await seals.locator('[data-testid="mw-seal-row"]').allInnerTexts();
    expect(sealRows.some((t: string) => t.toLowerCase().includes((seal.attachmentName || "").toLowerCase().slice(0, 12))), `the fixture file is among them (${sealRows.length} rows)`).toBe(true);
    await page.screenshot({ path: `${OUT}/1-my-work.png`, fullPage: true });
    console.log(`### My work: inbox row ✓, request row ✓, ${sealRows.length} seal row(s) ✓`);

    // Approve the edit request from the page → grant exists, row gone.
    await reqRow.getByRole("button", { name: /^Approve/ }).click();
    await expect(reqRow, "the request row leaves the list once approved").toBeHidden({ timeout: 20000 });
    let grant: any = null;
    for (let i = 0; i < 8 && !grant; i++) { grant = await getKvs(`edit-grant-${ATT}-${GABI}`); if (!grant) await page.waitForTimeout(1500); }
    expect(grant, "an edit grant was written for Gabriela").toBeTruthy();
    console.log("### edit request approved from My work ✓ (grant written)");

    // P1-3: approve the SECTION request from the page → section grant exists, index row gone, total drops.
    await secRow.getByRole("button", { name: /^Approve/ }).click();
    await expect(secRow, "the section request row leaves the list once approved").toBeHidden({ timeout: 20000 });
    let sgrant: any = null;
    for (let i = 0; i < 8 && !sgrant; i++) { sgrant = await getKvs(`section-edit-grant-${SECTION}-${GABI}`); if (!sgrant) await page.waitForTimeout(1500); }
    expect(sgrant?.editorAccountId, "a section edit grant was written for Gabriela").toBe(GABI);
    expect(await getKvs(`section-edit-request-${SECTION}-${GABI}`), "the section request is consumed").toBeFalsy();
    expect(await getKvs(`sectionreq-owner-${MIHAI}-${SECTION}-${GABI}`), "the section owner index row is dropped with it").toBeFalsy();
    await expect.poll(async () => Number(await totalEl.getAttribute("data-total")), { timeout: 20000, message: "the header total drops by two after the two decisions" }).toBe(totalBefore - 2);
    console.log("### section edit request approved from My work ✓ (grant written, index dropped, total recounted)");

    // Approve the workflow approval from the page → the record moves to Approved.
    await mine.getByRole("button", { name: /^Approve/ }).click();
    let rec: any = null;
    for (let i = 0; i < 10; i++) { rec = await getKvs(`workflow-state-${p.id}`); if (rec?.stateId === "approved") break; await page.waitForTimeout(1500); }
    expect(rec?.stateId, "the page is Approved after the inbox decision").toBe("approved");
    console.log("### approval decided from My work ✓");

    // The page link navigates the TOP window (router.navigate from the sandboxed iframe).
    const link = app.locator('[data-testid="mw-seal-row"] a.mw-link').first();
    await link.click();
    await page.waitForURL((u) => !u.pathname.includes("/apps/"), { timeout: 20000 });
    console.log("### seal page link navigated the top window ✓", page.url().slice(0, 100));
  } finally {
    for (const k of [`workflow-state-${p.id}`, `workflow-pending-${p.id}`, `workflow-autoassigned-${p.id}`, `workflow-inbox-${MIHAI}-${p.id}`,
      `workflow-idx-${SPACE}-draft-${p.id}`, `workflow-idx-${SPACE}-in_review-${p.id}`, `workflow-idx-${SPACE}-approved-${p.id}`,
      `edit-request-${ATT}-${GABI}`, `edit-grant-${ATT}-${GABI}`,
      `section-protection-${SECTION}`, `section-edit-request-${SECTION}-${GABI}`, `section-edit-grant-${SECTION}-${GABI}`, `sectionreq-owner-${MIHAI}-${SECTION}-${GABI}`]) await delKvs(k).catch(() => {});
    for (const prefix of [`workflow-log-${p.id}-`, `workflow-approval-${p.id}-`, `activity-page-${p.id}-`]) for (const k of await queryKvs(prefix).catch(() => [] as string[])) await delKvs(k).catch(() => {});
    await deletePage(p.id).catch(() => {}); await purgePage(p.id).catch(() => {});
  }
});

// P1-3 / review §6: a lister that fails must render an ERROR with Retry — not "Nothing is waiting".
// The section lister's Forge invoke is aborted at the network (its POST body carries the function
// key), the card must show the error state, and Retry with the intercept lifted must load the list.
test("a failed lister renders an error with Retry, never the empty copy", async ({ page }) => {
  let aborted = 0;
  let intercept = true;
  await page.route("**/*", async (route) => {
    const req = route.request();
    const pd = req.method() === "POST" ? (req.postData() || "") : "";
    if (intercept && pd.includes("list-my-section-edit-requests")) { aborted++; return route.abort("failed"); }
    return route.continue();
  });
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  const s = await enterForgeSurface(page, { surface: "custom", readySelector: '[data-testid="mw-page"]', timeout: 60000 });
  const app = (s as any).frame;
  const card = app.locator('[data-testid="mw-section-requests"]');
  await expect(card.locator('[data-testid="mw-section-requests-error"]'), "the section card shows the ERROR state").toBeVisible({ timeout: 30000 });
  expect(aborted, "the list-my-section-edit-requests invoke was intercepted").toBeGreaterThan(0);
  await expect(card.locator('[data-testid="mw-section-requests-empty"]'), "…and NOT the empty copy").toHaveCount(0);
  expect(await card.innerText(), "the error names the truth").toMatch(/could not load/i);
  // Retry with the failure gone loads the list (empty or not — the card leaves the error state).
  intercept = false;
  await card.locator('[data-testid="mw-section-requests-error-retry"]').click();
  await expect(card.locator('[data-testid="mw-section-requests-error"]'), "Retry clears the error state").toBeHidden({ timeout: 30000 });
  // The hosted-resources iframe can be re-indexed while the page re-fetches (the first run proved the
  // list rendered while `.nth(3)` pointed elsewhere) — find the frame by its content, not its index.
  const listCount = async () => {
    for (const f of page.frames()) {
      if (!(await f.locator('[data-testid="mw-page"]').count().catch(() => 0))) continue;
      return f.locator('[data-testid="mw-section-requests-empty"], [data-testid="mw-section-request-row"]').count().catch(() => 0);
    }
    return 0;
  };
  await expect.poll(listCount, { timeout: 30000, message: "…and the list renders (empty copy or rows)" }).toBeGreaterThan(0);
  await page.unroute("**/*");
  console.log(`### P1-3 error state: ${aborted} invoke(s) aborted → error+Retry shown, Retry recovered ✓`);
});
