// Pipeline demo: an INTENTIONAL failing expectation against a healthy real app
// (lz-ppm), to prove the assess loop emits a SPECIFIC fix-report. Gated behind
// DEMO_FAILURE=1 so the normal suite stays green.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { BASE_URL } from "../../config/env";
import { dumpForgeFrames, enterForgeSurface } from "../../forge/frame";
import { assertLoggedIn } from "../../forge/browser";

const T = getTarget("lz-ppm-dashboard");

test("failure-demo: dashboard should show a Gantt grid (intentional miss)", async ({ page, recorder }) => {
  test.skip(!process.env.DEMO_FAILURE, "Set DEMO_FAILURE=1 to run the intentional-failure demo that exercises the assess loop.");
  const url = T.deepLink(T.envId)!;

  recorder.setTarget({
    product: T.product, app: T.app, appId: T.appId, module: T.module,
    moduleType: T.moduleType, surface: T.surface, url: BASE_URL + url, repo: T.repo,
  });

  await assertLoggedIn(page);
  await recorder.step(
    "navigate to dashboard",
    async () => { await page.goto(url, { waitUntil: "domcontentloaded" }); },
    { action: "navigate", expectation: { assertion: "page loads", narrative: "The dashboard loads." } },
  );

  recorder.setFrames(await dumpForgeFrames(page));
  const surface = await enterForgeSurface(page, { surface: "custom" });
  recorder.attachSurface(surface);
  if (surface.kind !== "custom") throw new Error("expected custom-UI surface");
  const frame = surface.frame;

  // INTENTIONAL FAILURE: assert a selector that doesn't exist → failing bundle +
  // ASSESS-REQUEST.md for the assessor to localize. Mirrors a "blank Gantt" symptom.
  await recorder.step(
    "Gantt grid is visible with rows",
    async () => { await expect(frame.getByTestId("gantt-grid-does-not-exist")).toBeVisible({ timeout: 8_000 }); },
    {
      expectation: {
        assertion: "[data-testid=gantt-grid] visible with >=1 row",
        narrative: "A Gantt grid with one row per scheduled issue is visible in the dashboard.",
      },
    },
  );
});
