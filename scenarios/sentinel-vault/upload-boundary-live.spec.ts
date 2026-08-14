// COVERAGE-MATRIX #10 (tail) — the LIVE 4 MB upload boundary, driven through the app's real
// upload input in the browser.
//
// SURFACE CORRECTION (found by reading the code, recorded honestly): the Manage Attachments
// OVERLAY (src/ui/surfaces/overlay/index.jsx) has NO upload input — its only <input> is the
// column-picker checkbox. The app's one and only file-upload surface is the INLINE-PANEL macro's
// UploadZone (src/ui/surfaces/inline-panel/index.jsx: `.upload-zone input[type="file"]`, hidden
// behind the "click to select" label). So this spec embeds the DEV panel macro on a THROWAWAY
// page (buildExtensionNode — same technique as validation-eval.spec.ts) and drives that input.
//
// RAW vs BASE64 — the settled answer: the limit measures RAW (decoded) bytes, at BOTH ends.
//   client: UploadZone rejects on `file.size > 4*1024*1024` (file.size is raw by definition);
//   server: upload-artifact → withinUploadSizeLimit(fileDataBase64.length) in
//           src/server/shared/upload-limits.js, which converts the base64 LENGTH back to raw
//           (floor(len * 0.75) <= 4 MB) — the it57 fix that resolved exactly this ambiguity.
// The 3.2 MB-raw file is the live discriminator: its base64 form is ~4.27 MB (> 4 MB), so it
// passes ONLY if raw is what's measured — this spec asserts it is ACCEPTED end-to-end (real
// attachment created), while the 4.5 MB-raw file is REJECTED client-side with the exact copy
// "File exceeds size limit (4.5 MB). Maximum allowed is 4 MB." and no attachment is created.
// (Written from the code, verified live when this browser spec runs; if the accept case ever
// fails with "Transfer unsuccessful", that is a REAL product bug — the invoke transport choking
// on a ~4.3 MB base64 payload while the UI advertises "Up to 4 MB".)
//
// Also asserted: the input RESETS after each selection (handleFileInput clears e.target.value so
// the same file can be re-picked), and a rejection's error copy clears on the next attempt.
// Self-cleaning: the throwaway page owns the uploaded attachment; no KVS is seeded.
import { test, expect } from "../../fixtures/forge";
import { waitForTerminal } from "../_support/wait";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage } from "../../data/confluence.mjs";
// @ts-ignore
import { paragraph, buildExtensionNode } from "../../data/adf.mjs";
// @ts-ignore
import { get } from "../../data/jira.mjs";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const DEV = "17516615";
const OUT = "/tmp/sv-upload-boundary";
const SENTINEL_APP = "ari:cloud:ecosystem::app/c30bf71e-4287-4872-954d-db49cc68f0ff";
const SENTINEL_ENV = process.env.SENTINEL_ENV_ID || "17516615-12ef-4790-8ce2-29151b7ee9ac";

// 3.2 MB raw → base64 ≈ 4.27 MB (> 4 MB): accepted ONLY if the limit measures RAW bytes.
const OK_BYTES = 3_355_443; // 3.2 * 1024 * 1024
// 4.5 MB raw: over the limit whichever way you measure → always rejected, client-side.
const BIG_BYTES = 4_718_592; // 4.5 * 1024 * 1024
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });

test.describe.configure({ timeout: 240_000, retries: 1 });

test("#10: 4MB boundary — 3.2MB raw (>4MB base64) accepted, 4.5MB rejected with exact copy, input resets", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const stamp = Date.now();
  const okName = `sv-upload-ok-${stamp}.bin`;
  const bigName = `sv-upload-big-${stamp}.bin`;
  const okPath = `${OUT}/${okName}`;
  const bigPath = `${OUT}/${bigName}`;
  writeFileSync(okPath, Buffer.alloc(OK_BYTES, 7));
  writeFileSync(bigPath, Buffer.alloc(BIG_BYTES, 9));

  const spaceId = await spaceIdByKey(SPACE);
  expect(spaceId, `space ${SPACE} resolves`).toBeTruthy();
  const p = await createPage({
    spaceId,
    title: `HARNESS sv-upload-boundary ${stamp}`,
    adf: doc(paragraph("upload boundary bed"), buildExtensionNode(SENTINEL_APP, SENTINEL_ENV, "sentinel-vault-panel", { title: "Sentinel Vault" })),
  });
  try {
    // ── load the page and poll for the DEV inline-panel macro iframe (.sv-panel-container)
    await page.goto(`https://wolfaenpak.atlassian.net/wiki/pages/viewpage.action?pageId=${p.id}`, { waitUntil: "domcontentloaded" });
    const ifr = page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"], iframe[src*="atlassian-dev.net"]');
    let panel: any = null;
    for (let t = 0; t < 30 && !panel; t++) {
      const n = await ifr.count();
      for (let i = 0; i < n; i++) {
        const src = (await ifr.nth(i).getAttribute("src").catch(() => "")) || "";
        if (!src.includes(DEV)) continue;
        const cf = ifr.nth(i).contentFrame();
        if ((await cf.locator(".sv-panel-container").count().catch(() => 0)) > 0) { panel = cf; break; }
      }
      if (!panel) await page.waitForTimeout(1500);
    }
    expect(panel, "dev inline-panel macro rendered on the throwaway page").toBeTruthy();
    await expect(panel.locator(".sv-panel-loading"), "panel finished loading").toHaveCount(0, { timeout: 20_000 });

    // The macro iframe can REMOUNT after first paint (it49): re-resolve the frame until the
    // upload zone is actually present rather than trusting the pre-mount reference.
    const findPanelWithInput = async () => {
      const n2 = await ifr.count();
      for (let i = 0; i < n2; i++) {
        const src = (await ifr.nth(i).getAttribute("src").catch(() => "")) || "";
        if (!src.includes(DEV)) continue;
        const cf = ifr.nth(i).contentFrame();
        if ((await cf.locator('.upload-zone input[type="file"]').count().catch(() => 0)) > 0) return cf;
      }
      return null;
    };
    const inputDeadline = Date.now() + 45_000;
    let panelWithInput: any = null;
    while (!panelWithInput && Date.now() < inputDeadline) {
      panelWithInput = await findPanelWithInput();
      if (!panelWithInput) await page.waitForTimeout(2000);
    }
    expect(panelWithInput, "upload input present in the panel's upload zone").toBeTruthy();
    panel = panelWithInput;
    const input = panel.locator('.upload-zone input[type="file"]');
    const hint = ((await panel.locator(".upload-zone-hint").innerText().catch(() => "")) as string).trim();
    expect(hint, "the zone advertises the limit under test").toContain("Up to 4 MB");
    await page.screenshot({ path: `${OUT}/1-panel-ready.png` }).catch(() => {});

    // ── CASE 1: 4.5 MB raw → client-side REJECT, exact error copy, no attachment, input resets
    await input.setInputFiles(bigPath);
    const err = panel.locator(".upload-zone-error");
    await expect(err, "oversize file surfaces an inline error").toBeVisible({ timeout: 10_000 });
    const errText = ((await err.innerText()) as string).trim();
    expect(errText, "error names the offending size").toContain("File exceeds size limit (4.5 MB)");
    expect(errText, "error names the maximum").toContain("Maximum allowed is 4 MB");
    const resetAfterReject = await input.evaluate((el: HTMLInputElement) => el.value === "" && el.files!.length === 0);
    expect(resetAfterReject, "input resets after the rejection (same file re-selectable)").toBeTruthy();
    await page.screenshot({ path: `${OUT}/2-rejected-4p5mb.png` }).catch(() => {});
    console.log(`### 4.5MB rejected client-side — "${errText}" ✓`);

    // the reject never reaches the resolver — prove no attachment materialized (bounded check)
    await page.waitForTimeout(6000);
    const afterReject = await get(`/wiki/api/v2/pages/${p.id}/attachments?limit=50`);
    expect((afterReject.results || []).some((a: any) => a.title === bigName), "no attachment created for the rejected file").toBeFalsy();

    // ── CASE 2: 3.2 MB raw (~4.27 MB base64) → ACCEPTED — the raw-vs-base64 discriminator
    await input.setInputFiles(okPath);
    // the accepted upload becomes a REAL attachment on the page (the user-visible outcome)
    const uploaded = await waitForTerminal(async () => {
      const r = await get(`/wiki/api/v2/pages/${p.id}/attachments?limit=50`);
      return (r.results || []).find((a: any) => a.title === okName) || null;
    }, { timeout: 90_000, interval: 3000, label: `attachment ${okName} appears on the page` });
    // strict, no fallback: a missing/mismatched fileSize should fail loudly, not pass silently
    expect(Number(uploaded.fileSize), "stored attachment carries the raw byte size").toBe(OK_BYTES);
    console.log("### 3.2MB raw (>4MB as base64) accepted — the limit measures RAW size ✓");

    // the previous rejection's error copy cleared on this (successful) attempt
    await expect(err, "prior error cleared by the successful upload").toBeHidden({ timeout: 15_000 });
    const resetAfterAccept = await input.evaluate((el: HTMLInputElement) => el.value === "" && el.files!.length === 0);
    expect(resetAfterAccept, "input resets after the accepted upload too").toBeTruthy();

    // and the panel itself shows the new file after its refresh
    let inPanel = false;
    for (let t = 0; t < 14 && !inPanel; t++) {
      const body = ((await panel.locator("body").innerText().catch(() => "")) as string) || "";
      if (body.includes(okName)) { inPanel = true; break; }
      await page.waitForTimeout(1500);
    }
    expect(inPanel, "panel lists the uploaded file after refresh").toBeTruthy();
    await page.screenshot({ path: `${OUT}/3-accepted-3p2mb.png` }).catch(() => {});
  } finally {
    await deletePage(p.id).catch(() => {}); // takes the uploaded attachment with it
    rmSync(okPath, { force: true });
    rmSync(bigPath, { force: true });
  }
});
