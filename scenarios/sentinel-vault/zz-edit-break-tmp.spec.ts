// THROWAWAY repro: type into someone else's sealed section IN THE EDITOR, publish, let the app restore, open the editor again.
import { test } from "../../fixtures/forge";
import { BASE_URL } from "../../config/env";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, readPage, deletePage } from "../../data/confluence.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";
const GABI = "712020:2b9d007d-db0d-47c9-b4ae-953f55501f55";
const inv = (fn: string, params: Record<string, string>) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const shape = (adf: any) => JSON.stringify((adf.content || []).map((n: any) => n.type === "bodiedExtension" ? { ext: (n.content || []).map((c: any) => (c.content || []).map((t: any) => t.text).join("")) } : (n.content || []).map((t: any) => t.text).join("")));
test("repro: real editor typing → restore → editor again", async ({ page }) => {
  test.setTimeout(420_000);
  const spaceId = await spaceIdByKey("WFH");
  const created = await createPage({ spaceId, title: `HARNESS edit-break ${Date.now()}`, adf: doc(paragraph("intro"), heading("SECTION ALPHA", 2), paragraph("alpha body content"), heading("AFTER", 2), paragraph("after body")) });
  const PAGE = String(created.id);
  let SEC: string | null = null;
  try {
    const lh = await inv("listPageHeadings", { pageId: PAGE, actor: GABI });
    const alpha = (lh.result?.headings || []).find((h: any) => h.text === "SECTION ALPHA");
    const sr = await inv("sealSection", { pageId: PAGE, hi: String(alpha.index), htext: "SECTION ALPHA", actor: GABI });
    SEC = sr.result?.sectionId;
    console.log("### sealed:", shape((await readPage(PAGE)).adf));
    await page.goto(`${BASE_URL}/wiki/spaces/WFH/pages/edit-v2/${PAGE}`, { waitUntil: "domcontentloaded" });
    await page.locator(".ProseMirror").first().waitFor({ timeout: 90_000 });
    await page.waitForTimeout(6000);
    await page.locator(".ProseMirror p", { hasText: "alpha body content" }).first().click();
    await page.keyboard.press("End");
    await page.keyboard.type(" TYPED-IN-EDITOR");
    await page.waitForTimeout(2500);
    await page.screenshot({ path: "test-results/zz-eb-1-typed.png" });
    await page.getByRole("button", { name: /^(Update|Publish)$/ }).first().click();
    await page.waitForTimeout(3000);
    const dlg = page.getByRole("button", { name: /^(Update|Publish)$/ });
    if (await dlg.count()) await dlg.last().click().catch(() => {});
    await page.waitForURL(/\/pages\/\d+/, { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(20_000); // view → guard restores
    const pr = await readPage(PAGE);
    console.log("### published after restore: v", pr.version, shape(pr.adf));
    await page.screenshot({ path: "test-results/zz-eb-2-view-after-restore.png" });
    await page.goto(`${BASE_URL}/wiki/spaces/WFH/pages/edit-v2/${PAGE}`, { waitUntil: "domcontentloaded" });
    await page.locator(".ProseMirror").first().waitFor({ timeout: 90_000 });
    await page.waitForTimeout(9000);
    await page.screenshot({ path: "test-results/zz-eb-3-editor-after-restore.png", fullPage: false });
    console.log("### editor text after restore:", (await page.locator(".ProseMirror").first().innerText()).replace(/\s+/g, " ").slice(0, 500));
    console.log("### whole page text:", (await page.locator("#content, main").first().innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 400));
  } finally {
    if (SEC) { await delKvs(`section-protection-${SEC}`).catch(() => {}); await delKvs(`section-snapshot-${SEC}`).catch(() => {}); }
    await delKvs(`page-guard-${PAGE}`).catch(() => {});
    await deletePage(PAGE).catch(() => {});
  }
});
