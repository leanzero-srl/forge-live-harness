import { test } from "@playwright/test";
import { launchHarnessContext } from "../../forge/browser";
import { BASE_URL } from "../../config/env";
import fs from "node:fs"; import path from "node:path";
const APP = "64d08693-b295-4664-9fda-eba81261160f";
const URL = process.env.DASH_URL
  ?? `${BASE_URL}/wiki/apps/${APP}/data-classification`;
test("classification dashboard renders", async () => {
  const ctx = await launchHarnessContext({ headed: false });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const out = path.join(process.cwd(), "evidence", "classification");
  fs.mkdirSync(out, { recursive: true });
  try {
    await page.goto(URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(20_000);
    const txt = await page.evaluate(() => document.body.innerText);
    console.log("URL:", page.url());
    console.log("TOP TEXT:", txt.slice(0, 400).replace(/\n+/g, " | "));
    // read inside our app frame too
    for (const f of page.frames()) {
      if (!f.url().includes(APP)) continue;
      const t = await f.evaluate(() => document.body.innerText).catch(() => "");
      if (t.trim()) console.log("FRAME TEXT:", t.slice(0, 600).replace(/\n+/g, " | "));
    }
    await page.screenshot({ path: path.join(out, "dashboard.png"), fullPage: false });
  } finally { await ctx.close(); }
});
