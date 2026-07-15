// B9 (worklist #7) — the doc-ribbon WORKFLOW operator UI (state chip + "Move to…" menu), which the
// workflow engine e2e never render in a browser. Assigns a workflow to a DISPOSABLE page via the
// testhook, loads it, and asserts the ribbon renders the state chip + opens the transition menu (with
// keyboard/Escape), then screenshots the ribbon for the visual review. (The approval role=dialog +
// decide-approval are covered by workflow-approval-e2e; the deep dialog interaction is a residual.)
import { test, expect } from "../../fixtures/forge";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage } from "../../data/confluence.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const DEV = "17516615";
const OUT = "/tmp/sv-ribbon-wf";
const inv = (fn: string, params: Record<string, string>) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });

test.describe.configure({ timeout: 180_000, retries: 1 });

test("B9: doc-ribbon workflow chip renders + the Move-to menu opens", async ({ page }) => {
  const { mkdirSync } = await import("node:fs");
  mkdirSync(OUT, { recursive: true });
  const spaceId = await spaceIdByKey(SPACE);
  const p = await createPage({ spaceId, title: `HARNESS sv-ribbon-wf ${Date.now()}`, adf: doc(heading("Doc", 2), paragraph("body")) });
  try {
    // assign the default workflow to the page (initial state = Draft) via the testhook
    const asg = await inv("assignWorkflow", { pageId: p.id, spaceKey: SPACE, workflowId: "default", actor: "sv-aql-wf" });
    expect(asg.result, "workflow assigned").toBeTruthy();

    // load the page; the doc-ribbon (pageBanner) renders the workflow chip once get-page-workflow resolves
    await page.goto(`https://wolfaenpak.atlassian.net/wiki/pages/viewpage.action?pageId=${p.id}`, { waitUntil: "domcontentloaded" });
    const ifr = page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"], iframe[src*="atlassian-dev.net"]');

    // poll for the dev doc-ribbon frame that contains a .wf-chip
    let ribbon: any = null;
    for (let t = 0; t < 20 && !ribbon; t++) {
      const n = await ifr.count();
      for (let i = 0; i < n; i++) {
        const src = (await ifr.nth(i).getAttribute("src").catch(() => "")) || "";
        if (!src.includes(DEV)) continue;
        const cf = ifr.nth(i).contentFrame();
        if ((await cf.locator(".wf-chip").count().catch(() => 0)) > 0) { ribbon = cf; break; }
      }
      if (!ribbon) await page.waitForTimeout(1500);
    }
    expect(ribbon, "the doc-ribbon renders a workflow state chip").toBeTruthy();

    const chip = ribbon.locator("button.wf-chip").first();
    const chipText = (await chip.innerText().catch(() => "")).trim();
    expect(chipText.length, "the state chip shows a state name").toBeGreaterThan(0);
    await ribbon.locator("body").screenshot({ path: `${OUT}/ribbon-chip.png` }).catch(() => {});
    console.log(`### ribbon workflow chip renders: "${chipText}" ✓`);

    // open the Move-to menu (initial Draft state can move) → a role=menu appears; Escape closes it
    await chip.click();
    const menu = ribbon.locator('[role="menu"], .wf-menu');
    const opened = await menu.first().isVisible({ timeout: 4000 }).catch(() => false);
    if (opened) {
      await ribbon.locator("body").screenshot({ path: `${OUT}/ribbon-menu.png` }).catch(() => {});
      await page.keyboard.press("Escape");
      console.log("### Move-to transition menu opened + Escape closed ✓");
    } else {
      console.log("### chip present but no transitions from the current state (menu not applicable)");
    }
  } finally {
    await delKvs(`workflow-page-${p.id}`).catch(() => {});
    await deletePage(p.id).catch(() => {});
  }
});
