// PERSISTENT regression journey for three of the four reported defects (the fourth,
// the Apply write path, has its own journey: journey-apply-write-tpp).
//
//   A. "when we create a new plan we are asking for a jql for issue source. when in an
//       existing plan i am not able to change/update the jql for the issue source"
//   B. "when switching the plan on Day it seems a discrepancy between the start date and
//       the real representation. It must be under that date"
//   C. "When click on the ticket in a connection I want to be able to make the prompt
//       disappear after I click whenever in the window and not only on x"
//
// A is exercised against the reporter's own "test" plan with a reversible edit; B and C
// are read-only on the LZPT bed. wolfaenpak is a test env (owner-authorised).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
test.describe.configure({ retries: 1, timeout: 600_000 });

async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

async function open(page: any) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  return frame;
}
async function openPlan(page: any, frame: any, name: string, tab: RegExp) {
  await frame.getByText(name, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt|Table|Dashboard/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2000);
  await frame.getByRole("button", { name: tab }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
}

// --- A: the plan's issue source is editable after creation -------------------
test("A: an existing plan's JQL source can be read and changed from inside the plan", async ({ page }) => {
  const frame = await open(page);
  await openPlan(page, frame, "test", /^Gantt/i);

  // The chip that says where this plan's issues come from — the entry point that
  // did not exist at all (updatePlan accepted a sources change; nothing called it).
  const chip = frame.locator('[data-testid="plan-source-chip"]').first();
  await chip.waitFor({ state: "visible", timeout: 20_000 });
  console.log("source chip label:", await chip.textContent());
  expect((await chip.textContent()) || "", "chip names the source type").toMatch(/JQL|Board|Project/i);

  await chip.click();
  const modal = frame.locator('[data-testid="plan-sources-modal"]').first();
  await modal.waitFor({ state: "visible", timeout: 15_000 });

  const jql = frame.locator('[data-testid="plan-source-jql"]').first();
  const ORIGINAL = await jql.inputValue();
  console.log("ORIGINAL jql:", JSON.stringify(ORIGINAL));
  expect(ORIGINAL.trim().length, "the modal is prefilled with the plan's real JQL").toBeGreaterThan(0);

  const save = frame.locator('[data-testid="plan-sources-save"]').first();
  expect(await save.isDisabled(), "Save is disabled until something changes").toBe(true);

  try {
    // A reversible, semantically identical edit: same issues, different text.
    const EDITED = `${ORIGINAL.trim()} ORDER BY created ASC`;
    await jql.fill(EDITED);
    await page.waitForTimeout(2500); // live validation settles
    expect(await bodyText(frame), "live JQL validation ran").toMatch(/✓ Valid|Validating/);
    expect(await frame.locator('[data-testid="plan-sources-notice"]').count(),
      "the re-index consequence is stated before saving").toBeGreaterThan(0);
    expect(await save.isDisabled(), "Save enables once the source changes").toBe(false);

    await save.click();
    await page.waitForTimeout(20_000); // save + re-index

    // The change PERSISTED: reopen the chip and read it back.
    await frame.locator('[data-testid="plan-source-chip"]').first().click();
    await frame.locator('[data-testid="plan-sources-modal"]').first().waitFor({ state: "visible", timeout: 15_000 });
    const readBack = await frame.locator('[data-testid="plan-source-jql"]').first().inputValue();
    console.log("read back:", JSON.stringify(readBack));
    expect(readBack.trim(), "the edited JQL was saved to the plan").toBe(EDITED);
    // and the plan still holds its issues (the re-index found the same set)
    const count = (await bodyText(frame)).match(/(\d+)\s+issues?/);
    console.log("issue count after re-index:", count && count[1]);
    expect(Number(count ? count[1] : 0), "the plan still has its issues").toBeGreaterThan(0);
  } finally {
    // Restore the original JQL.
    const m = frame.locator('[data-testid="plan-sources-modal"]');
    if ((await m.count()) === 0) {
      await frame.locator('[data-testid="plan-source-chip"]').first().click().catch(() => {});
      await page.waitForTimeout(2000);
    }
    await frame.locator('[data-testid="plan-source-jql"]').first().fill(ORIGINAL).catch(() => {});
    await page.waitForTimeout(2500);
    await frame.locator('[data-testid="plan-sources-save"]').first().click().catch(() => {});
    await page.waitForTimeout(20_000);
    console.log("restored source to:", JSON.stringify(ORIGINAL));
  }
});

// --- B: Day zoom labels the START of each day column -------------------------
test("B: at Day zoom a bar begins under the day number it starts on", async ({ page }) => {
  const frame = await open(page);
  await openPlan(page, frame, "LZPT Scenarios", /^Gantt/i);

  await frame.getByRole("button", { name: "Day", exact: true }).first().click();
  await page.waitForTimeout(3000);

  const measured = await frame.locator(":root").evaluate(() => {
    const bars = Array.from(document.querySelectorAll('[data-testid="gantt-bar"][data-parent="false"]')) as HTMLElement[];
    for (const bar of bars) {
      const br = bar.getBoundingClientRect();
      if (br.width < 20) continue;
      // Which day column does the bar's left edge fall in?
      const cols = Array.from(document.querySelectorAll("[data-day]")) as HTMLElement[];
      for (const col of cols) {
        const cr = col.getBoundingClientRect();
        if (cr.height > 40) continue;            // the day header strip only
        if (!col.textContent?.trim()) continue;  // labelled columns only
        if (br.left >= cr.left - 1 && br.left < cr.right) {
          const range = document.createRange();
          range.selectNodeContents(col);
          const gr = range.getBoundingClientRect();
          return {
            key: bar.dataset.key, day: col.dataset.day, label: col.textContent.trim(),
            barLeft: br.left, colLeft: cr.left, colWidth: cr.width, labelLeft: gr.left,
          };
        }
      }
    }
    return null;
  });

  console.log("day-zoom alignment:", JSON.stringify(measured));
  expect(measured, "found a bar and the day column it starts in").toBeTruthy();
  const m = measured!;
  // The number sits at the START of its column, next to the bar edge — not centred,
  // which put it half a column to the right and read as an off-by-one.
  const gap = Math.abs(m.labelLeft - m.barLeft);
  console.log(`|label.x - bar.x| = ${gap.toFixed(1)}px; column is ${m.colWidth}px wide`);
  expect(gap, "the day number is at the bar's start edge, not the column centre").toBeLessThan(m.colWidth / 3);
});

// --- C: the date popup dismisses on a click anywhere outside it --------------
test("C: the date popup closes on an outside click, not only via the x", async ({ page }) => {
  const frame = await open(page);
  await openPlan(page, frame, "LZPT Scenarios", /^Gantt/i);

  const bar = frame.locator('[data-testid="gantt-bar"][data-parent="false"]').first();
  await bar.scrollIntoViewIfNeeded().catch(() => {});
  const box = await bar.boundingBox();
  expect(box, "found a leaf bar to click").toBeTruthy();

  const editor = frame.locator('[data-testid="date-editor"]');
  const openEditor = async () => {
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(1200);
    return (await editor.count()) > 0;
  };

  expect(await openEditor(), "clicking a bar opens the date popup").toBe(true);
  const editorBox = await editor.first().boundingBox();
  console.log("editor box:", JSON.stringify(editorBox));

  // Click somewhere unambiguously outside the popup and ON SCREEN. The "Showing N of N"
  // strip is inert text in the sidebar, so a dismissal here can only come from the
  // outside-click handler — clicking another bar would just reopen the popup and read
  // as a pass/fail for the wrong reason.
  const anchor = frame.getByText(/Showing \d+ of \d+/).first();
  const ab = await anchor.boundingBox();
  console.log("outside-click target:", JSON.stringify(ab));
  expect(ab, "found an inert on-screen element to click").toBeTruthy();
  await page.mouse.click(ab!.x + ab!.width / 2, ab!.y + ab!.height / 2);
  await page.waitForTimeout(900);
  if ((await editor.count()) > 0) await page.screenshot({ path: "test-results/editor-outside-click-failed.png" });
  expect(await editor.count(), "an outside click dismissed the popup").toBe(0);

  // And it is still dismissible the other ways (no regression).
  expect(await openEditor(), "popup reopens").toBe(true);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  expect(await editor.count(), "Escape still dismisses").toBe(0);

  // The popup renders fully inside the viewport — the same dead ref that broke the
  // outside-click also disabled the clamp that keeps it on screen.
  expect(await openEditor(), "popup reopens again").toBe(true);
  const geom = await frame.locator(":root").evaluate(() => {
    const el = document.querySelector('[data-testid="date-editor"]') as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, right: r.right, y: r.y, bottom: r.bottom, vw: window.innerWidth, vh: window.innerHeight };
  });
  console.log("popup geometry:", JSON.stringify(geom));
  expect(geom!.x, "popup left edge on screen").toBeGreaterThanOrEqual(0);
  expect(geom!.right, "popup right edge on screen").toBeLessThanOrEqual(geom!.vw + 1);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  // Nothing was edited, so nothing to restore — but assert the bed is clean anyway.
  expect(/Apply \d+ change/i.test(await bodyText(frame)), "no change was staged").toBe(false);
});
