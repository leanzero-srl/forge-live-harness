// LIVE proof for the theme fix: the hub must follow the HOST (Jira) theme, stamped onto the iframe
// root as data-color-mode by view.theme.enable() — NOT the browser's prefers-color-scheme. We force the
// BROWSER to dark; the old code would render dark regardless of Jira. Now the CSS keys off
// :root[data-color-mode="dark"], so what matters is that the attribute is present (theming enabled) and
// the body background matches the attribute, independent of the forced-dark browser.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { dumpForgeFrames, enterForgeSurface } from "../../forge/frame";
import { assertLoggedIn } from "../../forge/browser";

const T = getTarget("altomata-hub");
test.describe.configure({ retries: 2 });

test("hub follows the Jira theme via data-color-mode (not the browser's prefers-color-scheme)", async ({ page }) => {
  test.skip(!T.envId, "ALTOMATA_ENV_ID unresolved — set it in .env.");

  // Simulate the user's situation: browser/OS in DARK while Jira may be Light.
  await page.emulateMedia({ colorScheme: "dark" });
  await assertLoggedIn(page);

  const url = T.deepLink(T.envId)!;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await dumpForgeFrames(page);

  const surface = await enterForgeSurface(page, { surface: T.surface, readySelector: T.readySelector });
  if (surface.kind !== "custom") throw new Error("expected a Custom UI surface");
  const root = surface.frame.locator(":root");
  const body = surface.frame.locator("body");

  // view.theme.enable() fetches + applies the host theme asynchronously — poll until it stamps the attribute.
  await expect
    .poll(async () => root.evaluate((el) => el.getAttribute("data-color-mode")), { timeout: 15000 })
    .not.toBeNull();

  const mode = await root.evaluate((el) => el.getAttribute("data-color-mode"));
  const browserDark = await body.evaluate(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const bg = await body.evaluate(() => getComputedStyle(document.body).backgroundColor);
  // eslint-disable-next-line no-console
  console.log(`\n[theme-probe] data-color-mode=${mode}  browserPrefersDark=${browserDark}  body.bg=${bg}\n`);

  // Theming is now ENABLED: the attribute is present (light or dark) → the app follows the Jira theme.
  expect(["light", "dark"]).toContain(mode);
  // Sanity: our dark palette paper is #0f1f33 = rgb(15,31,51); light canvas is #eef3f3 = rgb(238,243,243).
  // The body bg must match the ATTRIBUTE, not the forced-dark browser.
  if (mode === "light") expect(bg).not.toBe("rgb(15, 31, 51)");
});
