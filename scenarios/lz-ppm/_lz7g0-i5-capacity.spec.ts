// LZ7G0 item 5 — the CAPACITY IDENTITY in the sponsor report (cb1848e3).
// Captures an LZPT archive WITH the capacity section, then reads the Capacity
// rows on BOTH readers (in-app receipt + the downloaded HTML, captured at
// URL.createObjectURL — never click the anchor) and checks that every row prints
// a PERSON NAME (never the `person:52:2026-10-05` composite handle), a status
// WORD (never the raw enum), and the singular "1 unknown estimate" where it
// applies. Deletes the report afterwards.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7g0";
const PLAN = "LZPT Scenarios", REPORT = "LZ7G0 capacity archive";
const HANDLE = /person:\d+:|person:[a-z0-9]+:/i;
const RAW_ENUM = /\b(overloaded|at-capacity|capacity-unknown|effort-unknown|no-capacity|available)\b/;
const RAW_REASON = /\b(overdue-remaining-effort|inverted-dates|dates-unavailable|working-calendar-unavailable|schedule-span-too-long|no-working-days)\b/;
test.describe.configure({ retries: 0, timeout: 3_000_000 });
const txt = async (l: any) => ((await l.textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");

test("G5: capacity identity on both readers", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  const real: any = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  await page.waitForTimeout(9000);
  console.log("SHELL_REV", ((await bodyText(frame)).match(/rev\s*v?([\d.]+)/) || [])[1]);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(10000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  console.log("STAGED_ON_OPEN", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await frame.getByRole("button", { name: /^Planning$/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await frame.getByRole("button", { name: /Sponsor reports?/i }).first().click().catch(() => {});
  const sec = frame.locator('[data-testid="sponsor-reports"]');
  await sec.waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(4000);
  console.log("REPORTS_LIST_BEFORE", (await txt(sec)).slice(0, 400));

  const capBox = sec.locator("label").filter({ hasText: /Include captured plan capacity/i }).first();
  console.log("CAP_CHECKBOX_COUNT", await capBox.count());
  const checkedBefore = await real.evaluate(() => {
    const l = Array.from(document.querySelectorAll("label")).find((e) => /Include captured plan capacity/i.test(e.textContent || ""));
    const b = l?.querySelector('button,[role="checkbox"],input');
    return b ? { tag: b.tagName, aria: b.getAttribute("aria-checked"), checked: (b as any).checked ?? null, title: b.getAttribute("title") } : null;
  });
  console.log("CAP_CHECKBOX_STATE", JSON.stringify(checkedBefore));
  if (!(checkedBefore && (checkedBefore.aria === "true" || checkedBefore.checked === true))) {
    await capBox.dispatchEvent("click").catch((e: any) => console.log("CAP_CLICK_ERR", String(e).slice(0, 80)));
    await page.waitForTimeout(1500);
  }
  console.log("CAP_CHECKBOX_AFTER", JSON.stringify(await real.evaluate(() => {
    const l = Array.from(document.querySelectorAll("label")).find((e) => /Include captured plan capacity/i.test(e.textContent || ""));
    const b = l?.querySelector('button,[role="checkbox"],input');
    return b ? { aria: b.getAttribute("aria-checked"), checked: (b as any).checked ?? null } : null;
  })));
  console.log("CAP_WINDOW", (await txt(sec)).match(/Report capacity starts[^]{0,120}/)?.[0]);
  await page.screenshot({ path: `${OUT}/g5-0-form.png`, fullPage: true });

  await sec.getByLabel("Report name").fill(REPORT);
  await sec.getByRole("button", { name: /Capture sponsor report/i }).first().click();
  for (let i = 0; i < 200; i++) {
    const t = await txt(sec);
    if (/Immutable report captured|Report captured and verified/i.test(t)) break;
    await page.waitForTimeout(3000);
  }
  await page.waitForTimeout(6000);
  console.log("CAPTURE_NOTICE", (await txt(sec)).slice(0, 400));
  await page.screenshot({ path: `${OUT}/g5-1-captured.png`, fullPage: true });
  console.log("CAPACITY_BLOCK", await txt(frame.locator('[data-testid="report-capacity"]').first()));

  const secBtn = frame.locator("button").filter({ hasText: /^(Timeline|Targets|Changes|Capacity) \(\d+\)$/ }).first();
  console.log("SECTION_BTN", await txt(secBtn));
  await secBtn.click().catch(() => {});
  await page.waitForTimeout(1500);
  const opts = await frame.locator('[role="option"]').allTextContents().catch(() => []);
  console.log("SECTION_OPTIONS", JSON.stringify(opts));
  await frame.locator('[role="option"]').filter({ hasText: /^Capacity \(\d+\)$/i }).first().dispatchEvent("click").catch((e: any) => console.log("OPT_ERR", String(e).slice(0, 120)));
  await page.waitForTimeout(9000);
  const readPage = async () => await frame.locator('table[aria-label="Report preview"] tbody tr').evaluateAll((trs: any[]) => trs.map((tr) => ({
    identity: (tr.querySelector("th")?.textContent || "").replace(/\s+/g, " ").trim(),
    cells: Array.from(tr.querySelectorAll("td")).map((td: any) => (td.textContent || "").replace(/\s+/g, " ").trim()) })));
  const all: any[] = [];
  for (let p = 0; p < 12; p++) {
    console.log("PAGE_LINE", (await bodyText(frame)).match(/Page \d+ of \d+ · \d+ rows? in this section/)?.[0]);
    const rows = await readPage();
    all.push(...rows);
    await page.screenshot({ path: `${OUT}/g5-2-receipt-p${p}.png`, fullPage: true });
    const next = frame.locator("button").filter({ hasText: /^Next report page$/ }).first();
    if (!(await next.count()) || (await next.isDisabled().catch(() => true))) break;
    await next.click(); await page.waitForTimeout(5000);
  }
  console.log("RECEIPT_CAPACITY_ROWS", JSON.stringify(all, null, 1));
  const flat = JSON.stringify(all);
  console.log("RECEIPT_HAS_HANDLE", HANDLE.test(flat), "RECEIPT_HAS_RAW_ENUM", RAW_ENUM.test(flat), "RECEIPT_HAS_RAW_REASON", RAW_REASON.test(flat));
  console.log("RECEIPT_SINGULAR_HITS", JSON.stringify((flat.match(/\b1 unknown estimates?\b/g) || [])));
  console.log("RECEIPT_PLURAL_HITS", JSON.stringify([...new Set(flat.match(/\b\d+ unknown estimates?\b/g) || [])]));

  // ---------- the DOWNLOAD (blob, never the anchor) ----------
  await real.evaluate(() => {
    (window as any).__blobs = [];
    const mk = URL.createObjectURL.bind(URL);
    (URL as any).createObjectURL = (b: any) => { (window as any).__blobs.push(b); return mk(b); };
    (URL as any).revokeObjectURL = () => {};
    const proto: any = HTMLAnchorElement.prototype;
    const orig = proto.click;
    proto.click = function () { if (this.download) return; return orig.apply(this, arguments as any); };
  });
  await frame.locator("button").filter({ hasText: /Download complete HTML report/i }).first().dispatchEvent("click").catch((e: any) => console.log("DL_ERR", String(e).slice(0, 100)));
  for (let i = 0; i < 60; i++) { if (await real.evaluate(() => ((window as any).__blobs || []).length)) break; await page.waitForTimeout(2000); }
  const files: string[] = await real.evaluate(async () => { const out: string[] = []; for (const b of (window as any).__blobs || []) { try { out.push(await b.text()); } catch (e) { out.push(`(err ${e})`); } } return out; });
  const html = files.sort((a, b) => b.length - a.length)[0] || "";
  fs.writeFileSync(`${OUT}/g5-archive.html`, html);
  console.log("DOWNLOAD_BYTES", html.length);
  const rows = html.match(/<tr data-capacity-key="[^"]*">[\s\S]*?<\/tr>/g) || [];
  console.log("DL_CAPACITY_ROW_COUNT", rows.length);
  const dlRows = rows.map((r) => ({ key: (r.match(/data-capacity-key="([^"]*)"/) || [])[1],
    cells: (r.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || []).map((c) => c.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()) }));
  console.log("DL_CAPACITY_ROWS", JSON.stringify(dlRows, null, 1));
  const cellFlat = JSON.stringify(dlRows.map((r) => r.cells));
  console.log("DL_CELLS_HAVE_HANDLE", HANDLE.test(cellFlat), "DL_CELLS_RAW_ENUM", RAW_ENUM.test(cellFlat), "DL_CELLS_RAW_REASON", RAW_REASON.test(cellFlat));
  console.log("DL_PARENTHETICAL_ID", JSON.stringify((cellFlat.match(/\([^)]*\d{3,}[^)]*\)/g) || [])));
  const capSection = (html.match(/<h2>Weekly capacity<\/h2>[\s\S]*?<\/section>/) || [])[0] || "";
  console.log("DL_CAP_SECTION_LEN", capSection.length);
  console.log("DL_UNALLOCATED_ROWS", JSON.stringify((html.match(/<h2>Unallocated remaining effort<\/h2>[\s\S]*?<\/section>/) || [""])[0].replace(/<[^>]*>/g, "|").replace(/\s+/g, " ").slice(0, 900)));
  console.log("DL_AVAILABILITY", JSON.stringify((html.match(/<h2>Included availability assumptions<\/h2>[\s\S]*?<\/section>/) || [""])[0].replace(/<[^>]*>/g, "|").replace(/\s+/g, " ").slice(0, 700)));
  await page.screenshot({ path: `${OUT}/g5-3-downloaded.png`, fullPage: true });

  // ---------- restore ----------
  await frame.locator("button").filter({ hasText: /^Delete report$/ }).first().dispatchEvent("click").catch((e: any) => console.log("DEL_ERR", String(e).slice(0, 90)));
  await page.waitForTimeout(1500);
  await frame.locator("button").filter({ hasText: /^Delete report$/ }).last().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(12000);
  console.log("AFTER_DELETE_REPORTS", (await txt(frame.locator('[data-testid="sponsor-reports"]'))).slice(0, 400));
  await page.screenshot({ path: `${OUT}/g5-4-clean.png`, fullPage: true });
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
});
