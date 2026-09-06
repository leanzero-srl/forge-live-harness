// B2 on the page: the ribbon of an Approved page in a space asking for read confirmations shows
// "Confirm I've read v1"; a click turns it into "Read v1 ✓"; the steward's "Read by 1 of 2"
// opens a dialog (inside the banner iframe's box) naming who has and has not.
// @covers resolver:confirm-read resolver:get-read-report
import { test, expect } from "../../fixtures/forge";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage, purgePage } from "../../data/confluence.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";
import { mkdirSync } from "node:fs";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const DEV = "17516615";
const OUT = "/tmp/sv-read-confirm";
const SETTINGS_KEY = `workflow-settings-${SPACE}`;
const STEWARD_KEY = `admin-settings-space-${SPACE}`;
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const GABI = "712020:2b9d007d-db0d-47c9-b4ae-953f55501f55";
const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const queryKvs = async (prefix: string): Promise<string[]> => (await getTestState("sentinel-vault", { what: "query", prefix })).keys || [];
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });

test.describe.configure({ timeout: 300_000, retries: 1 });

test("confirm from the ribbon; the steward's read dialog names who has and has not", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const priorSettings = await getKvs(SETTINGS_KEY);
  const priorSteward = await getKvs(STEWARD_KEY);
  const spaceId = await spaceIdByKey(SPACE);
  const p = await createPage({ spaceId, title: `HARNESS sv-read-ui ${Date.now()}`, adf: doc(heading("Read me", 2), paragraph("ribbon confirmation")) });
  try {
    const users = [...new Set([...(priorSteward?.adminUsers || []).map((u: any) => (typeof u === "string" ? u : u?.accountId)), MIHAI])];
    await setKvs(STEWARD_KEY, { ...(priorSteward || {}), adminUsers: users });
    await setKvs(SETTINGS_KEY, { ...(priorSettings || { workflowId: "default", autoAssignNew: false }), enabled: true, readConfirmation: { enabled: true, audience: [{ type: "user", id: MIHAI, name: "Mihai Perdum" }, { type: "user", id: GABI, name: "Gabriela Perdum" }] } });
    await inv("assignWorkflow", { pageId: p.id, spaceKey: SPACE, workflowId: "default", actor: MIHAI });
    await inv("transitionWorkflow", { pageId: p.id, spaceKey: SPACE, to: "in_review", actor: MIHAI });
    await inv("transitionWorkflow", { pageId: p.id, spaceKey: SPACE, to: "approved", toName: "Approved", approvers: MIHAI, approvedVersion: "1", actor: MIHAI });

    await page.goto(`https://wolfaenpak.atlassian.net/wiki/pages/viewpage.action?pageId=${p.id}`, { waitUntil: "domcontentloaded" });
    const ifr = page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"], iframe[src*="atlassian-dev.net"]');
    let ribbon: any = null, ribbonEl: any = null;
    for (let t = 0; t < 30 && !ribbon; t++) {
      const n = await ifr.count();
      for (let i = 0; i < n; i++) {
        const src = (await ifr.nth(i).getAttribute("src").catch(() => "")) || "";
        if (!src.includes(DEV)) continue;
        const cf = ifr.nth(i).contentFrame();
        if ((await cf.locator('[data-testid="wf-read"]').count().catch(() => 0)) > 0) { ribbon = cf; ribbonEl = ifr.nth(i); break; }
      }
      if (!ribbon) await page.waitForTimeout(1500);
    }
    expect(ribbon, "the ribbon shows the read-confirmation control").toBeTruthy();
    const btn = ribbon.locator('[data-testid="wf-read-confirm"]');
    await expect(btn, "the button asks to confirm v1").toHaveText(/Confirm I've read v1/);
    const details = ribbon.locator('[data-testid="wf-details-chip"]');
    await expect(details, "the steward's details chip carries the count").toHaveText(/read 0\/2/);
    await page.screenshot({ path: `${OUT}/1-before.png` });

    await btn.click();
    const done = ribbon.locator('[data-testid="wf-read-done"]');
    await expect(done, "the button becomes a confirmation").toHaveText(/Read v1/, { timeout: 15000 });
    await expect(details, "…and the count moved").toHaveText(/read 1\/2/, { timeout: 15000 });
    expect((await getKvs(`read-ack-${p.id}-${MIHAI}`))?.version, "the ack record names v1").toBe(1);
    console.log("### confirmed from the ribbon ✓ (Read v1 ✓, read 1/2 on the details chip)");

    await details.click();
    const dialog = ribbon.locator('[data-testid="wf-read-dialog"]');
    await expect(dialog).toBeVisible({ timeout: 8000 });
    const rows = dialog.locator('[data-testid="wf-read-row"]');
    await expect(rows, "two people listed").toHaveCount(2, { timeout: 15000 });
    await expect(dialog.locator('[data-testid="wf-read-row"][data-confirmed="1"]'), "Mihai confirmed").toHaveText(/Mihai/);
    await expect(dialog.locator('[data-testid="wf-read-row"][data-confirmed="0"]'), "Gabriela not yet").toHaveText(/Gabriela/);
    let frameBox: any = null, dialogBox: any = null;
    for (let i = 0; i < 12; i++) { frameBox = await ribbonEl.boundingBox(); dialogBox = await dialog.boundingBox(); if (frameBox && dialogBox && dialogBox.y + dialogBox.height <= frameBox.y + frameBox.height + 2) break; await page.waitForTimeout(1000); }
    expect(dialogBox!.y + dialogBox!.height, "the dialog is not clipped by the banner iframe").toBeLessThanOrEqual(frameBox!.y + frameBox!.height + 2);
    await page.screenshot({ path: `${OUT}/2-dialog.png` });
    console.log("### steward readers section ✓ (names, inside the iframe box)");
  } finally {
    if (priorSettings) await setKvs(SETTINGS_KEY, priorSettings); else await delKvs(SETTINGS_KEY).catch(() => {});
    if (priorSteward) await setKvs(STEWARD_KEY, priorSteward); else await delKvs(STEWARD_KEY).catch(() => {});
    for (const k of [`workflow-state-${p.id}`, `workflow-pending-${p.id}`, `workflow-autoassigned-${p.id}`, `read-ack-${p.id}-${GABI}`, `read-ack-${p.id}-${MIHAI}`,
      `workflow-idx-${SPACE}-draft-${p.id}`, `workflow-idx-${SPACE}-in_review-${p.id}`, `workflow-idx-${SPACE}-approved-${p.id}`]) await delKvs(k).catch(() => {});
    for (const prefix of [`workflow-log-${p.id}-`, `activity-page-${p.id}-`]) for (const k of await queryKvs(prefix).catch(() => [] as string[])) await delKvs(k).catch(() => {});
    await deletePage(p.id).catch(() => {}); await purgePage(p.id).catch(() => {});
  }
});
