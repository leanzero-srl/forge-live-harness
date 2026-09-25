import { test } from "@playwright/test";
import { launchHarnessContext } from "../forge/browser";
test("probe actions menu on issue modal", async () => {
  test.setTimeout(120_000);
  const ctx = await launchHarnessContext({ headed: false });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  try {
    await page.goto("https://wolfaenpak.atlassian.net/browse/JT-9", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    const doneBtn = page.getByRole("button", { name: /^done$/i }).first();
    if (await doneBtn.count()) { await doneBtn.click().catch(()=>{}); await page.waitForTimeout(1000); }
    const buttons = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => {
      const r = (b as HTMLElement).getBoundingClientRect();
      return { label: b.getAttribute('aria-label'), text: (b.innerText||'').trim(), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }).filter(b => b.y < 260 && b.y > 60 && b.w > 0));
    console.log(JSON.stringify(buttons, null, 1));
  } finally { await ctx.close(); }
});
