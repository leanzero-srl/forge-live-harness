import { test } from "@playwright/test";
import { launchHarnessContext } from "../../forge/browser";
import { BASE_URL } from "../../config/env";
const APP = "64d08693-b295-4664-9fda-eba81261160f";
test("find the app link in the Apps menu", async () => {
  const ctx = await launchHarnessContext({ headed: false });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  try {
    // Confluence lists installed app pages here
    await page.goto(`${BASE_URL}/wiki/home`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    // open the Apps nav item, then enumerate what appears
    const clicked = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('button,a,[role="button"]'))
        .find(e => (e.textContent||'').trim() === 'Apps');
      if (el) { (el as HTMLElement).click(); return true; }
      return false;
    });
    console.log("clicked Apps:", clicked);
    await page.waitForTimeout(4000);
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a')).map(a => ({ t: (a.innerText||'').trim(), h: a.getAttribute('href')||'' }))
        .filter(x => x.h.includes('/wiki/apps') || /classification/i.test(x.t)));
    console.log("LINKS:", JSON.stringify(links.slice(0, 25), null, 1));
  } finally { await ctx.close(); }
});
