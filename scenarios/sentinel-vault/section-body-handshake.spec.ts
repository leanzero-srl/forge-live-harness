// Owner report 2026-09-17 (leanzero-demo): "sometimes" the sealed-section macro showed its badge over
// an EMPTY body. Cause: the bridge attaches its one-shot `forge-adf-renderer-ready` listener in the
// iframe's onLoad; a ready posted before the load event is missed, the document is only sent by the
// bridge's 10 s blind fallback, and the surface had already revealed the frame on the ready message.
// The surface now does the handshake itself and reveals on real HEIGHT. This spec loads the page
// repeatedly and samples the frame: the body may never be REVEALED while empty, and content must
// arrive well inside the old 10 s fallback every time.
import { test, expect } from "../../fixtures/forge";
import type { Frame, Page } from "@playwright/test";
import { BASE_URL } from "../../config/env";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage } from "../../data/confluence.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const DEV = "17516615";
const ACTOR = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const LOADS = Number(process.env.SV_HANDSHAKE_LOADS || 8);
const inv = (fn: string, params: Record<string, string>) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });

test.describe.configure({ timeout: 600_000 });

async function sectionFrame(page: Page, timeoutMs = 60_000): Promise<Frame> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    for (const fr of page.frames()) if (fr.url().includes(DEV) && (await fr.locator(".sec-frame:not(.sec-loading)").count().catch(() => 0)) > 0) return fr;
    await page.waitForTimeout(200);
  }
  throw new Error("section macro frame not found");
}

test(`the sealed-section body is never revealed empty, across ${LOADS} loads`, async ({ page }) => {
  const spaceId = await spaceIdByKey(SPACE);
  const created = await createPage({ spaceId, title: `HARNESS body-handshake ${Date.now()}`, adf: doc(paragraph("intro"), heading("SECTION ALPHA", 2), paragraph("alpha body content line one"), paragraph("alpha body content line two"), heading("AFTER", 2), paragraph("after")) });
  const PAGE = String(created.id);
  let SECTION: string | null = null;
  try {
    const lh = await inv("listPageHeadings", { pageId: PAGE, actor: ACTOR });
    const alpha = (lh.result?.headings || []).find((h: any) => h.text === "SECTION ALPHA");
    const sr = await inv("sealSection", { pageId: PAGE, hi: String(alpha.index), htext: "SECTION ALPHA", actor: ACTOR });
    expect(sr.result?.success, `sealed (${sr.result?.reason || "ok"})`).toBe(true);
    SECTION = sr.result.sectionId;

    const times: number[] = [];
    for (let i = 1; i <= LOADS; i++) {
      const warns: string[] = [];
      const onConsole = (m: any) => { if (/SECTION-UI\] body/.test(m.text())) warns.push(m.text()); };
      page.on("console", onConsole);
      await page.goto(`${BASE_URL}/wiki/spaces/${SPACE}/pages/${PAGE}${i % 2 ? "" : `?r=${i}`}`, { waitUntil: "domcontentloaded" });
      const frame = await sectionFrame(page);
      const t0 = Date.now();
      let emptyRevealed = 0, shownAt = -1, samples = 0;
      while (Date.now() - t0 < 20_000) {
        const st = await frame.evaluate(() => {
          const f = document.querySelector(".sec-body-frame") as HTMLIFrameElement | null;
          const fb = document.querySelector(".sec-body-fallback") as HTMLElement | null;
          return { ready: f?.getAttribute("data-ready") || null, h: f ? f.getBoundingClientRect().height : -1, pending: !!f?.classList.contains("sec-body-frame--pending"), fallback: !!fb && fb.offsetParent !== null, fbText: fb?.textContent || "" };
        }).catch(() => null);
        if (!st) { await page.waitForTimeout(200); continue; }
        samples++;
        // THE defect: the frame is in flow (revealed), nothing else is shown, and it has no height.
        if (st.ready === "true" && !st.fallback && st.h < 12) emptyRevealed++;
        if (shownAt < 0 && st.ready === "true" && st.h >= 12) { shownAt = Date.now() - t0; break; }
        await page.waitForTimeout(200);
      }
      page.off("console", onConsole);
      console.log(`### load ${i}: content after ${shownAt} ms (samples ${samples}, empty-revealed ${emptyRevealed})${warns.length ? " | " + warns.join(" | ") : ""}`);
      expect(emptyRevealed, `load ${i}: the body was never revealed while empty`).toBe(0);
      expect(shownAt, `load ${i}: the body content appeared`).toBeGreaterThanOrEqual(0);
      expect(shownAt, `load ${i}: …and well inside the bridge's old 10 s blind fallback`).toBeLessThan(9_500);
      // and it is the real content, in the renderer frame
      const inner = page.frames().find((f) => /forge-apps\/adf-renderer/.test(f.url()));
      if (inner) await expect(inner.locator("body"), `load ${i}: the renderer shows the sealed text`).toContainText("alpha body content line one", { timeout: 10_000 });
      times.push(shownAt);
    }
    console.log(`### time-to-content ms: ${JSON.stringify(times)} (max ${Math.max(...times)})`);
    await page.screenshot({ path: "test-results/section-body-handshake.png" });
  } finally {
    if (SECTION) { await delKvs(`section-protection-${SECTION}`).catch(() => {}); await delKvs(`section-snapshot-${SECTION}`).catch(() => {}); }
    await delKvs(`page-guard-${PAGE}`).catch(() => {});
    await deletePage(PAGE).catch(() => {});
  }
});
