/**
 * Definitive test. Every module now self-identifies:
 *   pageBanner  -> renders "[[MODULE:<key>]]" inside its iframe
 *   bylineItem  -> its manifest title (ZZCTRL / ZZPUBLIC / ...) appears in page text
 *
 * Space WFH is set to a known level via webtrigger before the page loads.
 * Correct result for level=CONFIDENTIAL:
 *   banner-control       rendered
 *   banner-restricted    NOT rendered
 *   ZZCTRL               rendered
 *   ZZCONFIDENTIAL       rendered
 *   ZZPUBLIC/INTERNAL/RESTRICTED  NOT rendered
 */
import { test } from "@playwright/test";
import { launchHarnessContext } from "../../forge/browser";
import { WIKI_BASE } from "../../config/env";
import fs from "node:fs"; import path from "node:path";

const APP = "64d08693-b295-4664-9fda-eba81261160f";
const PAGE_ID = process.env.CLS_PAGE_ID ?? "1573106"; // USER MANUALS - a normal content page
const LEVEL = (process.env.CLS_LEVEL ?? "CONFIDENTIAL").toUpperCase();

test(`classification verdict at level ${LEVEL}`, async () => {
  const ctx = await launchHarnessContext({ headed: false });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const out = path.join(process.cwd(), "evidence", "classification");
  fs.mkdirSync(out, { recursive: true });
  try {
    await page.goto(`${WIKI_BASE}/pages/viewpage.action?pageId=${PAGE_ID}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(16_000);

    // byline titles live in the top document's text
    const bodyText = await page.evaluate(() => document.body.innerText);
    const byline = {
      ZZCTRL: bodyText.includes("ZZCTRL"),
      ZZPUBLIC: bodyText.includes("ZZPUBLIC"),
      ZZINTERNAL: bodyText.includes("ZZINTERNAL"),
      ZZCONFIDENTIAL: bodyText.includes("ZZCONFIDENTIAL"),
      ZZRESTRICTED: bodyText.includes("ZZRESTRICTED"),
    };

    // banner content lives INSIDE our app's iframes - read each one
    const banners: string[] = [];
    for (const f of page.frames()) {
      if (!f.url().includes(APP)) continue;
      try {
        const t = await f.evaluate(() => document.body.innerText);
        const m = t.match(/\[\[MODULE:([^\]]+)\]\]/);
        if (m) banners.push(m[1]);
        else if (t.trim()) banners.push(`(no marker) ${t.trim().slice(0, 60)}`);
      } catch { /* frame may be detached */ }
    }

    const result = { pageId: PAGE_ID, spaceLevel: LEVEL, byline, bannersRendered: banners };
    fs.writeFileSync(path.join(out, `verdict-${LEVEL}-${PAGE_ID}.json`), JSON.stringify(result, null, 2));
    console.log("=== VERDICT ===\n" + JSON.stringify(result, null, 2));
    await page.screenshot({ path: path.join(out, `verdict-${LEVEL}-${PAGE_ID}.png`) });
  } finally { await ctx.close(); }
});
