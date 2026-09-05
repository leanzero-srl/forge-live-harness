// A7 (ledger #55) — the cross-space "My work" global page. Comala's Document Report filters to
// "my pending approvals"; ours had the same answers scattered over each space's console and each
// page's panel. One page composes three caller-scoped resolvers: approvals waiting on me, edit
// requests on files I hold sealed, and the files I hold sealed. Proven in the REAL page: a seeded
// approval and a seeded edit request render with their titles, Approve on the approval moves the
// page's record, the page link navigates the TOP window (router.navigate, not a dropped
// target=_top), and the fixture seal Mihai owns is listed.
// @covers resolver:list-my-edit-requests resolver:enumerate-operator-seals resolver:approve-edit-request manifest:confluence:globalPage:my-work
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
const OUT = "/tmp/sv-my-work";
const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
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

    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    const s = await enterForgeSurface(page, { surface: "custom", readySelector: '[data-testid="mw-page"]', timeout: 60000 });
    const app = (s as any).frame;
    await expect(app.locator('[data-testid="mw-page"]')).toBeVisible({ timeout: 30000 });

    // Approvals waiting on me — the seeded page, by title.
    const inbox = app.locator('[data-testid="wf-inbox"]');
    await expect(inbox, "the approvals inbox renders with items").toBeVisible({ timeout: 30000 });
    const mine = inbox.locator(".wf-inbox-row", { hasText: p.title });
    await expect(mine, "the seeded approval is listed by page title").toBeVisible();

    // Edit requests on my sealed files — Gabriela's, with her reason.
    const reqRow = app.locator('[data-testid="mw-request-row"]', { hasText: "Need to fix the totals" });
    await expect(reqRow, "Gabriela's edit request is listed with her reason").toBeVisible({ timeout: 20000 });
    expect((await reqRow.innerText()).toLowerCase(), "…naming the file").toContain((seal.attachmentName || "").toLowerCase().slice(0, 12));

    // Files I hold sealed — the fixture seal.
    const seals = app.locator('[data-testid="mw-seals"]');
    await expect(seals.locator('[data-testid="mw-seal-row"]').first(), "at least one sealed file is listed").toBeVisible({ timeout: 30000 });
    const sealRows = await seals.locator('[data-testid="mw-seal-row"]').allInnerTexts();
    expect(sealRows.some((t) => t.toLowerCase().includes((seal.attachmentName || "").toLowerCase().slice(0, 12))), `the fixture file is among them (${sealRows.length} rows)`).toBe(true);
    await page.screenshot({ path: `${OUT}/1-my-work.png`, fullPage: true });
    console.log(`### My work: inbox row ✓, request row ✓, ${sealRows.length} seal row(s) ✓`);

    // Approve the edit request from the page → grant exists, row gone.
    await reqRow.getByRole("button", { name: /^Approve/ }).click();
    await expect(reqRow, "the request row leaves the list once approved").toBeHidden({ timeout: 20000 });
    let grant: any = null;
    for (let i = 0; i < 8 && !grant; i++) { grant = await getKvs(`edit-grant-${ATT}-${GABI}`); if (!grant) await page.waitForTimeout(1500); }
    expect(grant, "an edit grant was written for Gabriela").toBeTruthy();
    console.log("### edit request approved from My work ✓ (grant written)");

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
      `edit-request-${ATT}-${GABI}`, `edit-grant-${ATT}-${GABI}`]) await delKvs(k).catch(() => {});
    for (const prefix of [`workflow-log-${p.id}-`, `workflow-approval-${p.id}-`, `activity-page-${p.id}-`]) for (const k of await queryKvs(prefix).catch(() => [] as string[])) await delKvs(k).catch(() => {});
    await deletePage(p.id).catch(() => {}); await purgePage(p.id).catch(() => {});
  }
});
