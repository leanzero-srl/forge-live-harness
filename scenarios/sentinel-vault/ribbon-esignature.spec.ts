// B3 on the page: a space that requires signed decisions. Before enrolment the ribbon's approval
// panel says "set up your signature on My work"; after enrolment (through the seams, codes
// computed like an authenticator) it shows a code field, Approve is disabled until a code is
// typed, a wrong code is refused inline, the right code approves, and the approval record's
// dialog marks the decision Signed.
// @covers resolver:decide-approval resolver:get-page-approvals
import { test, expect } from "../../fixtures/forge";
import { createHmac } from "node:crypto";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage, purgePage } from "../../data/confluence.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";
import { mkdirSync } from "node:fs";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const DEV = "17516615";
const OUT = "/tmp/sv-esign";
const SETTINGS_KEY = `workflow-settings-${SPACE}`;
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const REQUESTER = "sv-aql-sign-ui";
const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const queryKvs = async (prefix: string): Promise<string[]> => (await getTestState("sentinel-vault", { what: "query", prefix })).keys || [];
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const clearDevice = async () => { for (const k of [`sig-secret-${MIHAI}`, `sig-enroll-${MIHAI}`, `sig-last-${MIHAI}`, `sig-fail-${MIHAI}`]) await delKvs(k).catch(() => {}); };
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32(s: string): Buffer { let bits = 0, v = 0; const out: number[] = []; for (const ch of s.toUpperCase().replace(/[^A-Z2-7]/g, "")) { v = (v << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); }
function totp(secret: string, stepOffset = 0): string {
  const step = Math.floor(Date.now() / 30000) + stepOffset;
  const msg = Buffer.alloc(8); let c = BigInt(step); for (let i = 7; i >= 0; i--) { msg[i] = Number(c & 0xffn); c >>= 8n; }
  const h = createHmac("sha1", b32(secret)).update(msg).digest(); const o = h[h.length - 1] & 15;
  const bin = ((h[o] & 0x7f) << 24) | ((h[o + 1] & 0xff) << 16) | ((h[o + 2] & 0xff) << 8) | (h[o + 3] & 0xff);
  return String(bin % 1e6).padStart(6, "0");
}

test.describe.configure({ timeout: 300_000, retries: 1 });

async function findRibbon(page: any) {
  const ifr = page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"], iframe[src*="atlassian-dev.net"]');
  for (let t = 0; t < 30; t++) {
    const n = await ifr.count();
    for (let i = 0; i < n; i++) {
      const src = (await ifr.nth(i).getAttribute("src").catch(() => "")) || "";
      if (!src.includes(DEV)) continue;
      const cf = ifr.nth(i).contentFrame();
      if ((await cf.locator("button.wf-chip").count().catch(() => 0)) > 0) return cf;
    }
    await page.waitForTimeout(1500);
  }
  return null;
}

test("signed approval from the ribbon: setup pointer, code field, wrong code, right code, Signed mark", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const prior = await getKvs(SETTINGS_KEY);
  const spaceId = await spaceIdByKey(SPACE);
  const p = await createPage({ spaceId, title: `HARNESS sv-esign-ui ${Date.now()}`, adf: doc(heading("Sign", 2), paragraph("ribbon signature")) });
  await clearDevice();
  try {
    await setKvs(SETTINGS_KEY, { ...(prior || { workflowId: "default", autoAssignNew: false }), enabled: true, requireSignature: true });
    await inv("assignWorkflow", { pageId: p.id, spaceKey: SPACE, workflowId: "default", actor: REQUESTER });
    await inv("transitionWorkflow", { pageId: p.id, spaceKey: SPACE, to: "in_review", actor: REQUESTER });
    const ra = await inv("requestApproval", { pageId: p.id, spaceKey: SPACE, to: "approved", toName: "Approved", approvers: MIHAI, mode: "any", actor: REQUESTER });
    expect(ra.result?.pending, `approval requested (got ${JSON.stringify(ra.result)})`).toBe(true);

    // Not enrolled: the panel points at My work.
    await page.goto(`https://wolfaenpak.atlassian.net/wiki/pages/viewpage.action?pageId=${p.id}`, { waitUntil: "domcontentloaded" });
    let ribbon = await findRibbon(page);
    expect(ribbon, "ribbon found").toBeTruthy();
    const openPanel = async (r: any) => {
      const chip = r.locator("button.wf-chip.wf-chip-awaiting").first();
      await expect(chip, "the Awaiting-approval chip renders").toBeVisible({ timeout: 20000 });
      await chip.click();
      const panel = r.locator('[role="dialog"].wf-appr-panel').first();
      await expect(panel).toBeVisible({ timeout: 8000 });
      return panel;
    };
    let panel = await openPanel(ribbon);
    await expect(panel.locator('[data-testid="wf-appr-sign-missing"]'), "not enrolled → a pointer to set the signature up").toBeVisible({ timeout: 10000 });
    await expect(panel.locator("button.wf-appr-approve"), "Approve is disabled until then").toBeDisabled();
    await page.screenshot({ path: `${OUT}/1-not-enrolled.png` });
    console.log("### not enrolled → setup pointer + Approve disabled ✓");

    // Enrol through the seams (the authenticator side of the flow is proven in esignature.spec).
    const en = (await inv("enrollSignature", { actor: MIHAI })).result;
    expect((await inv("confirmSignatureEnrollment", { actor: MIHAI, code: totp(en.secret) })).result?.success, "enrolled").toBe(true);

    await page.reload({ waitUntil: "domcontentloaded" });
    ribbon = await findRibbon(page);
    expect(ribbon).toBeTruthy();
    panel = await openPanel(ribbon);
    const codeInput = panel.locator('[data-testid="wf-appr-sign-code"]');
    await expect(codeInput, "enrolled → a code field").toBeVisible({ timeout: 10000 });
    const approve = panel.locator("button.wf-appr-approve");
    await expect(approve, "Sign & approve is disabled with no code").toBeDisabled();
    await codeInput.fill("000000");
    await expect(approve).toBeEnabled();
    await approve.click();
    // The refusal renders inside the panel (Forge iframes can remount — re-resolve the frame
    // and read the panel text rather than trusting one locator handle).
    let refusedText = "";
    // "did not match" specifically — the empty-code message also contains "code", and matching it
    // hid a stale-closure bug where the ribbon sent NO code at all.
    for (let i = 0; i < 12 && !/did not match/i.test(refusedText); i++) {
      const r2 = await findRibbon(page);
      refusedText = r2 ? ((await r2.locator('[role="dialog"].wf-appr-panel .wf-error').first().innerText().catch(() => "")) as string) : "";
      if (!refusedText) await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: `${OUT}/2-wrong-code.png` });
    if (!refusedText) console.log("### panel text after wrong code:", ((await ribbon.locator('[role="dialog"].wf-appr-panel').first().innerText().catch(() => "(no panel)")) as string).slice(0, 300));
    expect(/did not match/i.test(refusedText) || totp(en.secret, 1) === "000000", `a wrong code is refused inline with the mismatch message (got "${refusedText}")`).toBe(true);
    ribbon = await findRibbon(page);
    panel = ribbon.locator('[role="dialog"].wf-appr-panel').first();
    if (!(await panel.isVisible().catch(() => false))) panel = await openPanel(ribbon);
    console.log("### wrong code refused inline ✓");

    // The enrolment consumed ITS step; by now (reload + panel + refusal) the clock has moved on,
    // so the current code is fresh. If it has not (fast run), the app says "already used" and we
    // wait for the next step. Never guess an offset — the server's clock decides.
    let rec: any = null;
    for (let attempt = 0; attempt < 3 && rec?.stateId !== "approved"; attempt++) {
      ribbon = await findRibbon(page);
      panel = ribbon.locator('[role="dialog"].wf-appr-panel').first();
      if (!(await panel.isVisible().catch(() => false))) panel = await openPanel(ribbon);
      await panel.locator('[data-testid="wf-appr-sign-code"]').fill(totp(en.secret));
      await panel.locator("button.wf-appr-approve").click();
      for (let i = 0; i < 8; i++) { rec = await getKvs(`workflow-state-${p.id}`); if (rec?.stateId === "approved") break; await page.waitForTimeout(1500); }
      if (rec?.stateId !== "approved") {
        const r2 = await findRibbon(page);
        const errText = r2 ? ((await r2.locator('[role="dialog"].wf-appr-panel .wf-error').first().innerText().catch(() => "")) as string) : "";
        console.log(`### attempt ${attempt + 1} did not approve; panel error: "${errText}"`);
        await page.waitForTimeout(31000 - (Date.now() % 30000)); // the next time-step
      }
    }
    expect(rec?.stateId, "the signed approval moved the page to Approved").toBe("approved");
    expect(rec?.approvalRecord?.decisions?.[0]?.signed, "…and the record is signed").toBe(true);
    console.log("### right code approved ✓");

    // The evidence dialog marks the decision Signed.
    for (let i = 0; i < 10; i++) { ribbon = await findRibbon(page); if (ribbon && (await ribbon.locator('[data-testid="wf-evidence-chip"]').count()) > 0) break; await page.waitForTimeout(1500); }
    const evChip = ribbon.locator('[data-testid="wf-evidence-chip"]');
    await expect(evChip).toBeVisible({ timeout: 20000 });
    await evChip.click();
    await expect(ribbon.locator('[data-testid="wf-evidence-signed"]').first(), "the decision row says Signed").toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: `${OUT}/3-signed-record.png` });
    console.log("### evidence dialog marks the decision Signed ✓");
  } finally {
    await clearDevice();
    if (prior) await setKvs(SETTINGS_KEY, prior); else await delKvs(SETTINGS_KEY).catch(() => {});
    for (const k of [`workflow-state-${p.id}`, `workflow-pending-${p.id}`, `workflow-autoassigned-${p.id}`, `workflow-inbox-${MIHAI}-${p.id}`, `workflow-approval-${p.id}-approved-approval-${MIHAI}`,
      `workflow-idx-${SPACE}-draft-${p.id}`, `workflow-idx-${SPACE}-in_review-${p.id}`, `workflow-idx-${SPACE}-approved-${p.id}`]) await delKvs(k).catch(() => {});
    for (const prefix of [`workflow-log-${p.id}-`, `workflow-approval-${p.id}-`, `activity-page-${p.id}-`]) for (const k of await queryKvs(prefix).catch(() => [] as string[])) await delKvs(k).catch(() => {});
    await deletePage(p.id).catch(() => {}); await purgePage(p.id).catch(() => {});
  }
});
