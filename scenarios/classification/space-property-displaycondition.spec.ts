/**
 * THE EXPERIMENT.
 *
 * Question: does `entityPropertyEqualTo` on `entity: space` actually gate a
 * Confluence Forge module in production? Documented as supported, but Atlassian
 * has an open bug in this area (CONFCLOUD-84518) and nobody has posted a control.
 *
 * Method (ported from forge-displaycond-demo): the app declares FIVE byline
 * items — one CONTROL with no display condition, and four gated on
 * space property lzClassification.level == PUBLIC|INTERNAL|CONFIDENTIAL|RESTRICTED.
 * Space WFH is set to CONFIDENTIAL.
 *
 * A correct result is NOT "something rendered". It is exactly:
 *   control        VISIBLE   (proves the app renders at all)
 *   CONFIDENTIAL   VISIBLE   (proves the condition matches)
 *   PUBLIC/INTERNAL/RESTRICTED  ABSENT  (proves the condition discriminates)
 * Anything else is a failure, including "all five visible" — that would mean the
 * condition is ignored, which is worse than it not working.
 */
import { test, expect } from "@playwright/test";
import { launchHarnessContext } from "../../forge/browser";
import { WIKI_BASE } from "../../config/env";
import fs from "node:fs";
import path from "node:path";

const PAGE_ID = process.env.CLS_PAGE_ID ?? "852172"; // WORK FOR HIRE Home, space WFH
const LEVELS = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"];
const EXPECT_VISIBLE = (process.env.CLS_EXPECT ?? "CONFIDENTIAL").toUpperCase();

test("space-property display condition gates a Confluence byline item", async () => {
  const ctx = await launchHarnessContext({ headed: false });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const outDir = path.join(process.cwd(), "evidence", "classification");
  fs.mkdirSync(outDir, { recursive: true });

  try {
    await page.goto(`${WIKI_BASE}/pages/viewpage.action?pageId=${PAGE_ID}`, {
      waitUntil: "domcontentloaded",
    });
    if (/id\.atlassian\.com|login/.test(page.url())) {
      throw new Error(`session expired -> ${page.url()}; run \`npm run auth\` headed once`);
    }
    // Byline items hydrate after the page body; give Forge time to mount.
    await page.waitForTimeout(12_000);

    const bodyText = await page.evaluate(() => document.body.innerText);
    const found: Record<string, boolean> = { CONTROL: /CLASSIFICATION probe: control/i.test(bodyText) };
    for (const l of LEVELS) {
      // word-boundary match so CONFIDENTIAL doesn't match inside other words
      found[l] = new RegExp(`\\b${l}\\b`).test(bodyText);
    }

    // Also enumerate every Forge iframe present, which is the ground truth for
    // "which modules did the platform actually decide to render".
    const frames = await page.evaluate(() =>
      Array.from(document.querySelectorAll("iframe"))
        .map((f) => (f as HTMLIFrameElement).src)
        .filter((s) => /atlassian-dev\.net|forge/i.test(s)),
    );

    await page.screenshot({ path: path.join(outDir, `byline-${EXPECT_VISIBLE}.png`), fullPage: false });
    fs.writeFileSync(
      path.join(outDir, `result-${EXPECT_VISIBLE}.json`),
      JSON.stringify({ pageId: PAGE_ID, expectVisible: EXPECT_VISIBLE, found, forgeFrames: frames }, null, 2),
    );

    console.log("VERDICT INPUT:", JSON.stringify({ found, forgeFrameCount: frames.length }, null, 2));

    // The control must render, or nothing below means anything.
    expect(found.CONTROL, "control byline item must render (else the app is not rendering at all)").toBe(true);
    expect(found[EXPECT_VISIBLE], `${EXPECT_VISIBLE} byline item must render`).toBe(true);
    for (const l of LEVELS.filter((x) => x !== EXPECT_VISIBLE)) {
      expect(found[l], `${l} must NOT render (condition must discriminate)`).toBe(false);
    }
  } finally {
    await ctx.close();
  }
});
