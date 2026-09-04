import type { ConsoleMessage, FrameLocator, Locator, Page, Request, Response } from "@playwright/test";
import { expect } from "../../fixtures/forge";
import type { Recorder } from "../../capture/recorder";
import type { Target } from "../../config/targets";
import { dumpForgeFrames, enterForgeSurface } from "../../forge/frame";

export type SettingsTheme = "light" | "dark";

export const SETTINGS_TABS = [
  "Groups & access",
  "Limits & dry run",
  "Notifications",
  "Access funnel",
  "Onboarding",
  "Group router",
  "Detection",
  "Maintenance",
  "API allowance",
  "App access",
  "Waiting list",
] as const;

export const MOUNT_ONCE_RESOLVERS = [
  "getGroups",
  "getDetectedLicenseGroups",
  "getFunnelStatus",
  "getNotifySettings",
  "getLeashAdmins",
  "getReactivationUrl",
  "getTrackedEventsConfig",
  "getLeashSpace",
  "getRateLimitReport",
  "getLicenceRefresh",
  "getOverflowQueue",
  "getReleaseNotes",
] as const;

const MUTATING_RESOLVERS = new Set([
  "updateConfig",
  "syncNow",
  "cancelSync",
  "purgeAndSync",
  "runInactivityCheck",
  "runDiagnostics",
  "sendNotifyTest",
  "setNotifyEnabled",
  "createManagedGroup",
  "adoptManagedGroup",
  "ensureManagedGroupRole",
  "runFunnelNow",
  "startAllowlistImport",
  "clearAllowlist",
  "cancelAllowlistImport",
  "setMigrationMode",
  "runGroupRouter",
  "undoRouterRun",
  "createLeashSpace",
  "runGuestOnboardingNow",
  "runSpaceBackfill",
  "dismissOverflowEntry",
  "runLicenceRefreshNow",
  "runJoinerSweepNow",
  "setLeashAdminEnforced",
  "addLeashAdmin",
  "removeLeashAdmin",
  "grantAccess",
]);

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function findCall(value: unknown): { call: JsonObject; context?: JsonObject } | undefined {
  const root = object(value);
  if (!root) return undefined;
  const direct = object(root.call);
  if (typeof direct?.functionKey === "string") return { call: direct, context: object(root.context) };
  for (const child of Object.values(root)) {
    const hit = findCall(child);
    if (hit) return hit;
  }
  return undefined;
}

export interface ForgeInvocation {
  functionKey: string;
  moduleKey?: string;
  payload?: JsonObject;
}

/** Decode only the resolver metadata needed by assertions; raw request bodies are never retained. */
export function forgeInvocation(request: Request): ForgeInvocation | undefined {
  if (request.method() !== "POST") return undefined;
  let body: unknown;
  try {
    body = request.postDataJSON();
  } catch {
    const raw = request.postData();
    if (!raw) return undefined;
    try { body = JSON.parse(raw); } catch { return undefined; }
  }
  const hit = findCall(body);
  if (!hit || typeof hit.call.functionKey !== "string") return undefined;
  return {
    functionKey: hit.call.functionKey,
    moduleKey: typeof hit.context?.moduleKey === "string" ? hit.context.moduleKey : undefined,
    payload: object(hit.call.payload),
  };
}

function origin(url: string): string | undefined {
  try { return new URL(url).origin; } catch { return undefined; }
}

function safeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.slice(0, 300);
  }
}

function requestFrameUrl(request: Request): string {
  try { return request.frame().url(); } catch { return ""; }
}

interface RequestProblem {
  url: string;
  status?: number;
  failure?: string;
  invocation?: ForgeInvocation;
  frameUrl: string;
}

export interface FreshnessUpdate {
  key: "admin_verdict_ttl_minutes";
  value: string;
}

/** Scenario-local app-noise and resolver observer. Host CSP noise stays in raw evidence but cannot fail this app. */
export class LicenseLeashObserver {
  readonly freshnessUpdates: FreshnessUpdate[] = [];
  readonly mutationCalls: Array<{ functionKey: string; key?: string }> = [];
  private readonly invocationCounts = new Map<string, number>();
  private readonly consoleErrors: Array<{ text: string; url: string }> = [];
  private readonly pageErrors: string[] = [];
  private readonly requestProblems: RequestProblem[] = [];
  private readonly responseInspections: Array<Promise<void>> = [];
  private appOrigin?: string;

  constructor(private readonly page: Page, private readonly moduleKey: string) {
    page.on("console", (message) => this.onConsole(message));
    page.on("pageerror", (error) => this.pageErrors.push(String(error.stack || error.message || error)));
    page.on("request", (request) => this.onRequest(request));
    page.on("requestfailed", (request) => {
      const failure = request.failure()?.errorText ?? "request failed";
      // Page navigation intentionally aborts the old iframe's outstanding poll.
      if (/ERR_ABORTED|NS_BINDING_ABORTED/i.test(failure)) return;
      this.requestProblems.push({
        url: request.url(), failure, frameUrl: requestFrameUrl(request),
        invocation: forgeInvocation(request),
      });
    });
    page.on("response", (response) => {
      const inspection = this.onResponse(response);
      this.responseInspections.push(inspection);
      void inspection;
    });
  }

  setAppUrl(url: string): void {
    this.appOrigin = origin(url);
  }

  counts(names: readonly string[]): Record<string, number> {
    return Object.fromEntries(names.map((name) => [name, this.invocationCounts.get(name) ?? 0]));
  }

  assertOnlyFreshnessMutations(): void {
    const unexpected = this.mutationCalls.filter((call) =>
      call.functionKey !== "updateConfig" || call.key !== "admin_verdict_ttl_minutes");
    expect(unexpected, "no Settings action except the allow-listed freshness save may mutate live state").toEqual([]);
  }

  assertNoMutations(): void {
    expect(this.mutationCalls, "the visual journey must remain read-only").toEqual([]);
  }

  async assertNoAppErrors(): Promise<void> {
    await Promise.all(this.responseInspections);
    const appOrigin = this.appOrigin;
    const consoleErrors = this.consoleErrors.filter((entry) => appOrigin && origin(entry.url) === appOrigin);
    const pageErrors = this.pageErrors.filter((entry) => appOrigin && entry.includes(appOrigin));
    const requests = this.requestProblems.filter((problem) => {
      if (problem.invocation?.moduleKey === this.moduleKey) return true;
      return !!appOrigin && (
        origin(problem.url) === appOrigin || origin(problem.frameUrl) === appOrigin
      );
    }).map((problem) => ({
      url: safeUrl(problem.url),
      status: problem.status,
      failure: problem.failure,
      resolver: problem.invocation?.functionKey,
    }));

    expect(consoleErrors, "no console errors emitted by the License Leash iframe").toEqual([]);
    expect(pageErrors, "no uncaught errors emitted by the License Leash iframe").toEqual([]);
    expect(requests, "no failed License Leash requests").toEqual([]);
  }

  private onConsole(message: ConsoleMessage): void {
    if (message.type() !== "error") return;
    this.consoleErrors.push({ text: message.text().slice(0, 600), url: message.location().url || "" });
  }

  private onRequest(request: Request): void {
    const invocation = forgeInvocation(request);
    if (!invocation || invocation.moduleKey !== this.moduleKey) return;
    this.invocationCounts.set(invocation.functionKey, (this.invocationCounts.get(invocation.functionKey) ?? 0) + 1);
    if (!MUTATING_RESOLVERS.has(invocation.functionKey)) return;

    const key = typeof invocation.payload?.key === "string" ? invocation.payload.key : undefined;
    this.mutationCalls.push({ functionKey: invocation.functionKey, key });
    if (invocation.functionKey === "updateConfig" && key === "admin_verdict_ttl_minutes") {
      this.freshnessUpdates.push({ key, value: String(invocation.payload?.value ?? "") });
    }
  }

  private async onResponse(response: Response): Promise<void> {
    const request = response.request();
    const invocation = forgeInvocation(request);
    if (/\.(png|jpe?g|gif|webp|woff2?|css|svg|ico|map)(\?|$)/i.test(response.url())) return;
    if (response.status() >= 400) {
      this.requestProblems.push({
        url: response.url(), status: response.status(), frameUrl: requestFrameUrl(request), invocation,
      });
      return;
    }
    if (invocation?.moduleKey !== this.moduleKey) return;

    // Forge's GraphQL relay can answer HTTP 200 while the resolver invocation
    // itself failed. Inspect only its success/error envelope; never retain body data.
    try {
      const json = object(await response.json());
      const data = object(json?.data);
      const envelope = object(data?.invokeExtension);
      const errors = envelope?.errors;
      const hasErrors = Array.isArray(errors)
        ? errors.length > 0
        : errors !== null && errors !== undefined && (typeof errors !== "object" || Object.keys(errors as object).length > 0);
      if (envelope?.success === false || hasErrors) {
        this.requestProblems.push({
          url: response.url(), status: response.status(), frameUrl: requestFrameUrl(request), invocation,
          failure: "Forge resolver response reported failure",
        });
      }
    } catch { /* non-JSON success response */ }
  }
}

export interface SettingsSurface {
  frame: FrameLocator;
  shell: Locator;
  panels: Locator;
  tabs: Locator;
  appUrl: string;
}

export async function enterSettings(
  page: Page,
  recorder: Recorder,
  target: Target,
  theme: SettingsTheme,
  captureFrames = true,
): Promise<SettingsSurface> {
  if (captureFrames) recorder.setFrames(await dumpForgeFrames(page));
  const surface = await enterForgeSurface(page, { surface: target.surface, readySelector: target.readySelector, timeout: 45_000 });
  if (surface.kind !== "custom") throw new Error("License Leash Settings must render in a Custom UI iframe");
  recorder.attachSurface(surface);

  const frame = surface.frame;
  await expect(frame.getByRole("heading", { name: "License Leash", exact: true })).toBeVisible({ timeout: 30_000 });
  const settings = frame.getByRole("button", { name: "Settings", exact: true });
  await expect(settings, "the signed-in operator can open Settings").toBeVisible({ timeout: 30_000 });
  await settings.click();

  const heading = frame.getByRole("heading", { name: "Configuration", exact: true });
  await expect(heading).toBeVisible({ timeout: 30_000 });
  const shell = heading.locator("..");
  const panels = shell.locator('[role="tabpanel"]');
  const tabs = shell.getByRole("tablist", { name: "Settings categories" });
  await expect(panels).toHaveCount(SETTINGS_TABS.length);

  await pinTheme(frame, theme);
  const appUrl = await surface.root.evaluate(() => window.location.href);
  return { frame, shell, panels, tabs, appUrl };
}

export async function pinTheme(frame: FrameLocator, theme: SettingsTheme): Promise<void> {
  const root = frame.locator(":root");
  await root.evaluate((element, selectedTheme) => {
    type ThemePinWindow = Window & { __licenseLeashThemePin?: MutationObserver };
    const win = window as ThemePinWindow;
    win.__licenseLeashThemePin?.disconnect();
    const apply = () => {
      if (element.getAttribute("data-color-mode") !== selectedTheme) element.setAttribute("data-color-mode", selectedTheme);
      if (element.getAttribute("data-theme") !== selectedTheme) element.setAttribute("data-theme", selectedTheme);
      (element as HTMLElement).style.colorScheme = selectedTheme;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(element, { attributes: true, attributeFilter: ["data-color-mode", "data-theme"] });
    win.__licenseLeashThemePin = observer;
  }, theme);
  await expect.poll(async () => root.getAttribute("data-color-mode"), { timeout: 10_000 }).toBe(theme);
  await expect.poll(async () => root.getAttribute("data-theme"), { timeout: 10_000 }).toBe(theme);
}

export async function waitForSettingsToSettle(shell: Locator): Promise<void> {
  await expect.poll(
    async () => shell.locator("*").evaluateAll((elements) => elements.filter((element) =>
      getComputedStyle(element).animationName.split(",").some((name) => name.trim() === "shimmer"),
    ).length),
    { timeout: 60_000, intervals: [250, 500, 1000] },
  ).toBe(0);
}

export async function selectAndAssertTab(surface: SettingsSurface, label: string, index: number): Promise<void> {
  const tabButtons = surface.tabs.getByRole("tab");
  await expect(tabButtons).toHaveCount(SETTINGS_TABS.length);
  expect((await tabButtons.allTextContents()).map((text) => text.trim())).toEqual([...SETTINGS_TABS]);

  const selected = surface.tabs.getByRole("tab", { name: label, exact: true });
  await selected.click();
  await expect(selected).toHaveAttribute("aria-selected", "true");

  const state = await surface.panels.evaluateAll((panels) => panels.map((panel) => {
    const style = getComputedStyle(panel);
    const rect = panel.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }));
  expect(state, "all Settings tab panels remain mounted").toHaveLength(SETTINGS_TABS.length);
  expect(state.flatMap((visible, panelIndex) => visible ? [panelIndex] : []), "exactly the selected panel is visible").toEqual([index]);
  expect(await surface.tabs.getByRole("tab", { selected: true }).count(), "exactly one Settings tab is selected").toBe(1);
}

export async function assertContainedLayout(surface: SettingsSurface): Promise<void> {
  const result = await surface.frame.locator(":root").evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const clientWidth = doc.clientWidth;
    const scrollWidth = Math.max(doc.scrollWidth, body.scrollWidth);
    const overflowingControls = Array.from(document.querySelectorAll<HTMLElement>(
      'button, input, textarea, [role="button"]',
    )).flatMap((element) => {
      if (element.closest('[role="tablist"][aria-label="Settings categories"]')) return [];
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || rect.width === 0 || rect.height === 0) return [];
      if (rect.left >= -1 && rect.right <= clientWidth + 1) return [];
      return [{
        tag: element.tagName.toLowerCase(),
        name: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 80) || element.getAttribute("placeholder") || "",
        left: Math.round(rect.left), right: Math.round(rect.right), clientWidth,
      }];
    });
    return { clientWidth, scrollWidth, overflowingControls };
  });
  expect(result.scrollWidth, `app document scrollWidth ${result.scrollWidth} must fit clientWidth ${result.clientWidth}`).toBeLessThanOrEqual(result.clientWidth + 1);
  expect(result.overflowingControls, "visible controls outside the app document (the internally scrollable tab strip is exempt)").toEqual([]);
}

export async function openGroupMenuAndAssertContained(surface: SettingsSurface): Promise<void> {
  const input = surface.shell.locator('input[placeholder="Type to search groups..."]').first();
  await expect(input, "manual group picker is available after groups load").toBeVisible({ timeout: 45_000 });
  await input.focus();
  await expect.poll(async () => input.evaluate((element) => {
    const container = element.parentElement?.parentElement;
    return !!Array.from(container?.children ?? []).find((child) => getComputedStyle(child).position === "absolute");
  }), { timeout: 15_000 }).toBe(true);

  const geometry = await input.evaluate((element) => {
    const container = element.parentElement?.parentElement;
    const dropdown = Array.from(container?.children ?? []).find((child) => getComputedStyle(child).position === "absolute") as HTMLElement | undefined;
    if (!dropdown) return { found: false, left: 0, right: 0, clientWidth: document.documentElement.clientWidth, clippedBy: [] as string[] };
    const rect = dropdown.getBoundingClientRect();
    const clippedBy: string[] = [];
    for (let ancestor = dropdown.parentElement; ancestor; ancestor = ancestor.parentElement) {
      // Vertical page scrolling is expected; only component ancestors can clip
      // the absolutely-positioned menu.
      if (ancestor === document.body || ancestor === document.documentElement) continue;
      const style = getComputedStyle(ancestor);
      const clipsX = /(auto|scroll|hidden|clip)/.test(style.overflowX);
      const clipsY = /(auto|scroll|hidden|clip)/.test(style.overflowY);
      if (!clipsX && !clipsY) continue;
      const ancestorRect = ancestor.getBoundingClientRect();
      if ((clipsX && (rect.left < ancestorRect.left - 1 || rect.right > ancestorRect.right + 1)) ||
          (clipsY && (rect.top < ancestorRect.top - 1 || rect.bottom > ancestorRect.bottom + 1))) {
        clippedBy.push(`${ancestor.tagName.toLowerCase()}.${ancestor.className || "(no-class)"}`);
      }
    }
    return {
      found: true, left: rect.left, right: rect.right,
      clientWidth: document.documentElement.clientWidth, clippedBy,
    };
  });
  expect(geometry.found).toBe(true);
  expect(geometry.left).toBeGreaterThanOrEqual(-1);
  expect(geometry.right).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.clippedBy, "custom group menu is not clipped by an overflow ancestor").toEqual([]);
}

export async function closeGroupMenu(surface: SettingsSurface): Promise<void> {
  await surface.frame.getByRole("heading", { name: "Configuration", exact: true }).click();
}

export async function assertExpectedBuildStamp(surface: SettingsSurface): Promise<void> {
  const expected = process.env.EXPECTED_APP_SHA?.trim();
  if (!expected) return;
  const maintenance = surface.panels.nth(SETTINGS_TABS.indexOf("Maintenance"));
  const stamp = maintenance.getByText("Dashboard build", { exact: true }).locator("../..").locator("code");
  await expect(stamp).toBeAttached();
  const value = (await stamp.textContent() ?? "").trim();
  expect(value, "Maintenance build stamp must identify EXPECTED_APP_SHA").toMatch(new RegExp(`^${expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*·`));
  expect(value, "a trailing + means the deployed dashboard was built from a dirty tree").not.toMatch(/^\S+\+\s*·/);
}

export function freshnessField(surface: SettingsSurface): { field: Locator; input: Locator; save: Locator } {
  const accessPanel = surface.panels.nth(SETTINGS_TABS.indexOf("App access"));
  const field = accessPanel.getByText("Sign-in check freshness (minutes)", { exact: true }).locator("..");
  return {
    field,
    input: field.locator('input[type="number"]'),
    save: field.getByRole("button", { name: "Save", exact: true }),
  };
}
