import { test } from "@playwright/test";
import { launchHarnessContext } from "../../forge/browser";
import fs from "node:fs"; import path from "node:path";
const URL = "https://wolfaenpak.atlassian.net/wiki/apps/64d08693-b295-4664-9fda-eba81261160f/fae97d3d-443e-4758-8fcf-f60cada4641e/data-classification";
test("dashboard table", async () => {
  const ctx = await launchHarnessContext({ headed: false });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const out = path.join(process.cwd(), "evidence", "classification");
  try {
    await page.goto(URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(20_000);
    // scroll INSIDE the app iframe, which owns its own scroll container
    for (const f of page.frames()) {
      if (!f.url().includes("64d08693")) continue;
      const t = await f.evaluate(() => document.body.innerText).catch(() => "");
      console.log("APP FRAME LEN:", t.length);
      const i = t.indexOf("Source record");
      console.log(i >= 0 ? "TABLE FOUND: " + t.slice(i, i + 420).replace(/\n+/g, " | ")
                         : "NO TABLE. tail: " + t.slice(-300).replace(/\n+/g, " | "));
      await f.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    }
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(out, "dashboard-table.png") });
  } finally { await ctx.close(); }
});
