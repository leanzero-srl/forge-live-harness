// LZ720 live check — items 1, 2, 4, 5: the publish dialog's memory/ordering, the
// published Timeline column, the storyline empty-beats sentence, and the spaces
// refusal standing in the picker's place.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";
const bed = JSON.parse(fs.readFileSync("/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz700/bed.json", "utf8"));
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz720";
fs.mkdirSync(OUT, { recursive: true });
test.describe.configure({ retries: 0, timeout: 2_400_000, mode: "serial" });

test("publish dialog memory + ordering, published timeline, storyline beats, refusal placement", async ({ page }) => {
  const R: any = {};
  await page.setViewportSize({ width: 1700, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.frame;
  const realFrame = async () => (await (await frame.locator(":root").elementHandle())!.ownerFrame())!;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 180_000 });

  // ITEM 4 PRECONDITION: no memory at all. Every remembered space is wiped
  // BEFORE the dialog mounts (it reads localStorage in its load effect).
  R.storageBefore = await (await realFrame()).evaluate(() => {
    const hit = Object.keys(localStorage).filter((k) => k.startsWith("lz.confluence.space."));
    const dump = hit.map((k) => `${k}=${localStorage.getItem(k)}`);
    hit.forEach((k) => localStorage.removeItem(k));
    return dump;
  });
  console.log("STORAGE CLEARED", JSON.stringify(R.storageBefore));

  await frame.locator('[data-testid="plan-card"]').filter({ hasText: bed.tag }).first().click();
  await page.waitForTimeout(18000);
  const body = async () => (await frame.locator("body").textContent().catch(() => "")) || "";
  R.appVersion = ((await body()).match(/v?\d+\.\d+\.\d+/) || ["(none)"])[0];
  await frame.getByRole("button", { name: /^Planning$/i }).first().click();
  await page.waitForTimeout(6000);
  await frame.getByRole("button", { name: /^Sponsor reports$/i }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(8000);
  await frame.locator('[data-testid="sponsor-reports"]').first().waitFor({ state: "visible", timeout: 60_000 });
  await page.screenshot({ path: `${OUT}/a00-reports.png` });

  const openReport = async (name: string) => {
    const entry = frame.getByRole("button", { name: new RegExp(name) }).first();
    if (await entry.count()) await entry.dispatchEvent("click");
    else await frame.getByText(name, { exact: false }).first().dispatchEvent("click");
    await page.waitForTimeout(7000);
  };
  const dlg = () => frame.locator('[data-testid="publish-confluence-dialog"]').first();
  const openDialog = async () => {
    await frame.locator('[data-testid="publish-to-confluence"]').first().dispatchEvent("click");
    await dlg().waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(7000);   // spaces read
  };
  const dialogState = async () => {
    const trigger = dlg().getByRole("combobox").first();
    return {
      triggerText: (await trigger.innerText().catch(() => "(none)")).replace(/\s+/g, " ").trim(),
      publishDisabled: await dlg().locator("button").filter({ hasText: /^Publish$|^Publish again$/ }).first().isDisabled().catch(() => null),
      hasCombobox: await trigger.count(),
      dialogText: ((await dlg().textContent()) || "").replace(/\s+/g, " ").trim(),
    };
  };

  // ───────── ITEM 4a: a dialog with NO memory
  await openReport("LZ720 sponsor report");
  await page.screenshot({ path: `${OUT}/a01-sponsor-detail.png` });
  await openDialog();
  R.noMemory = await dialogState();
  await page.screenshot({ path: `${OUT}/a02-dialog-no-memory.png` });
  console.log("NO MEMORY", JSON.stringify(R.noMemory));
  // the option ORDER, as offered
  await dlg().getByRole("combobox").first().dispatchEvent("click");
  await page.waitForTimeout(1500);
  R.options = await frame.getByRole("option").allInnerTexts();
  await page.screenshot({ path: `${OUT}/a03-options.png` });
  console.log("OPTIONS", JSON.stringify(R.options));
  await frame.getByRole("option", { name: /LZ publish scratch/ }).first().dispatchEvent("click");
  await page.waitForTimeout(1200);
  R.afterPick = await dialogState();
  await page.screenshot({ path: `${OUT}/a04-picked.png` });
  console.log("AFTER PICK", JSON.stringify(R.afterPick));

  // ───────── ITEM 1a: publish the sponsor report
  await dlg().locator("button").filter({ hasText: /^Publish$|^Publish again$/ }).first().dispatchEvent("click");
  let toast = "(none)";
  for (let i = 0; i < 160; i++) {
    const t = (await body()).replace(/\s+/g, " ");
    const m = t.match(/(Published to [^·]+|Updated the page in [^·]+)·\s*Open page/);
    if (m) { toast = m[0]; break; }
    const e = t.match(/[A-Z][^.]{10,180}(?:Confluence|space)[^.]{0,120}\./);
    if (e && /cannot|refused|no longer|permission|unavailable/i.test(e[0])) { toast = "ERROR: " + e[0]; break; }
    await page.waitForTimeout(500);
  }
  R.sponsorToast = toast;
  R.sponsorPageUrl = await frame.locator("a").filter({ hasText: /^Open page$/ }).first().getAttribute("href").catch(() => null);
  await page.screenshot({ path: `${OUT}/a05-sponsor-toast.png` });
  await page.waitForTimeout(4000);
  R.sponsorChip = await frame.locator('[data-testid="confluence-published-chip"]').first().innerText().catch(() => "(none)");
  R.sponsorOpenLink = await frame.locator("a").filter({ hasText: /Open in Confluence/ }).first().getAttribute("href").catch(() => null);
  console.log("SPONSOR PUBLISH", JSON.stringify({ toast: R.sponsorToast, url: R.sponsorPageUrl, chip: R.sponsorChip, open: R.sponsorOpenLink }));

  // ───────── ITEM 1b: the DOWNLOAD still draws the bar and keeps the dates.
  // Never click the anchor in a headless run (it tears the context down) — the
  // Blob text is captured from a stubbed createObjectURL instead.
  const rf = await realFrame();
  await rf.evaluate(() => {
    (window as any).__lzBlobs = [];
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b: any) => { (window as any).__lzBlobPending = b.text().then((t: string) => (window as any).__lzBlobs.push(t)); return orig(b); };
    document.addEventListener("click", (e) => { const a = (e.target as HTMLElement)?.closest?.("a[download]"); if (a) e.preventDefault(); }, true);
  });
  await frame.getByRole("button", { name: /Download complete HTML report/i }).first().dispatchEvent("click");
  await page.waitForTimeout(6000);
  R.downloadHtml = await rf.evaluate(async () => { await (window as any).__lzBlobPending; return ((window as any).__lzBlobs || [])[0] || ""; });
  R.downloadBytes = R.downloadHtml.length;
  R.downloadTimelineCells = (R.downloadHtml.split("<tbody>")[1] || "").split("</tbody>")[0]
    .split("</tr>").filter(Boolean).map((tr: string) => (tr.split("<td>").at(-1) || "").replace("</td>", ""));
  console.log("DOWNLOAD BYTES", R.downloadBytes);
  console.log("DOWNLOAD CELLS", JSON.stringify(R.downloadTimelineCells.slice(0, 6), null, 1));

  // ───────── ITEM 4b: a REMEMBERED space pre-fills (written by the publish above)
  R.storageAfterPublish = await rf.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("lz.confluence.space.")).map((k) => `${k}=${localStorage.getItem(k)}`));
  console.log("STORAGE AFTER", JSON.stringify(R.storageAfterPublish));
  await openReport("LZ720 storyline report");
  await page.screenshot({ path: `${OUT}/a06-storyline-detail.png` });
  // the on-screen storyline document's BEATS block (item 2, on screen)
  R.storylineDocText = ((await frame.locator('[data-testid="storyline-report-doc"]').first().textContent().catch(() => null)) || (await body())).replace(/\s+/g, " ");
  R.beatsOnScreen = (R.storylineDocText.match(/The beats that matter\s*(.{0,220})/) || ["", "(not found)"])[1];
  R.beatRowCount = await frame.locator('[data-testid="storyline-report-beat"]').count();
  console.log("BEATS ON SCREEN", JSON.stringify({ beatsOnScreen: R.beatsOnScreen, beatRowCount: R.beatRowCount }));
  await openDialog();
  R.remembered = await dialogState();
  await page.screenshot({ path: `${OUT}/a07-dialog-remembered.png` });
  console.log("REMEMBERED", JSON.stringify(R.remembered));

  // ───────── ITEM 2: publish the storyline report
  await dlg().locator("button").filter({ hasText: /^Publish$|^Publish again$/ }).first().dispatchEvent("click");
  toast = "(none)";
  for (let i = 0; i < 160; i++) {
    const t = (await body()).replace(/\s+/g, " ");
    const m = t.match(/(Published to [^·]+|Updated the page in [^·]+)·\s*Open page/);
    if (m) { toast = m[0]; break; }
    await page.waitForTimeout(500);
  }
  R.storylineToast = toast;
  R.storylinePageUrl = await frame.locator("a").filter({ hasText: /^Open page$/ }).first().getAttribute("href").catch(() => null);
  await page.screenshot({ path: `${OUT}/a08-storyline-toast.png` });
  await page.waitForTimeout(4000);
  R.storylineChip = await frame.locator('[data-testid="confluence-published-chip"]').first().innerText().catch(() => "(none)");
  console.log("STORYLINE PUBLISH", JSON.stringify({ toast: R.storylineToast, url: R.storylinePageUrl, chip: R.storylineChip }));

  // ───────── ITEM 5: the spaces read FAILS — the refusal stands in the picker's place
  await (await realFrame()).evaluate(() => {
    (window as any).__lzPlatformCalls = [];
    (window as any).__lzInvoke = async (name: string) => {
      (window as any).__lzPlatformCalls.push(name);
      throw new Error(`There was an error invoking the function - Resolver has no definition for '${name}'`);
    };
  });
  await openDialog();
  const rf2 = await realFrame();
  R.refusalGeom = await rf2.evaluate(() => {
    const d = document.querySelector('[data-testid="publish-confluence-dialog"]') as HTMLElement;
    const label = d?.querySelector("#lz-confluence-space-label") as HTMLElement | null;
    const group = label?.parentElement as HTMLElement | null;
    const alert = d?.querySelector('[role="alert"]') as HTMLElement | null;
    const box = (e: HTMLElement | null) => (e ? (({ x, y, width, height, bottom, top }) => ({ x, y, width, height, bottom, top }))(e.getBoundingClientRect()) : null);
    const order = [...(d?.children || [])].map((c) => `${c.tagName}:${(c.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40)}`);
    return {
      labelText: label?.textContent || null, label: box(label), alert: box(alert),
      alertText: (alert?.textContent || "").replace(/\s+/g, " ").trim(),
      alertInsideGroup: !!(group && alert && group.contains(alert)),
      groupChildren: [...(group?.children || [])].map((c) => `${c.tagName}#${c.id || ""}:${(c.textContent || "").replace(/\s+/g, " ").trim().slice(0, 50)}`),
      comboboxes: d?.querySelectorAll('[role="combobox"]').length ?? -1,
      dialogChildOrder: order,
      calls: (window as any).__lzPlatformCalls,
    };
  });
  await page.screenshot({ path: `${OUT}/a09-refusal.png` });
  await dlg().locator("button").filter({ hasText: /^Cancel$/ }).first().dispatchEvent("click").catch(() => {});
  console.log("REFUSAL", JSON.stringify(R.refusalGeom, null, 1));

  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(R, null, 2));
  expect(1).toBe(1);
});
