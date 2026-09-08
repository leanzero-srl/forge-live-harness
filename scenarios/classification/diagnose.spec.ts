import { test } from "@playwright/test";
import { launchHarnessContext } from "../../forge/browser";
import { WIKI_BASE } from "../../config/env";
import fs from "node:fs"; import path from "node:path";

const PAGE_ID = process.env.CLS_PAGE_ID ?? "852172";
const APP = "64d08693-b295-4664-9fda-eba81261160f";

test("diagnose what the platform actually rendered", async () => {
  const ctx = await launchHarnessContext({ headed: false });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const out = path.join(process.cwd(), "evidence", "classification");
  fs.mkdirSync(out, { recursive: true });
  try {
    await page.goto(`${WIKI_BASE}/pages/viewpage.action?pageId=${PAGE_ID}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(15_000);

    const info = await page.evaluate((appId) => {
      const frames = Array.from(document.querySelectorAll("iframe")).map((f) => {
        const el = f as HTMLIFrameElement;
        const r = el.getBoundingClientRect();
        return { src: el.src.slice(0, 200), id: el.id, name: el.name,
                 w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 && r.height > 0 };
      });
      const ours = frames.filter(f => f.src.includes(appId));
      // anything that smells like a byline / metadata strip
      const byline = Array.from(document.querySelectorAll('[data-testid*="byline"],[data-testid*="content-metadata"],[data-testid*="contributors"]'))
        .map(e => ({ testid: (e as HTMLElement).dataset.testid, text: (e as HTMLElement).innerText.slice(0,200) }));
      const showMore = Array.from(document.querySelectorAll('button,[role="button"]'))
        .map(e => (e as HTMLElement).innerText.trim())
        .filter(t => /show (more|less)|\+\d/i.test(t));
      return { totalFrames: frames.length, ourFrames: ours, allFrameSrcs: frames.map(f=>f.src.slice(0,120)),
               byline, showMore, title: document.title };
    }, APP);

    fs.writeFileSync(path.join(out, "diagnose.json"), JSON.stringify(info, null, 2));
    console.log(JSON.stringify(info, null, 2).slice(0, 4000));
    await page.screenshot({ path: path.join(out, "diagnose-full.png"), fullPage: false });
  } finally { await ctx.close(); }
});
