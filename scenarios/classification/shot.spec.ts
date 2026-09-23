import { test } from "@playwright/test";
import { launchHarnessContext } from "../../forge/browser";
import { WIKI_BASE } from "../../config/env";
import fs from "node:fs"; import path from "node:path";
const PAGE_ID = process.env.CLS_PAGE_ID ?? "1573106";
const TAG = process.env.CLS_TAG ?? "shot";
test("screenshot the classification surfaces", async () => {
  const ctx = await launchHarnessContext({ headed: false });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const out = path.join(process.cwd(), "evidence", "classification");
  fs.mkdirSync(out, { recursive: true });
  try {
    await page.goto(`${WIKI_BASE}/pages/viewpage.action?pageId=${PAGE_ID}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(16_000);
    const txt = await page.evaluate(() => document.body.innerText);
    const ourFrames = await page.evaluate(() => Array.from(document.querySelectorAll('iframe'))
      .filter(f => (f as HTMLIFrameElement).src.includes('64d08693-b295-4664-9fda-eba81261160f')).length);
    console.log(`TAG=${process.env.CLS_TAG} ourAppIframes=${ourFrames}`);
    const hits = ["Classification", "PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]
      .filter(w => new RegExp(`\\b${w}\\b`).test(txt));
    console.log(`TAG=${TAG} textHits=${JSON.stringify(hits)}`);
    await page.screenshot({ path: path.join(out, `prod-${TAG}.png`) });
  } finally { await ctx.close(); }
});
