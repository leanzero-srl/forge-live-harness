import { test } from "@playwright/test";
import { launchHarnessContext } from "../../forge/browser";
import { WIKI_BASE } from "../../config/env";
const APP = "64d08693-b295-4664-9fda-eba81261160f";
const PAGE_ID = process.env.CLS_PAGE_ID ?? "323223996";
const RUNS = Number(process.env.RUNS ?? 3);
test("time to visible banner", async () => {
  test.setTimeout(400_000);
  const ctx = await launchHarnessContext({ headed: false });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const results: number[] = [];
  try {
    for (let i = 0; i < RUNS; i++) {
      await page.goto("about:blank");
      const t0 = Date.now();
      await page.goto(`${WIKI_BASE}/pages/viewpage.action?pageId=${PAGE_ID}`, { waitUntil: "commit" });
      let seen = -1;
      while (Date.now() - t0 < 30000) {
        // UI Kit `render: native` paints into the HOST document; Custom UI paints into its iframe.
        // Check both, or one of the two is structurally invisible to the stopwatch.
        const host = await page.evaluate(() => {
          const el = Array.from(document.querySelectorAll('span,div,p,strong'))
            .find(e => /^(CONFIDENTIAL|INTERNAL|RESTRICTED|PUBLIC)$/.test((e.textContent || '').trim()));
          return !!el;
        }).catch(() => false);
        if (host) { seen = Date.now() - t0; break; }
        for (const f of page.frames()) {
          if (!f.url().includes(APP)) continue;
          const t = await f.evaluate(() => document.body?.innerText || "").catch(() => "");
          if (/CONFIDENTIAL|INTERNAL|RESTRICTED|PUBLIC/.test(t)) { seen = Date.now() - t0; break; }
        }
        if (seen >= 0) break;
        await page.waitForTimeout(100);
      }
      results.push(seen);
    }
    console.log(`TIMING ${process.env.CLS_TAG ?? ""}: ms-to-visible = ${JSON.stringify(results)} median=${[...results].sort((a,b)=>a-b)[Math.floor(results.length/2)]}`);
  } finally { await ctx.close(); }
});
