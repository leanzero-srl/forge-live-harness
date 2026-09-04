// Permanent live journey for the License Leash Settings worksheet.
//
// The visual matrix is read-only: it switches already-mounted tabs, opens local
// disclosure/editor states, and performs one impossible-name search. The only
// live write in this file is the dedicated freshness proof, which restores the
// original value through the UI in a finally block and verifies that restoration
// after a second reload.
import { execFileSync } from "node:child_process";
import { test, expect } from "../../fixtures/forge";
import { BASE_URL } from "../../config/env";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import {
  MOUNT_ONCE_RESOLVERS,
  SETTINGS_TABS,
  LicenseLeashObserver,
  type SettingsSurface,
  type SettingsTheme,
  assertContainedLayout,
  assertExpectedBuildStamp,
  closeGroupMenu,
  enterSettings,
  fieldContainingLabel,
  freshnessField,
  openGroupMenuAndAssertContained,
  selectAndAssertTab,
  settingsPanel,
  waitForSettingsToSettle,
} from "./settings-support";

const T = getTarget("license-leash-admin");
const APP_SHA = process.env.EXPECTED_APP_SHA?.trim() || (() => {
  try { return execFileSync("git", ["-C", T.repo, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim(); }
  catch { return "unknown"; }
})();
const STRICT_LAYOUT = process.env.BASELINE_CAPTURE !== "1";

const MATRIX: Array<{ width: number; height: number }> = [
  { width: 1440, height: 900 },
  { width: 1024, height: 900 },
  { width: 768, height: 900 },
  { width: 390, height: 844 },
];

function targetUrl(): string {
  const url = T.deepLink(T.envId);
  if (!url) throw new Error("license-leash-admin is expected to have a Confluence globalSettings deep link");
  return url;
}

function setEvidenceTarget(recorder: Parameters<typeof enterSettings>[1]): void {
  recorder.setTarget({
    product: T.product,
    app: T.app,
    appId: T.appId,
    module: T.module,
    moduleType: T.moduleType,
    surface: T.surface,
    url: BASE_URL + targetUrl(),
    repo: T.repo,
    gitShaAppUnderTest: APP_SHA,
  });
}

async function navigateToSettings(
  page: Parameters<typeof assertLoggedIn>[0],
  recorder: Parameters<typeof enterSettings>[1],
  theme: SettingsTheme,
  captureFrames = true,
): Promise<SettingsSurface> {
  // Atlassian's shell can retain detached hosted-resource iframe locators when
  // navigating to the same SPA URL repeatedly. A neutral document guarantees
  // the next discovery sees only the newly mounted app iframe.
  await page.goto("about:blank");
  await page.goto(targetUrl(), { waitUntil: "domcontentloaded" });
  return enterSettings(page, recorder, T, theme, captureFrames);
}

async function captureExpandedRunbook(surface: SettingsSurface, recorder: Parameters<typeof enterSettings>[1]): Promise<void> {
  const panel = settingsPanel(surface, "Access funnel");
  const toggle = panel.getByRole("button", { name: /Cutover runbook — the safe order/ });
  await recorder.step("Access funnel — expanded cutover runbook", async () => {
    await toggle.click();
    await expect(panel.getByText(/Set up the funnel: mode on/)).toBeVisible();
    await assertContainedLayout(surface, STRICT_LAYOUT);
  }, {
    action: "expand the non-mutating cutover runbook",
    capture: "surface-full",
    expectation: {
      assertion: "the complete cutover runbook expands without document overflow",
      narrative: "The Access funnel evidence includes its expanded numbered runbook without running migration or funnel actions.",
    },
  });
  await toggle.click();
}

async function captureSecretState(surface: SettingsSurface, recorder: Parameters<typeof enterSettings>[1]): Promise<void> {
  const panel = settingsPanel(surface, "Detection");
  const field = fieldContainingLabel(panel, "Org API Key");
  const replace = field.getByRole("button", { name: "Replace", exact: true });
  if (await replace.isVisible().catch(() => false)) {
    try {
      await recorder.step("Detection — secret replacement editor", async () => {
        await replace.click();
        const input = field.locator('input[type="password"][placeholder="Paste new key…"]');
        await expect(input).toBeVisible();
        await expect(input).toHaveValue("");
        await assertContainedLayout(surface, STRICT_LAYOUT);
      }, {
        action: "open the local Replace editor without entering or saving a secret",
        capture: "surface-full",
        expectation: {
          assertion: "saved secret becomes a blank password replacement editor",
          narrative: "The saved Org API key stays redacted; Replace exposes an empty editor and no credential value.",
        },
      });
    } finally {
      const cancel = field.getByRole("button", { name: "Cancel", exact: true });
      if (await cancel.isVisible().catch(() => false)) await cancel.click();
    }
    return;
  }

  await recorder.step("Detection — empty secret state", async () => {
    const input = field.locator('input[type="password"][placeholder="Paste key…"]');
    await expect(input).toBeVisible();
    await expect(input).toHaveValue("");
    await assertContainedLayout(surface, STRICT_LAYOUT);
  }, {
    capture: "surface-full",
    expectation: {
      assertion: "an unconfigured secret renders only an empty password input",
      narrative: "The empty Org API state is documented without supplying or saving a credential.",
    },
  });
}

async function captureEmptyAdminSearch(surface: SettingsSurface, recorder: Parameters<typeof enterSettings>[1]): Promise<void> {
  const panel = settingsPanel(surface, "App access");
  const input = panel.locator('input[placeholder="Search by name — e.g. David, Solomon"]');
  const query = `__harness_no_match_${Date.now()}__`;
  try {
    await recorder.step("App access — empty administrator search", async () => {
      await input.fill(query);
      await expect(panel.getByText("Nobody matched. The search covers people the app has already synced.", { exact: true })).toBeVisible({ timeout: 20_000 });
      await assertContainedLayout(surface, STRICT_LAYOUT);
    }, {
      action: "run a non-mutating impossible-name search",
      capture: "surface-full",
      expectation: {
        assertion: "an impossible administrator query renders the bounded empty state",
        narrative: "The App access evidence includes the real empty search result without adding or removing anyone.",
      },
    });
  } finally {
    await input.fill("").catch(() => {});
  }
}

test.describe("License Leash Settings visual matrix", () => {
  test.describe.configure({ timeout: 420_000, retries: 1 });

  for (const theme of ["light", "dark"] as const) {
    for (const viewport of MATRIX) {
      test(`${theme} ${viewport.width}px — all 11 Settings tabs and non-mutating states`, async ({ page, recorder }) => {
        test.skip(!T.envId, "LICENSELEASH_ENV_ID unresolved");
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme: theme });
        setEvidenceTarget(recorder);
        await assertLoggedIn(page);

        const observer = new LicenseLeashObserver(page, T.module);
        await recorder.step("navigate to License Leash Settings", async () => {
          await page.goto(targetUrl(), { waitUntil: "domcontentloaded" });
        }, {
          action: "navigate",
          expectation: {
            assertion: "the development globalSettings URL loads without an Atlassian login redirect",
            narrative: "The permanent journey reaches License Leash Settings through its registered Confluence deep link.",
          },
        });

        const surface = await enterSettings(page, recorder, T, theme);
        observer.setAppUrl(surface.appUrl);
        await waitForSettingsToSettle(surface.shell);
        const mountCallsBefore = observer.counts(MOUNT_ONCE_RESOLVERS);

        for (const label of SETTINGS_TABS) {
          await recorder.step(`${label} — ${theme} ${viewport.width}px`, async () => {
            await selectAndAssertTab(surface, label);
            await assertContainedLayout(surface, STRICT_LAYOUT);
            if (label === "Maintenance") {
              await expect(settingsPanel(surface, label).getByRole("heading", { name: "Danger zone", exact: true })).toBeVisible();
              await assertExpectedBuildStamp(surface);
            }
          }, {
            action: `open the ${label} Settings tab`,
            capture: "surface-full",
            expectation: {
              assertion: "all 11 panels remain mounted, exactly this panel is visible, and the app document does not overflow",
              narrative: `${label} is fully captured at ${viewport.width}px in ${theme} mode with its controls contained.`,
            },
          });

          if (label === "Groups & access") {
            await recorder.step("Groups — expanded custom menu", async () => {
              await openGroupMenuAndAssertContained(surface, STRICT_LAYOUT);
              await assertContainedLayout(surface, STRICT_LAYOUT);
            }, {
              action: "focus the custom group picker without choosing an option",
              capture: "surface-full",
              expectation: {
                assertion: "the custom menu stays inside the document and is not clipped by an overflow ancestor",
                narrative: "The real group menu is visible and contained at this viewport.",
              },
            });
            await closeGroupMenu(surface);
          } else if (label === "Access funnel") {
            await captureExpandedRunbook(surface, recorder);
          } else if (label === "Detection") {
            await captureSecretState(surface, recorder);
          } else if (label === "App access") {
            await captureEmptyAdminSearch(surface, recorder);
          }
        }

        expect(observer.counts(MOUNT_ONCE_RESOLVERS), "tab switches do not re-run mount-only Settings resolvers").toEqual(mountCallsBefore);
        observer.assertNoMutations();

        if (theme === "light" && viewport.width === 1440) {
          await recorder.step("Overview — unchanged reference", async () => {
            await surface.frame.getByRole("button", { name: "Overview", exact: true }).click();
            await expect(surface.frame.getByRole("checkbox", { name: /Include suspended & deactivated accounts/ })).toBeVisible();
          }, {
            action: "reopen Overview after the Settings journey",
            capture: "surface-full",
            expectation: {
              assertion: "the existing Overview content and controls remain available",
              narrative: "The visual-only Settings change has a stable Overview reference image.",
            },
          });
          await recorder.step("Audit Log — unchanged reference", async () => {
            await surface.frame.getByRole("button", { name: "Audit Log", exact: true }).click();
            await expect(surface.frame.getByRole("tablist", { name: "Log views" })).toBeVisible();
          }, {
            action: "reopen Audit Log after the Settings journey",
            capture: "surface-full",
            expectation: {
              assertion: "the existing Audit Log content and controls remain available",
              narrative: "The visual-only Settings change has a stable Audit Log reference image.",
            },
          });
          await recorder.step("return to Settings after unchanged surfaces", async () => {
            await surface.frame.getByRole("button", { name: "Settings", exact: true }).click();
            await expect(surface.frame.getByRole("heading", { name: "Configuration", exact: true })).toBeVisible();
            await expect(surface.frame.locator('[role="tabpanel"]')).toHaveCount(SETTINGS_TABS.length);
          }, {
            action: "return to Settings",
            capture: "surface-full",
            expectation: {
              assertion: "Settings still mounts all 11 panels after visiting both sibling surfaces",
              narrative: "Overview and Audit navigation leaves the Settings route healthy.",
            },
          });
        }
        await observer.assertNoAppErrors();
      });
    }
  }
});

test.describe("License Leash App access persistence", () => {
  // Never retry a live write automatically. The finally block is the only cleanup path.
  test.describe.configure({ timeout: 420_000, retries: 0 });

  test("freshness saves, survives reload, and is restored through the UI", async ({ page, recorder }) => {
    test.skip(!T.envId, "LICENSELEASH_ENV_ID unresolved");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: "light" });
    setEvidenceTarget(recorder);
    await assertLoggedIn(page);

    const observer = new LicenseLeashObserver(page, T.module);
    await recorder.step("navigate to App access", async () => {
      await page.goto(targetUrl(), { waitUntil: "domcontentloaded" });
    }, {
      action: "navigate",
      expectation: {
        assertion: "the development License Leash admin surface loads",
        narrative: "The persistence proof starts from the real App access Settings field.",
      },
    });

    let surface = await enterSettings(page, recorder, T, "light");
    observer.setAppUrl(surface.appUrl);
    await waitForSettingsToSettle(surface.shell);
    await selectAndAssertTab(surface, "App access");

    const observedOriginal = await freshnessField(surface).input.inputValue();
    // Recovery-only escape hatch for an interrupted prior run. Normal evidence
    // always restores the value it observed when the test started.
    const original = process.env.RECOVER_FRESHNESS_TO?.trim() || observedOriginal;
    const originalNumber = Number(original);
    expect(Number.isFinite(originalNumber) && originalNumber > 0, "freshness starts as a positive numeric value").toBe(true);
    const adjacent = String(originalNumber === 1440 ? originalNumber - 1 : originalNumber + 1);
    const updateStart = observer.freshnessUpdates.length;
    let restoreRequired = false;
    let primaryError: unknown;
    let cleanupError: unknown;

    try {
      await recorder.step("save adjacent freshness value", async () => {
        const field = freshnessField(surface);
        await field.input.fill(adjacent);
        restoreRequired = true; // the click may land even if its response or assertion fails
        await field.save.click();
        await expect(field.field.getByText("✓ Saved", { exact: true })).toBeVisible({ timeout: 30_000 });
      }, {
        action: `save a safe adjacent freshness value (${original} → ${adjacent})`,
        capture: "surface-full",
        expectation: {
          assertion: "the inline Saved state appears after updateConfig",
          narrative: "The one authorised live change is acknowledged next to the freshness field.",
        },
      });

      surface = await navigateToSettings(page, recorder, "light", false);
      observer.setAppUrl(surface.appUrl);
      await waitForSettingsToSettle(surface.shell);
      await recorder.step("adjacent freshness survives reload", async () => {
        await selectAndAssertTab(surface, "App access");
        await expect(freshnessField(surface).input).toHaveValue(adjacent);
      }, {
        action: "reload and reopen App access",
        capture: "surface-full",
        expectation: {
          assertion: `the persisted freshness value reads back as ${adjacent}`,
          narrative: "A fresh app load proves the save reached backend state rather than only local React state.",
        },
      });
    } catch (error) {
      primaryError = error;
    } finally {
      if (restoreRequired) {
        try {
          surface = await navigateToSettings(page, recorder, "light", false);
          observer.setAppUrl(surface.appUrl);
          await waitForSettingsToSettle(surface.shell);
          await selectAndAssertTab(surface, "App access");
          await recorder.step("restore original freshness through the UI", async () => {
            const field = freshnessField(surface);
            await field.input.fill(original);
            await field.save.click();
            await expect(field.field.getByText("✓ Saved", { exact: true })).toBeVisible({ timeout: 30_000 });
          }, {
            action: `restore the original freshness value ${original}`,
            capture: "surface-full",
            expectation: {
              assertion: "the original value is saved through the same UI path",
              narrative: "Cleanup uses the product UI and never bypasses the resolver contract.",
            },
          });

          surface = await navigateToSettings(page, recorder, "light", false);
          observer.setAppUrl(surface.appUrl);
          await waitForSettingsToSettle(surface.shell);
          await recorder.step("restored freshness survives reload", async () => {
            await selectAndAssertTab(surface, "App access");
            await expect(freshnessField(surface).input).toHaveValue(original);
          }, {
            action: "reload and verify restoration",
            capture: "surface-full",
            expectation: {
              assertion: `the live setting reads back as its original value ${original}`,
              narrative: "The wolfaenpak fixture is left exactly as the journey found it.",
            },
          });
        } catch (error) {
          cleanupError = error;
        }
      }
    }

    const updates = observer.freshnessUpdates.slice(updateStart);
    observer.assertOnlyFreshnessMutations();
    if (!primaryError && !cleanupError) {
      expect(updates, "one adjacent save and one restoration use the unchanged resolver payload").toEqual([
        { key: "admin_verdict_ttl_minutes", value: adjacent },
        { key: "admin_verdict_ttl_minutes", value: original },
      ]);
      await observer.assertNoAppErrors();
    }
    if (cleanupError) {
      throw new Error(`Freshness cleanup failed; original=${original}. Primary error: ${String(primaryError ?? "none")}. Cleanup error: ${String(cleanupError)}`);
    }
    if (primaryError) throw primaryError;
  });
});
