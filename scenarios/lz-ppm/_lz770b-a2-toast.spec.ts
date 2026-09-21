// LZ770B A2-UI — the editDrops stamp must be ANNOUNCED on plan open, exactly once.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz770b";
const PLAN = "[harness-test] LZ770B saved-edit bed";
test.describe.configure({ retries: 0, timeout: 600_000 });
const bodyText = async (f: any) => (await f.locator("body").textContent().catch(() => "")) || "";

test("LZ770B A2-UI: the drop is named once", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  const open = async () => {
    await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
    const s = await enterForgeSurface(page, { surface: "custom" });
    const f = s.kind === "custom" ? s.frame : null; if (!f) throw new Error("no frame");
    await page.waitForTimeout(6000);
    await f.getByText(PLAN, { exact: false }).first().click().catch(() => {});
    return f;
  };
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  const frame = await open();
  let seen: string | null = null;
  for (let i = 0; i < 30; i++) {
    const m = (await bodyText(frame)).replace(/\s+/g, " ").match(/Jira changed the [^.]*dropped\./);
    if (m) { seen = m[0]; break; }
    await page.waitForTimeout(1000);
  }
  console.log("TOAST_1", seen ?? "NONE");
  await page.screenshot({ path: `${OUT}/a2-toast-1.png` });
  expect(seen, "the drop is named").toBeTruthy();

  await page.waitForTimeout(12000);
  await page.reload({ waitUntil: "domcontentloaded" });
  const f2 = await open();
  await page.waitForTimeout(8000);
  const again = (await bodyText(f2)).replace(/\s+/g, " ").match(/Jira changed the [^.]*dropped\./);
  console.log("TOAST_2(after reload)", again?.[0] ?? "NONE (correct)");
  await page.screenshot({ path: `${OUT}/a2-toast-2.png` });
  expect(again, "not announced twice").toBeNull();
});
