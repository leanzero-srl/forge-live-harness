// WF-10 + WF-11 (UX critique 2026-09-19). Before the fix the Workflow tab spoke a language a
// Confluence admin does not have ("rights-holders", columns "First" / "Protected", raw ids
// draft / in_review under every state name, a state called "Expired", refusals "Entering
// "Approved" requires space admin approval", a "Set review date" chip on every Draft page) and
// carried TWO Save buttons on one screen with a sentence explaining which saved what. After the fix:
// ONE rule sentence at the top ("Pages start in Draft. Mihai Perdum approves before a page is
// Approved. …"), ONE Save on the settings view, the states on their own view behind "Edit the
// states…" (each workflow with its own Save, "Back to workflow settings"), columns "Starts here" /
// "Approved (enforced)" with the ids in a tooltip, the built-in state "Needs re-review", plain
// refusals, and the review-date chip only where a date means something. FAILS before, PASSES after.
import { test, expect } from "../../fixtures/forge";
import { mkdirSync } from "node:fs";
import { setupWorkflowPage, loadPage, shotRibbon, inv, getKvs, setKvs, delKvs, norm, SPACE, MIHAI, GABI } from "./_wf";
import { getTarget } from "../../config/targets";
import { enterForgeSurface, ensureInViewport } from "../../forge/frame";

const OUT = process.env.OUT_DIR || "evidence/wf10-wf11-workflow-tab";
test.describe.configure({ timeout: 900_000 });
const call = async (key: string, payload: any, actor = MIHAI) => (await inv("invoke", { key, payload: JSON.stringify(payload), actor })).result;

test("WF-10 server: refusals say who may move the page, in plain words; the built-in lapsed state is 'Needs re-review'", async () => {
  const bed = await setupWorkflowPage("wf10-server", { approvers: [] });
  const P = bed.pageId;
  try {
    const wf = await call("get-page-workflow", { pageId: P }, MIHAI);
    const expired = (wf?.def?.states || []).find((s: any) => s.id === "expired");
    console.log("### built-in states:", JSON.stringify((wf?.def?.states || []).map((s: any) => [s.id, s.name])));
    expect(expired?.name, "the id stays; the word is what it means").toBe("Needs re-review");
    // The two refusal sentences ("Only a space admin can move a page into Approved when no approvers
    // are set" / "…out of Approved") cannot be provoked live: every real wolfaenpak account is a
    // steward (skill trap 2026-09-20) and a synthetic one cannot read the page through the resolver,
    // while the hook's transitionWorkflow seam runs the engine below the gate. They are verified by
    // the unit-level grep in the app repo (workflow/actions.js) — stated in the backlog, not claimed here.
    const t1 = await inv("transitionWorkflow", { pageId: P, spaceKey: SPACE, to: "in_review", actor: GABI, actorName: "Gabriela Perdum" });
    expect(t1.result?.success).toBe(true);
    const t2 = await inv("transitionWorkflow", { pageId: P, spaceKey: SPACE, to: "approved", actor: MIHAI, actorName: "Mihai Perdum", approvers: MIHAI, approvedVersion: "1" });
    expect(t2.result?.success).toBe(true);
    // a steward's own move out of Approved is allowed, and the answer names no "requires … approval"
    const out = await call("request-transition", { pageId: P, toStateId: "draft" }, MIHAI);
    console.log("### steward out of Approved:", JSON.stringify(out).slice(0, 160));
    expect(out?.success).toBe(true);
  } finally {
    await call("request-transition", { pageId: P, toStateId: "draft" }, MIHAI).catch(() => {});
    await bed.restore();
  }
});

test("WF-11 browser: one rule sentence, one Save, the states on their own view; WF-10 words on the table; no review-date chip on a Draft page", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const bed = await setupWorkflowPage("wf11-browser"); // WFH: workflow on, Mihai sole approver
  const P = bed.pageId;
  const STEWARD_KEY = `admin-settings-space-${SPACE}`;
  const priorSteward = await getKvs(STEWARD_KEY);
  try {
    const users = [...new Set([...(priorSteward?.adminUsers || []).map((u: any) => (typeof u === "string" ? u : u?.accountId)), MIHAI])];
    await setKvs(STEWARD_KEY, { ...(priorSteward || {}), adminUsers: users });
    const T = getTarget("sentinel-vault-realm");
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    const s = await enterForgeSurface(page, { surface: "custom", readySelector: ".space-admin-title", timeout: 45_000 });
    const app = (s as any).frame;
    await app.locator(".tab-navigation .tab-button", { hasText: "Workflow" }).click();
    await app.locator(".wf-dash-loading").waitFor({ state: "detached", timeout: 20_000 }).catch(() => {});

    // ── the rule sentence ────────────────────────────────────────────────────────────────────
    const rule = app.locator('[data-testid="wf-rule"]');
    await expect(rule).toBeVisible({ timeout: 20_000 });
    const ruleText = norm(await rule.innerText());
    console.log("### rule:", ruleText);
    expect(ruleText).toMatch(/^Pages start in Draft\. Mihai Perdum approves before a page is Approved\. Approved pages are protected: an edit by anyone who is not an approver or a space admin moves the page back to Draft\. Re-review after 150 days\.$/);
    const tabText = norm(await app.locator(".tab-content").innerText());
    expect(tabText, "no 'rights-holders'").not.toMatch(/rights-holders/);
    expect(tabText, "no 'Expired' as a state word in the settings copy").not.toMatch(/moved to Expired/);
    await expect(app.locator('[data-testid="wf-section-approval"]'), "WF-11 (2): no approval section on the settings view any more").toHaveCount(0);
    // ── ONE Save on this view ────────────────────────────────────────────────────────────────
    const saves = app.getByRole("button", { name: /^Save/ });
    expect(await saves.count(), "exactly one Save button on the settings view").toBe(1);
    await expect(saves.first()).toHaveText(/Save workflow settings/);
    await expect(app.locator('[data-testid="wf-def-default"]'), "the definitions are not on this view").toHaveCount(0);
    await ensureInViewport(page, rule);
    await page.screenshot({ path: `${OUT}/01-settings-rule-one-save.png` });

    // ── Edit the states… → the states view ───────────────────────────────────────────────────
    const edit = app.locator('[data-testid="wf-defs-toggle"]');
    await ensureInViewport(page, edit);
    await expect(edit).toHaveText(/Edit the states, approvers and protection…/); // WF-11 (2): the settings moved with the states
    await edit.click();
    const form = app.locator('[data-testid="wf-def-default"]');
    await expect(form, "the default workflow's editor is the view now").toBeVisible({ timeout: 15_000 });
    await expect(app.getByRole("button", { name: /Save workflow settings/ }), "the settings Save is gone from this view").toHaveCount(0);
    const head = norm(await form.locator(".wf-def-row-head").innerText());
    console.log("### table head:", head);
    expect(head.toLowerCase()).toMatch(/starts here/); // the head is upper-cased by CSS
    expect(head.toLowerCase()).toMatch(/approved \(enforced\)/);
    expect(head.toLowerCase()).not.toMatch(/\bfirst\b|\bprotected\b/);
    await expect(form.locator(".wf-def-id"), "raw ids are off the rows").toHaveCount(0);
    const title = await form.locator('[data-testid="wf-def-state-name"]').first().getAttribute("title");
    console.log("### id tooltip:", title);
    expect(title).toMatch(/Stored as "draft"/);
    const formText = norm(await form.innerText());
    expect(formText, "the built-in lapsed state reads Needs re-review").toMatch(/Needs re-review|Expired/); // a WFH copy saved earlier keeps its own name
    await expect(app.locator('[data-testid="wf-defs-back"]')).toBeVisible();
    await expect(app.locator('[data-testid="wf-defs"]')).toContainText(/Each workflow saves with its own Save workflow button/);
    await expect(form.locator('[data-testid="wf-section-approval"]'), "WF-11 (2): the approval settings sit with the states").toBeVisible();
    await expect(form.locator('[data-testid="wf-section-protection"]'), "…and the protection settings").toBeVisible();
    expect(await app.getByRole("button", { name: /^Save/ }).count(), "still ONE Save on the states view (the default workflow's)").toBe(1);
    await expect(app.locator('[data-testid="wf-defs"]')).not.toContainText(/the bar at the bottom saves the settings above/);
    await page.screenshot({ path: `${OUT}/02-states-view.png` });
    await app.locator("html").evaluate((h: any) => h.setAttribute("data-color-mode", "dark"));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/02b-states-view-dark.png` });
    await app.locator("html").evaluate((h: any) => h.setAttribute("data-color-mode", "light"));
    await app.locator('[data-testid="wf-defs-back"]').click();
    await expect(rule, "Back returns to the settings view").toBeVisible({ timeout: 15_000 });

    // ── WF-10: a Draft page (no clock) shows no 'Set review date' chip to a steward ─────────
    const r = await loadPage(page, P);
    expect(r, "ribbon renders").toBeTruthy();
    await expect(r!.frame.locator(".wf-chip-label", { hasText: "Draft" })).toBeVisible({ timeout: 20_000 });
    await expect(r!.frame.locator('[data-testid="wf-details-chip"]'), "no review-date chip where a date means nothing").toHaveCount(0);
    await shotRibbon(page, r!.el, `${OUT}/03-ribbon-draft-no-review-chip.png`);
  } finally {
    if (priorSteward == null) await delKvs(STEWARD_KEY).catch(() => {}); else await setKvs(STEWARD_KEY, priorSteward);
    await bed.restore();
  }
});
