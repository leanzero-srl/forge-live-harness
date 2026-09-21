// LZ770B A2-UI — Jira moved the field the user had saved: Jira wins, and the UI SAYS SO, once.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz770b";
const BED = JSON.parse(fs.readFileSync(`${OUT}/bed.json`, "utf8"));
const PLAN = "[harness-test] LZ770B saved-edit bed";
const LEAF = BED.l1;
test.describe.configure({ retries: 0, timeout: 600_000 });

const bodyText = async (f: any) => (await f.locator("body").textContent().catch(() => "")) || "";
const TOAST_RE = /Jira changed the due date on WFH-\d+ after you had edited it — Jira's value was kept and your edit was dropped\./;

test("LZ770B A2-UI: the dropped edit is named in a toast, exactly once", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  const open = async () => {
    await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
    const s = await enterForgeSurface(page, { surface: "custom" });
    const f = s.kind === "custom" ? s.frame : null; if (!f) throw new Error("no frame");
    await page.waitForTimeout(6000);
    await f.getByText(PLAN, { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(4000);
    if (!/Gantt/i.test(await bodyText(f))) await f.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
    await page.waitForTimeout(4000);
    await f.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
    await page.waitForTimeout(3500);
    return f;
  };
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  let frame = await open();

  // Re-index through the BUTTON (the confirm names the risk), then watch for the toast.
  await frame.getByRole("button", { name: /^Re-index/i }).first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/a2-01-confirm.png` });
  await frame.getByRole("button", { name: /^Re-index$/ }).last().click();

  let toastSeen: string | null = null;
  for (let i = 0; i < 40; i++) {
    const t = (await bodyText(frame)).replace(/\s+/g, " ");
    const m = t.match(/Jira changed the [^.]*dropped\./);
    if (m) { toastSeen = m[0]; break; }
    await page.waitForTimeout(1000);
  }
  console.log("TOAST", toastSeen ?? "NONE");
  await page.screenshot({ path: `${OUT}/a2-02-toast.png` });
  expect(toastSeen, "the drop is named in a toast").toBeTruthy();
  expect(toastSeen!).toMatch(TOAST_RE);
  expect(toastSeen!).toContain(LEAF);

  const r = frame.locator(`[data-testid="table-row"][data-row-key="${LEAF}"]`).first();
  console.log("ROW_AFTER", await r.getAttribute("data-row-start"), await r.getAttribute("data-row-due"), await r.getAttribute("data-row-duration"));

  // RELOAD — the same stamp must NOT be announced again.
  await page.waitForTimeout(12000);
  await page.reload({ waitUntil: "domcontentloaded" });
  frame = await open();
  await page.waitForTimeout(6000);
  const after = (await bodyText(frame)).replace(/\s+/g, " ");
  const again = after.match(/Jira changed the [^.]*dropped\./);
  console.log("TOAST_AFTER_RELOAD", again?.[0] ?? "NONE (correct)");
  await page.screenshot({ path: `${OUT}/a2-03-after-reload.png` });
  expect(again, "the same drop is not announced twice").toBeNull();
  const r2 = frame.locator(`[data-testid="table-row"][data-row-key="${LEAF}"]`).first();
  console.log("ROW_AFTER_RELOAD", await r2.getAttribute("data-row-start"), await r2.getAttribute("data-row-due"), await r2.getAttribute("data-row-duration"));
});
