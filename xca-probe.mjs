// Standalone probe: does ONE global:fullPage module actually render in both
// Jira and Confluence, and what does its context say about where it is?
// Run: node xca-probe.mjs [routePrefix]
import { chromium } from "playwright";
import fs from "node:fs";

const USER_DATA_DIR = new URL("./.auth/profile", import.meta.url).pathname;
const SITE = "https://wolfaenpak.atlassian.net";
const INSTALL_ID = process.env.INSTALL_ID ?? "4499bb45-66bf-46bd-9efd-37f5a4f6385a";
const PREFIX = process.argv[2] ?? "delivery-cockpit";
const OUT = new URL("./evidence/xca/", import.meta.url).pathname;

fs.mkdirSync(OUT, { recursive: true });

const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
  headless: true,
  channel: "chrome",
  viewport: { width: 1440, height: 900 },
  args: ["--no-first-run", "--no-default-browser-check"],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());

const errors = [];
page.on("console", (m) => {
  if (["error", "warning"].includes(m.type())) errors.push(`[${m.type()}] ${m.text().slice(0, 400)}`);
});
page.on("pageerror", (e) => errors.push(`[pageerror] ${String(e).slice(0, 400)}`));

async function probe(label, url) {
  console.log(`\n=== ${label} ===\n${url}`);
  errors.length = 0;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch((e) => console.log("goto err", String(e).slice(0, 200)));
  await page.waitForTimeout(18000);
  console.log("landed on:", page.url());
  if (/id\.atlassian\.com|\/login/.test(page.url())) {
    console.log("!! REDIRECTED TO LOGIN — session dead");
    return;
  }
  await page.screenshot({ path: `${OUT}${label}.png`, fullPage: true });

  let found = false;
  for (const f of page.frames()) {
    let txt = "";
    try {
      txt = await f.evaluate(() => document.body?.innerText ?? "");
    } catch {
      continue;
    }
    if (txt.includes("Delivery Cockpit")) {
      console.log(`--- RENDERED in frame: ${f.url().slice(0, 110)}`);
      console.log(txt.slice(0, 2500));
      fs.writeFileSync(`${OUT}${label}.txt`, txt);
      found = true;
      break;
    }
  }
  if (!found) console.log("--- app content NOT found");

  if (errors.length) {
    console.log(`--- CONSOLE (${errors.length}) ---`);
    for (const e of [...new Set(errors)].slice(0, 25)) console.log("   ", e);
  } else {
    console.log("--- no console errors captured");
  }
}

await probe("fullpage-url", `${SITE}/apps/full-page/${INSTALL_ID}/${PREFIX}`);

await ctx.close();
