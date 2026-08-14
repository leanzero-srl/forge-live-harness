// Sentinel Vault DEEP — the anti-it26 STALENESS guard. Runs FIRST in every batch run.
// it26's failure shape: `forge deploy` updated the backend while the served frontend bundle was
// from an OLDER build (missing `forge install --upgrade` / CDN propagation) — every browser spec
// then tested a frankenstein app. The guard: the backend stamps its build into the testhook
// ({what:"version"} → build.gitSha) and the frontend stamps the SAME build into a data-sv-build
// attribute on the realm-console root container. This spec asserts they are the SAME build.
//   - {what:"version"} not deployed yet (seam authored in parallel) → LOUD test.skip.
//   - backend seam live but data-sv-build missing in the iframe → that IS the staleness signal
//     (an old bundle predates the attribute) → hard FAIL, never skip.
//   - both present but different → hard FAIL: frontend and backend are from different deploys.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";
import { mkdirSync } from "node:fs";

const OUT = "/tmp/sv-deploy-guard";
const T = getTarget("sentinel-vault-realm");

test.describe.configure({ timeout: 240_000 });

test("🔎 deploy-state guard: frontend data-sv-build == backend build.gitSha (anti-it26)", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });

  // Backend truth first — no point booting a browser if the seam isn't deployed.
  let v: any;
  try {
    v = await getTestState("sentinel-vault", { what: "version" });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    test.skip(/unknown (what|fn)|-> 400/.test(msg), `LOUD SKIP: {what:"version"} testhook seam not deployed yet — the deploy-state guard CANNOT vouch for this batch; treat every downstream browser result as unguarded. (${msg.slice(0, 200)})`);
    throw e; // any other error (network, secret, 5xx) is a REAL failure, not a skip
  }
  const sha = String(v?.build?.gitSha || v?.gitSha || "").trim();
  expect(sha, `backend build.gitSha present and sha-like (got ${JSON.stringify(v).slice(0, 200)})`).toMatch(/^[0-9a-f]{7,40}$/i);
  console.log(`### backend build.gitSha: ${sha}`);

  // Frontend truth: the realm console's root container stamps data-sv-build.
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  const surface = await enterForgeSurface(page, { surface: "custom", readySelector: ".space-admin-title", timeout: 45_000 });
  if (surface.kind !== "custom") throw new Error("expected a Custom UI iframe");
  const app = surface.frame;
  await expect(app.locator(".space-admin-title"), "realm console loaded past the spinner").toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: `${OUT}/console.png`, fullPage: true });

  const holder = app.locator("[data-sv-build]").first();
  // Absence here with a LIVE backend seam is precisely the it26 condition (stale bundle) — FAIL.
  await expect(holder, "frontend exposes data-sv-build (absent = the served bundle predates this build = STALE FRONTEND)").toBeAttached({ timeout: 20_000 });
  const attr = String((await holder.getAttribute("data-sv-build")) || "").trim();
  console.log(`### frontend data-sv-build: ${attr}`);

  // Equality with short-sha tolerance: identical, or one is a >=7-char prefix of the other
  // (same commit, different truncation). A different deploy's sha can never prefix-match.
  const same = attr === sha || (attr.length >= 7 && sha.length >= 7 && (attr.startsWith(sha) || sha.startsWith(attr)));
  expect(same, `frontend build "${attr}" != backend build "${sha}" — the served frontend and the deployed backend are from DIFFERENT builds (it26 staleness): run forge deploy + forge install --upgrade and wait out CDN propagation before trusting ANY browser spec in this batch`).toBeTruthy();
  console.log("### deploy-state guard ✓ frontend and backend are the same build");
});
