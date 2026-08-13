// LIVE: the app's BRAND MARK is actually on screen in Jira.
//
// The mark is authored once (lz-ppm-forge static/ppm-ui/src/brand/mark.js) and
// generated into six places: the Forge manifest icon on three modules, the
// browser favicon, the app's own header, and the Marketplace logo. Six copies of
// one drawing is exactly the kind of thing that silently drifts — and the header
// in particular used to draw its OWN mark in CSS, so the product's chrome showed
// something different from its listing.
//
// This asserts the real thing renders inside the Forge iframe on the live
// instance: a non-empty SVG in the header slot, with real geometry.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { BASE_URL } from "../../config/env";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");

test.describe.configure({ retries: 2 });

test("the brand mark renders in the app header on the live instance", async ({ page, recorder }) => {
  test.skip(!T.envId, "LZ_PPM_ENV_ID unresolved — run `npm run discover` or set it in .env.");
  const url = T.deepLink(T.envId)!;
  recorder.setTarget({
    product: T.product, app: T.app, appId: T.appId, module: T.module,
    moduleType: T.moduleType, surface: T.surface, url: BASE_URL + url, repo: T.repo,
  });

  await assertLoggedIn(page);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const surface = await enterForgeSurface(page, { surface: T.surface, readySelector: T.readySelector });
  recorder.attachSurface(surface);
  // The global page is a Custom UI surface, so the app lives inside an iframe;
  // `root` is the right handle either way.
  const root = surface.root;

  await recorder.step(
    "the header shows the generated brand mark",
    async () => {
      const mark = root.locator(".lz-appbar-mark svg").first();
      await expect(mark).toBeAttached({ timeout: 20000 });
      const box = await mark.boundingBox();
      // A mark that is present but zero-sized is the same as no mark at all.
      expect(box, "the mark has on-screen geometry").not.toBeNull();
      expect(box!.width, "mark width").toBeGreaterThan(10);
      expect(box!.height, "mark height").toBeGreaterThan(10);
      // It must be a real drawing, not an empty <svg> shell.
      const shapes = await mark.locator("path, rect, circle, polygon, g").count();
      expect(shapes, "the mark contains drawn shapes").toBeGreaterThan(0);
      // eslint-disable-next-line no-console
      console.log(`BRAND MARK live: ${Math.round(box!.width)}x${Math.round(box!.height)}px, ${shapes} shapes`);
    },
    {
      expectation: {
        assertion: "the app header renders the generated brand mark with real geometry",
        narrative:
          "The mark the Marketplace listing uses is the same one the product shows in its own header.",
      },
    },
  );
});
