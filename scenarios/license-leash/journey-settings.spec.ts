// Permanent live journey for the License Leash Settings worksheet.
//
// The visual matrix is read-only: it switches already-mounted tabs, opens local
// disclosure/editor states, exercises Overview filters, queries Audit and downloads
// its two CSV scopes. The only live write in this file is the dedicated freshness
// proof, which restores the original value through the UI in a finally block and
// verifies that restoration after a second reload.
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import type { Download, Locator, Page } from "@playwright/test";
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
  pinHostedAppWidth,
  selectAndAssertTab,
  settingsPanel,
  waitForHostedFrameToSettle,
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

async function waitForDashboardBoot(page: Parameters<typeof assertLoggedIn>[0]): Promise<void> {
  const iframe = page.locator('iframe[data-testid="hosted-resources-iframe"][src*="/adminDashboard/"]').first();
  await iframe.waitFor({ state: "visible", timeout: 45_000 });
  await expect(iframe.contentFrame().getByRole("heading", { name: "License Leash", exact: true })).toBeVisible({ timeout: 30_000 });
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
    await waitForHostedFrameToSettle(surface);
  }, {
    action: "expand the non-mutating cutover runbook",
    capture: "surface-full",
    expectation: {
      assertion: "the complete cutover runbook expands without document overflow",
      narrative: "The Access funnel evidence includes its expanded numbered runbook without running migration or funnel actions.",
    },
  });
  await toggle.click();
  await waitForHostedFrameToSettle(surface);
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
        await waitForHostedFrameToSettle(surface);
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
      if (await cancel.isVisible().catch(() => false)) {
        await cancel.click();
        // The secret field changes both its subtree and the hosted iframe's
        // measured height. Do not click the next horizontal tab while that
        // resize is still settling at tablet widths.
        await expect(replace).toBeVisible();
        await waitForHostedFrameToSettle(surface);
      }
    }
    return;
  }

  await recorder.step("Detection — empty secret state", async () => {
    const input = field.locator('input[type="password"][placeholder="Paste key…"]');
    await expect(input).toBeVisible();
    await expect(input).toHaveValue("");
    await assertContainedLayout(surface, STRICT_LAYOUT);
    await waitForHostedFrameToSettle(surface);
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
      await waitForHostedFrameToSettle(surface);
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
    await waitForHostedFrameToSettle(surface).catch(() => {});
  }
}

interface TileVisualState {
  shadow: string;
  translateY: number;
  focusVisible: boolean;
}

async function tileVisualState(tile: Locator): Promise<TileVisualState> {
  return tile.evaluate((element) => {
    const style = getComputedStyle(element);
    const matrix = style.transform === "none" ? null : new DOMMatrixReadOnly(style.transform);
    return {
      shadow: style.boxShadow,
      translateY: matrix?.m42 ?? 0,
      focusVisible: element.matches(":focus-visible"),
    };
  });
}

async function assertOverviewGridIsEven(surface: SettingsSurface): Promise<void> {
  const geometry = await surface.frame.locator(".stats-grid").evaluate((grid) => {
    const rect = grid.getBoundingClientRect();
    const cards = Array.from(grid.querySelectorAll<HTMLElement>(":scope > .stat-card")).map((card) => {
      const box = card.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    });
    return {
      appWidth: document.documentElement.clientWidth,
      gridWidth: rect.width,
      columns: getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length,
      cards,
    };
  });

  expect(geometry.cards, "Overview renders six filter cards and one licence gauge").toHaveLength(7);
  const expectedColumns = geometry.appWidth <= 700 ? 2 : geometry.appWidth <= 980 ? 3 : 7;
  expect(geometry.columns, `Overview grid follows the ${expectedColumns}-column breakpoint at app width ${geometry.appWidth}px`).toBe(expectedColumns);

  const within = (actual: number, expected: number, tolerance = 2) => Math.abs(actual - expected) <= tolerance;
  const firstSix = geometry.cards.slice(0, 6);
  const expectedCardWidth = firstSix[0].width;
  const expectedCardHeight = firstSix[0].height;
  expect(firstSix.every(card => within(card.width, expectedCardWidth)), "all six KPI cards have equal width").toBe(true);
  expect(firstSix.every(card => within(card.height, expectedCardHeight, 1)), "all six KPI cards have equal height").toBe(true);

  if (expectedColumns === 7) {
    expect(geometry.cards.every(card => within(card.y, geometry.cards[0].y)), "all seven desktop tiles share one row").toBe(true);
    expect(within(geometry.cards[6].width, expectedCardWidth), "the desktop licence gauge matches the KPI width").toBe(true);
    expect(within(geometry.cards[6].height, expectedCardHeight, 1), "the desktop licence gauge matches the KPI height").toBe(true);
    return;
  }

  const expectedRows = 6 / expectedColumns;
  for (let row = 0; row < expectedRows; row += 1) {
    const rowCards = firstSix.slice(row * expectedColumns, (row + 1) * expectedColumns);
    expect(rowCards.every(card => within(card.y, rowCards[0].y)), `responsive KPI row ${row + 1} is level`).toBe(true);
    if (row > 0) {
      const firstRow = firstSix.slice(0, expectedColumns);
      expect(rowCards.every((card, index) => within(card.x, firstRow[index].x)), `responsive KPI row ${row + 1} aligns with row 1`).toBe(true);
    }
  }
  const gauge = geometry.cards[6];
  expect(within(gauge.width, geometry.gridWidth), "the responsive licence gauge spans the complete grid").toBe(true);
  expect(gauge.y).toBeGreaterThan(firstSix[firstSix.length - 1].y);
}

async function captureOverviewEvidence(
  page: Page,
  surface: SettingsSurface,
  recorder: Parameters<typeof enterSettings>[1],
  theme: SettingsTheme,
  width: number,
): Promise<void> {
  await surface.frame.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(surface.frame.getByRole("checkbox", { name: /Include suspended & deactivated accounts/ })).toBeVisible();

  const health = surface.frame.locator(".engine-health");
  await recorder.step(`Overview engine evidence — ${theme} ${width}px`, async () => {
    await expect(health, "the wolfaenpak stopped-job fixture exposes the Engine Health treatment").toBeVisible({ timeout: 30_000 });
    const showDetail = health.getByRole("button", { name: "Show detail", exact: true });
    await expect(showDetail).toBeVisible();
    await showDetail.click();
    await expect(health.getByRole("button", { name: "Hide detail", exact: true })).toBeVisible();
    await expect.poll(() => health.locator(".engine-health__job-row").count(), {
      message: "expanded Engine Health contains concrete job evidence",
      timeout: 15_000,
    }).toBeGreaterThan(0);

    const treatment = await health.evaluate((element) => {
      const alpha = (colour: string) => {
        const rgba = colour.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/);
        return rgba ? Number(rgba[1]) : 1;
      };
      const style = getComputedStyle(element);
      const header = element.querySelector<HTMLElement>(".engine-health__header")!;
      const body = element.querySelector<HTMLElement>(".engine-health__body")!;
      const jobs = element.querySelector<HTMLElement>(".engine-health__jobs")!;
      const rows = Array.from(element.querySelectorAll<HTMLElement>(".engine-health__job-row"));
      const states = Array.from(element.querySelectorAll<HTMLElement>(".engine-health__state"));
      const widths = (value: CSSStyleDeclaration) => [
        value.borderTopWidth, value.borderRightWidth, value.borderBottomWidth, value.borderLeftWidth,
      ];
      const colours = (value: CSSStyleDeclaration) => [
        value.borderTopColor, value.borderRightColor, value.borderBottomColor, value.borderLeftColor,
      ];
      const jobStyle = getComputedStyle(jobs);
      return {
        semanticClass: element.classList.contains("engine-health--stopped") || element.classList.contains("engine-health--warning"),
        headerBackground: getComputedStyle(header).backgroundColor,
        headerAlpha: alpha(getComputedStyle(header).backgroundColor),
        bodyBackground: getComputedStyle(body).backgroundColor,
        rowBackgrounds: rows.map(row => getComputedStyle(row).backgroundColor),
        stateAlphas: states.map(state => alpha(getComputedStyle(state).backgroundColor)),
        shellBorderWidths: widths(style),
        shellBorderColours: colours(style),
        jobsBorderWidths: widths(jobStyle),
        jobsBorderColours: colours(jobStyle),
      };
    });
    expect(treatment.semanticClass, "Engine Health uses a semantic stopped/warning state").toBe(true);
    expect(treatment.headerAlpha, "Engine Health header uses a solid semantic colour").toBe(1);
    expect(treatment.headerBackground, "Engine Health header has a visible semantic fill").not.toBe("rgba(0, 0, 0, 0)");
    expect(treatment.headerBackground, "Engine Health header has a visible semantic fill").not.toBe("transparent");
    expect(treatment.headerBackground, "the semantic header is distinct from the neutral evidence body").not.toBe(treatment.bodyBackground);
    expect(treatment.rowBackgrounds.every(background => background === "rgba(0, 0, 0, 0)" || background === treatment.bodyBackground),
      "job evidence rows stay neutral instead of using pale semantic strips").toBe(true);
    expect(treatment.stateAlphas.every(alpha => alpha === 1), "job state pills use solid colours").toBe(true);
    expect(new Set(treatment.shellBorderWidths).size, "Engine Health has a full, even outline rather than a left rail").toBe(1);
    expect(parseFloat(treatment.shellBorderWidths[0]), "Engine Health outline is visibly present").toBeGreaterThan(0);
    expect(new Set(treatment.shellBorderColours).size, "Engine Health outline uses one colour on all sides").toBe(1);
    expect(new Set(treatment.jobsBorderWidths).size, "the evidence worksheet is outlined on all sides").toBe(1);
    expect(parseFloat(treatment.jobsBorderWidths[0]), "the evidence worksheet outline is visibly present").toBeGreaterThan(0);
    expect(new Set(treatment.jobsBorderColours).size, "the evidence worksheet outline is visually even").toBe(1);
    await assertContainedLayout(surface, STRICT_LAYOUT);
    await waitForHostedFrameToSettle(surface);
  }, {
    action: "open the redesigned Engine Health evidence",
    capture: "surface-full",
    expectation: {
      assertion: "a solid semantic header sits above neutral, fully outlined job evidence without pale red strips or a left rail",
      narrative: `The ${theme} ${width}px Overview captures the real stopped-job state with each item visually separated and readable.`,
    },
  });

  const filterNames = ["Licensed", "Managed seats", "Awaiting claim", "Protected", "Active (30d)", "Inactive"];
  const filters = filterNames.map(name => surface.frame.getByRole("button", { name: `Filter users by ${name}`, exact: true }));
  const gauge = surface.frame.getByRole("button", { name: "Open license usage trends", exact: true });
  const tiles = [...filters, gauge];

  await recorder.step(`Overview KPI interactions — ${theme} ${width}px`, async () => {
    for (const [index, tile] of tiles.entries()) {
      await expect(tile, `${index < 6 ? filterNames[index] : "License usage"} tile is interactive`).toBeVisible();
    }
    await assertOverviewGridIsEven(surface);

    const restStates: TileVisualState[] = [];
    for (const [index, tile] of tiles.entries()) {
      const rest = await tileVisualState(tile);
      restStates.push(rest);
      await tile.hover();
      await expect.poll(async () => {
        const hover = await tileVisualState(tile);
        return hover.shadow !== rest.shadow && Math.abs(hover.translateY - rest.translateY) < 0.5;
      }, {
        message: `${index < 6 ? filterNames[index] : "License usage"} has a visible hover glow without jumping`,
        timeout: 5_000,
      }).toBe(true);
    }

    await surface.frame.getByRole("heading", { name: "License Leash", exact: true }).hover();
    for (const [index, tile] of tiles.entries()) {
      // Shift+Tab then Tab turns programmatic placement into real keyboard focus,
      // so this proves :focus-visible rather than the weaker :focus state.
      await tile.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await expect(tile).toBeFocused();
      await expect.poll(async () => {
        const focused = await tileVisualState(tile);
        return focused.focusVisible
          && focused.shadow !== restStates[index].shadow
          && Math.abs(focused.translateY - restStates[index].translateY) < 0.5;
      }, {
        message: `${index < 6 ? filterNames[index] : "License usage"} has a visible keyboard-focus glow without jumping`,
        timeout: 5_000,
      }).toBe(true);

      if (index < filters.length) {
        await tile.press("Enter");
        await expect(tile, `${filterNames[index]} exposes its selected state`).toHaveAttribute("aria-pressed", "true", { timeout: 10_000 });
        await tile.blur();
        await surface.frame.getByRole("heading", { name: "License Leash", exact: true }).hover();
        await expect.poll(async () => {
          const selected = await tileVisualState(tile);
          return !selected.focusVisible
            && selected.shadow !== restStates[index].shadow
            && Math.abs(selected.translateY - restStates[index].translateY) < 0.5;
        }, {
          message: `${filterNames[index]} keeps a visible selected glow without jumping`,
          timeout: 5_000,
        }).toBe(true);
      }
    }

    const loadingOverlay = surface.frame.getByText("Loading…", { exact: true }).locator("../..");
    await expect(loadingOverlay).toHaveAttribute("aria-hidden", "true", { timeout: 15_000 });
    await expect(filters[5]).toHaveAttribute("aria-pressed", "true");
    await assertContainedLayout(surface, STRICT_LAYOUT);
    await waitForHostedFrameToSettle(surface);
  }, {
    action: "exercise hover, keyboard focus and selection on all Overview tiles",
    capture: "surface-full",
    expectation: {
      assertion: "all six filters and the licence gauge show a real glow without motion, while KPI rows remain even at the active responsive breakpoint",
      narrative: `The ${theme} ${width}px Overview finishes with Inactive selected and License usage keyboard-focused so both persistent and transient emphasis are visible.`,
    },
  });
}

async function readDownloadedCsv(download: Download): Promise<string> {
  const path = await download.path();
  expect(path, "the browser completed the CSV download").not.toBeNull();
  return readFile(path!, "utf8");
}

function csvActions(csv: string): string[] {
  expect(csv.replace(/^\uFEFF/, "")).toMatch(/^performed_at,action,account_id,display_name,performed_by,reason\r?\n/);
  return Array.from(csv.matchAll(/^(?:\uFEFF)?\d{4}-\d{2}-\d{2}[^,\r\n]*,([A-Z][A-Z0-9_]*),/gm), match => match[1]);
}

async function captureAuditControls(
  page: Page,
  surface: SettingsSurface,
  recorder: Parameters<typeof enterSettings>[1],
  theme: SettingsTheme,
  width: number,
  proveDownloads: boolean,
): Promise<void> {
  await surface.frame.getByRole("button", { name: "Audit Log", exact: true }).click();
  await expect(surface.frame.getByRole("tablist", { name: "Log views" })).toBeVisible();
  const audit = surface.frame.locator(".audit-log");
  const search = audit.getByRole("textbox", { name: "Search audit log", exact: true });
  const eventType = audit.getByRole("button", { name: "Event type", exact: true });
  const exportButton = audit.getByRole("button", { name: "Export CSV", exact: true });
  const count = audit.locator(".audit-log__count");
  await expect(count).toHaveText(/^\d[\d,]* entries$/);
  await expect.poll(async () => Number((await count.textContent() ?? "").replace(/\D/g, "")), {
    message: "the live Audit Log has loaded its unfiltered rows",
    timeout: 30_000,
  }).toBeGreaterThan(0);
  const initialTotal = Number((await count.textContent() ?? "").replace(/\D/g, ""));
  let filteredTotal = 0;

  await recorder.step(`Audit Log event picker — ${theme} ${width}px`, async () => {
    await expect(search).toBeVisible();
    await expect(eventType).toHaveAttribute("aria-haspopup", "listbox");
    await expect(exportButton).toBeVisible();
    expect(await audit.locator("select").count(), "Audit uses no browser-native select").toBe(0);

    await eventType.focus();
    await eventType.press("ArrowDown");
    const listbox = audit.getByRole("listbox");
    await expect(listbox).toBeVisible();
    await expect(listbox.getByRole("option")).toHaveCount(17);
    // The selected option exposes its visible checkmark in the accessible
    // name, so match the semantic label suffix rather than pretending the
    // selected and unselected names are byte-identical.
    await expect(listbox.getByRole("option", { name: /All event types$/ })).toHaveAttribute("aria-selected", "true");
    await expect(listbox.getByRole("option", { name: "Configuration changes", exact: true })).toBeVisible();
    await expect(listbox.locator('[role="option"]:focus')).toHaveCount(1);
    await assertContainedLayout(surface, STRICT_LAYOUT);
    await waitForHostedFrameToSettle(surface);
  }, {
    action: "open the keyboard-operable custom Event type picker",
    capture: "surface-full",
    expectation: {
      assertion: "the custom listbox exposes every event group, marks the current choice, receives keyboard focus, and remains contained",
      narrative: `The ${theme} ${width}px Audit Log captures its non-native event filter open.`,
    },
  });
  await audit.getByRole("listbox").locator('[role="option"]:focus').press("Escape");
  await expect(eventType).toBeFocused();

  await recorder.step(`Audit Log filtered export choices — ${theme} ${width}px`, async () => {
    await eventType.click();
    await audit.getByRole("option", { name: "Configuration changes", exact: true }).click();
    await expect(eventType).toContainText("Configuration changes");
    await search.fill("config");

    await exportButton.click();
    const menu = audit.getByRole("dialog", { name: "Export audit log", exact: true });
    await expect(menu).toBeVisible();
    const current = menu.getByRole("button", { name: "Export current selection", exact: true });
    await expect(current).toBeEnabled({ timeout: 30_000 });
    filteredTotal = Number((await count.textContent() ?? "").replace(/\D/g, ""));
    expect(filteredTotal, "the live configuration filter has matching entries").toBeGreaterThan(0);
    await expect(menu.getByRole("button", { name: "Export all audit entries", exact: true })).toBeEnabled();
    await expect(menu.getByText(`${filteredTotal.toLocaleString()} matching ${filteredTotal === 1 ? "entry" : "entries"}, including every matching page.`, { exact: true })).toBeVisible();
    await expect.poll(() => audit.locator(".audit-log__badge").count(), {
      message: "the configuration filter has visible live matches",
      timeout: 30_000,
    }).toBeGreaterThan(0);
    expect((await audit.locator(".audit-log__badge").allTextContents()).every(text => text.trim().toLowerCase() === "config"),
      "event type and visible-label text filters constrain every visible result").toBe(true);
    await assertContainedLayout(surface, STRICT_LAYOUT);
    await waitForHostedFrameToSettle(surface);
  }, {
    action: "filter by Configuration changes and visible text, then open Export CSV",
    capture: "surface-full",
    expectation: {
      assertion: "the live results obey both filters and Export CSV offers current-selection and complete-log scopes",
      narrative: `The ${theme} ${width}px Audit Log captures the bounded export menu against a settled filtered selection.`,
    },
  });

  if (proveDownloads) {
    await recorder.step("Audit Log — both CSV scopes download", async () => {
      const currentMenu = audit.getByRole("dialog", { name: "Export audit log", exact: true });
      const currentDownloadPromise = page.waitForEvent("download", { timeout: 60_000 });
      await currentMenu.getByRole("button", { name: "Export current selection", exact: true }).click();
      const currentDownload = await currentDownloadPromise;
      expect(currentDownload.suggestedFilename()).toMatch(/^license-leash_audit_current-selection_.+\.csv$/);
      const currentActions = csvActions(await readDownloadedCsv(currentDownload));
      expect(currentActions.length, "current-selection CSV contains the visible configuration results").toBeGreaterThan(0);
      expect(currentActions.length, "current-selection CSV includes every matching page exactly once").toBe(filteredTotal);
      expect(currentActions.every(action => action === "CONFIG_CHANGED"), "current-selection CSV applies the event filter on every page").toBe(true);

      await exportButton.click();
      const allMenu = audit.getByRole("dialog", { name: "Export audit log", exact: true });
      const allDownloadPromise = page.waitForEvent("download", { timeout: 60_000 });
      await allMenu.getByRole("button", { name: "Export all audit entries", exact: true }).click();
      const allDownload = await allDownloadPromise;
      expect(allDownload.suggestedFilename()).toMatch(/^license-leash_audit_all_.+\.csv$/);
      const allActions = csvActions(await readDownloadedCsv(allDownload));
      expect(allActions.length, "complete-log CSV contains at least the entries counted before filtering").toBeGreaterThanOrEqual(initialTotal);
      expect(allActions.length, "complete-log CSV contains at least the filtered rows").toBeGreaterThanOrEqual(currentActions.length);
      expect(allActions.some(action => action !== "CONFIG_CHANGED"), "complete-log CSV ignores the active event/text filters").toBe(true);
    }, {
      action: "download current selection, then the complete audit log",
      expectation: {
        assertion: "the two export choices emit distinct CSVs and only current selection is constrained to CONFIG_CHANGED",
        narrative: "Live resolver and browser-download evidence proves both scopes, not merely that two menu labels render.",
      },
    });
  } else {
    await page.keyboard.press("Escape");
    await expect(audit.getByRole("dialog", { name: "Export audit log", exact: true })).toBeHidden();
    await expect(exportButton).toBeFocused();
  }

  await search.fill("");
  await eventType.click();
  await audit.getByRole("option", { name: /All event types$/ }).click();
}

test.describe("License Leash admin visual matrix", () => {
  // A retry can turn a missed host click or broken evidence capture into a
  // deceptively green journey. Every viewport must pass on its first attempt.
  test.describe.configure({ timeout: 420_000, retries: 0 });

  for (const theme of ["light", "dark"] as const) {
    for (const viewport of MATRIX) {
      test(`${theme} ${viewport.width}px — Settings, Overview and Audit`, async ({ page, recorder }) => {
        test.skip(!T.envId, "LICENSELEASH_ENV_ID unresolved");
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme: theme });
        setEvidenceTarget(recorder);
        await assertLoggedIn(page);

        const observer = new LicenseLeashObserver(page, T.module);
        await recorder.step("navigate to License Leash Settings", async () => {
          await page.goto(targetUrl(), { waitUntil: "domcontentloaded" });
          await waitForDashboardBoot(page);
        }, {
          action: "navigate",
          expectation: {
            assertion: "the development globalSettings URL loads without an Atlassian login redirect",
            narrative: "The permanent journey reaches License Leash Settings through its registered Confluence deep link.",
          },
        });

        const surface = await enterSettings(page, recorder, T, theme);
        if (viewport.width < 600) await pinHostedAppWidth(surface, viewport.width);
        observer.setAppUrl(surface.appUrl);
        await waitForSettingsToSettle(surface.shell);
        const mountCallsBefore = observer.counts(MOUNT_ONCE_RESOLVERS);
        await surface.panels.evaluateAll((panels) => {
          type IdentityWindow = Window & {
            __licenseLeashPanelIdentity?: Array<{ panel: Element; content: Element | null }>;
          };
          (window as IdentityWindow).__licenseLeashPanelIdentity = panels.map((panel) => ({
            panel,
            content: panel.firstElementChild,
          }));
        });

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
        expect(await surface.panels.evaluateAll((panels) => {
          type IdentityWindow = Window & {
            __licenseLeashPanelIdentity?: Array<{ panel: Element; content: Element | null }>;
          };
          const before = (window as IdentityWindow).__licenseLeashPanelIdentity;
          return before?.length === panels.length && panels.every((panel, index) =>
            before[index]?.panel === panel && before[index]?.content === panel.firstElementChild);
        }), "tab round-trips preserve every panel and its component root DOM node").toBe(true);
        observer.assertNoMutations();

        await captureOverviewEvidence(page, surface, recorder, theme, viewport.width);
        await captureAuditControls(
          page,
          surface,
          recorder,
          theme,
          viewport.width,
          theme === "light" && viewport.width === 1440,
        );
        observer.assertNoMutations();

        await recorder.step(`return to Settings — ${theme} ${viewport.width}px`, async () => {
          await surface.frame.getByRole("button", { name: "Settings", exact: true }).click();
          await expect(surface.frame.getByRole("heading", { name: "Configuration", exact: true })).toBeVisible();
          await expect(surface.frame.locator('[role="tabpanel"]')).toHaveCount(SETTINGS_TABS.length);
          await waitForHostedFrameToSettle(surface);
        }, {
          action: "return to Settings after exercising both redesigned sibling surfaces",
          capture: "surface-full",
          expectation: {
            assertion: "Settings still mounts all 11 panels after the Overview and Audit interaction journeys",
            narrative: "Overview and Audit navigation leaves the Settings route healthy at this theme and viewport.",
          },
        });
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
      await waitForDashboardBoot(page);
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
