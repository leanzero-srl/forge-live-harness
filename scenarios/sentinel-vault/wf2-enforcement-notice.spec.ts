// WF-2 (UX critique 2026-09-19): a non-approver's edit to an Approved page was demoted (or reverted) and
// the editor was told NOTHING on the page — collectWorkflowEnforcementForPage recorded an activity row but
// no dispatch (recent-dispatches for the editor: []), and the only channel, the page comment, went through
// the opt-in master gate (so a site that never opted in told the editor nothing at all). The copy said
// "verified by structural compare" and "request a transition out of Approved".
// After the fix: every workflow enforcement records a dispatch (workflow-demoted / workflow-reverted) with
// the editor and the approver as parties, the comment rides the editor_revert carve-out (posted with the
// master OFF), and the ribbon says what happened in user words with "See my version (vN)" on a revert.
// SERVER test: the real demote path (enforceDecision as Gabriela) with the comment master switched OFF.
// BROWSER test: the editor-side ribbon for both modes, from seeded dispatches (the harness identity is a
// site admin and therefore privileged — it cannot author a non-privileged edit itself).
import { test, expect } from "../../fixtures/forge";
import { mkdirSync } from "node:fs";
import { setupWorkflowPage, loadPage, shotRibbon, inv, getKvs, setKvs, delKvs, strip, norm, SPACE, MIHAI, GABI } from "./_wf";
// @ts-ignore
import { getComments } from "../../data/confluence.mjs";

const OUT = process.env.OUT_DIR || "evidence/wf2-enforcement-notice";
test.describe.configure({ timeout: 600_000 });
// Every real wolfaenpak account is a steward (privileged for enforcement) — the non-approver editor
// has to be synthetic, as the critique's walk did. The dispatch feed is read from its KVS key, which
// is exactly what recent-dispatches reads before filtering by the caller.
const EDITOR = "sv-wf2-editor";

async function approveAt1(P: string) {
  const t1 = await inv("transitionWorkflow", { pageId: P, spaceKey: SPACE, to: "in_review", actor: GABI, actorName: "Gabriela Perdum" });
  expect(t1.result?.success, "to in_review").toBe(true);
  const t2 = await inv("transitionWorkflow", { pageId: P, spaceKey: SPACE, to: "approved", actor: MIHAI, actorName: "Mihai Perdum", approvers: MIHAI, approvedVersion: "1" });
  expect(t2.result?.success, `to approved (${JSON.stringify(t2.result).slice(0, 120)})`).toBe(true);
  const st = await getKvs(`workflow-state-${P}`);
  expect(st?.enforce && st?.approvedVersion === 1, "enforced at v1").toBe(true);
}

test("WF-2 server: a demoted editor gets a dispatch and a comment even with the comment master OFF", async () => {
  const bed = await setupWorkflowPage("wf2-demote-server", { enforceMode: "demote" });
  const P = bed.pageId;
  const originalGlobal = (await getKvs("admin-settings-global")) || null;
  const originalNotifs = await getKvs("recent-notifications");
  try {
    // The comment master OFF (the app default since 4.7); the editor carve-out at its default (on).
    await setKvs("admin-settings-global", { ...(originalGlobal || {}), enableEmailDispatches: false, enableConfluenceDispatches: false, enablePageBanners: true });
    await approveAt1(P);
    const dec = await inv("enforceDecision", { pageId: P, actor: EDITOR, eventVersion: "2" });
    console.log("### enforceDecision:", JSON.stringify(dec.result));
    expect(dec.result?.action, "the editor's edit is demoted").toBe("demote");
    expect((await getKvs(`workflow-state-${P}`))?.stateId, "the page is back in Draft").toBe("draft");
    const feed = (await getKvs("recent-notifications"))?.events || [];
    const mine = feed.filter((n: any) => n.pageId === P && (n.editorAccountId === EDITOR || n.ownerAccountId === EDITOR));
    console.log("### dispatches for the editor:", JSON.stringify(mine));
    expect(mine.length, "the editor has a dispatch for this page").toBeGreaterThan(0);
    expect.soft(mine[0]?.type, "…of the workflow-demoted kind").toBe("workflow-demoted");
    expect.soft(mine[0]?.editorAccountId, "…naming the editor").toBe(EDITOR);
    expect.soft(mine[0]?.ownerAccountId, "…and the approver as the other party").toBe(MIHAI);
    const bodies = (await getComments(P)).map((c: any) => strip(c.body?.storage?.value || ""));
    console.log("### comments:", JSON.stringify(bodies));
    const notice = bodies.find((b: string) => /Moved back to Draft/i.test(b)) || "";
    expect(notice, "the editor's comment is posted despite the master being off (editor_revert carve-out)").toBeTruthy();
    expect.soft(notice).not.toMatch(/structural compare|transition/i);
    expect.soft(notice).toMatch(/Nothing was lost|still on the page/i);
  } finally {
    if (originalGlobal) await setKvs("admin-settings-global", originalGlobal); else await delKvs("admin-settings-global").catch(() => {});
    if (originalNotifs) await setKvs("recent-notifications", originalNotifs); else await delKvs("recent-notifications").catch(() => {});
    await bed.restore();
  }
});

test("WF-2 browser: the editor's ribbon says the edit was moved back / reverted, with the version link", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const bed = await setupWorkflowPage("wf2-ribbon", { enforceMode: "revert" });
  const P = bed.pageId;
  const originalNotifs = await getKvs("recent-notifications");
  try {
    await approveAt1(P);
    const base = { pageId: P, ownerAccountId: GABI, editorAccountId: MIHAI, approvedVersion: 1, timestamp: new Date().toISOString() };
    // 1. Revert: the editor's text lives at v2, the app wrote v3.
    await setKvs("recent-notifications", { events: [{ ...base, id: `wf2-rev-${Date.now()}`, type: "workflow-reverted", revertedVersion: 2 }] });
    let r = await loadPage(page, P);
    expect(r, "ribbon renders").toBeTruthy();
    const pill = r!.frame.locator('[data-testid="ribbon-pill"]');
    await expect(pill).toContainText("Restored", { timeout: 20_000 });
    const s1 = norm(await r!.frame.locator('[data-testid="ribbon-status"]').innerText());
    console.log("### revert sentence:", s1);
    expect(s1).toMatch(/Your edit to this Approved page was reverted to the approved version \(v1\)/);
    await expect(r!.frame.locator('[data-testid="ribbon-my-version"]'), "See my version link").toHaveText("See my version (v2)");
    await shotRibbon(page, r!.el, `${OUT}/01-ribbon-reverted.png`, 20);
    // 2. Demote: nothing lost, the page went back to Draft.
    await setKvs("recent-notifications", { events: [{ ...base, id: `wf2-dem-${Date.now()}`, type: "workflow-demoted", demotedToName: "Draft", driftedVersion: 2 }] });
    r = await loadPage(page, P);
    await expect(r!.frame.locator('[data-testid="ribbon-pill"]')).toContainText("Moved back", { timeout: 20_000 });
    const s2 = norm(await r!.frame.locator('[data-testid="ribbon-status"]').innerText());
    console.log("### demote sentence:", s2);
    expect(s2).toMatch(/Your edit to this Approved page moved it back to Draft for a new review/);
    expect(s2).toMatch(/Nothing was lost/);
    await shotRibbon(page, r!.el, `${OUT}/02-ribbon-demoted.png`, 20);
  } finally {
    if (originalNotifs) await setKvs("recent-notifications", originalNotifs); else await delKvs("recent-notifications").catch(() => {});
    await bed.restore();
  }
});
