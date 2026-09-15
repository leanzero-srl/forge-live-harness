// Settings consoles regroup + first-run setup (UX review 2026-09-14 §3, P2).
//   1. the site console renders the four outcome groups (Protection / Expiry / Alerts / Advanced),
//      each row with a one-line effect and an "Effective default: …" line read from the engine's
//      own defaults — the two contradictions the review found are asserted at the value level
//      (48 h, force-unseal ON);
//   2. a nested toggle is DISABLED with the reason while its parent is off and usable once the
//      parent is on (UI only — nothing is saved);
//   3. first-run: `setupCompletedAt` is removed from admin-settings-global through the hook
//      (what=set with the merged object) → reload opens the three-step setup → 1 week / Standard →
//      Finish → KVS carries the mapped keys + the stamp; the global is put back as captured, the
//      stamp KEPT (without it every later console spec would open on the setup, not the settings);
//   4. the space console's settings tabs show "Site default: …" next to each space override.
// Dev-scoped; the durable global/space records are restored exactly (it47), stamp aside.
import { test, expect } from "../../fixtures/forge";
import { getTestState } from "../../testhook/client";
import { getTarget } from "../../config/targets";
import { enterForgeSurface, ensureInViewport } from "../../forge/frame";

const S = getTarget("sentinel-steward-console");
const R = getTarget("sentinel-vault-realm");
const GLOBAL = "admin-settings-global";
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });

test.describe.configure({ timeout: 180_000, retries: 1 });

async function openSteward(page: any) {
  await page.goto(S.deepLink(S.envId)!, { waitUntil: "domcontentloaded" });
  const s = await enterForgeSurface(page, { surface: "custom", readySelector: ".admin-title", timeout: 45000 });
  if (s.kind !== "custom") throw new Error("expected Custom UI");
  const app = s.frame;
  await expect(app.locator(".admin-title")).toBeVisible({ timeout: 15000 });
  return app;
}
async function openRealm(page: any, tab: string) {
  await page.goto(R.deepLink(R.envId)!, { waitUntil: "domcontentloaded" });
  const s = await enterForgeSurface(page, { surface: "custom", readySelector: ".space-admin-title", timeout: 45000 });
  if (s.kind !== "custom") throw new Error("expected Custom UI");
  const app = s.frame;
  await expect(app.locator(".space-admin-title")).toBeVisible({ timeout: 15000 });
  await app.locator(".tab-navigation .tab-button", { hasText: tab }).click();
  await page.waitForTimeout(800);
  return app;
}

// A site that has never been stamped opens on the setup; stamp it once so the steady state is the
// settings view (the first-run test removes and re-adds the stamp on its own).
test.beforeAll(async () => {
  const g = await getKvs(GLOBAL);
  if (!g || !g.setupCompletedAt) {
    await setKvs(GLOBAL, { ...(g || {}), setupCompletedAt: new Date().toISOString() });
    console.log("### beforeAll: stamped setupCompletedAt on a never-set-up site");
  }
});

test("first-run: no setupCompletedAt → three steps → 1 week / Standard → Finish writes the mapped keys + the stamp", async ({ page }) => {
  const orig = await getKvs(GLOBAL);
  const base = orig && typeof orig === "object" ? { ...orig } : {};
  const { setupCompletedAt: _dropped, ...withoutStamp } = base;
  let stampAfter: string | null = null;
  try {
    await setKvs(GLOBAL, withoutStamp);
    expect((await getKvs(GLOBAL))?.setupCompletedAt, "hook removed the stamp").toBeUndefined();

    // The hook's read-back is immediate, but the app's own load-policy invocation can still see the
    // pre-write record for a few seconds (KVS read-after-write across invocations); re-open up to
    // three times before calling it a failure.
    let app = await openSteward(page);
    for (let attempt = 1; attempt <= 3 && (await app.locator('[data-testid="sv-setup"]').count()) === 0; attempt++) {
      console.log(`### setup not shown yet (attempt ${attempt}) — re-opening`);
      await page.waitForTimeout(4000);
      app = await openSteward(page);
    }
    await expect(app.locator('[data-testid="sv-setup"]'), "setup opens when the stamp is missing").toBeVisible({ timeout: 15000 });
    await expect(app.locator(".tab-navigation"), "no settings tabs while the setup is open").toHaveCount(0);

    // step 1 — 1 week
    await expect(app.locator('[data-testid="sv-setup-panel-1"]')).toBeVisible();
    await app.locator('[data-testid="sv-setup-duration-1w"]').click();
    await expect(app.locator('[data-testid="sv-setup-duration-1w"]')).toHaveAttribute("aria-checked", "true");
    await app.locator('[data-testid="sv-setup-next"]').click();

    // step 2 — Standard
    await expect(app.locator('[data-testid="sv-setup-panel-2"]')).toBeVisible();
    await app.locator('[data-testid="sv-setup-profile-standard"]').click();
    await expect(app.locator('[data-testid="sv-setup-profile-standard"]')).toHaveAttribute("aria-checked", "true");
    await app.locator('[data-testid="sv-setup-next"]').click();

    // step 3 — provider detected (native | app), never stuck on "detecting"
    await expect(app.locator('[data-testid="sv-setup-panel-3"]')).toBeVisible();
    await expect.poll(async () => await app.locator('[data-testid="sv-setup-provider"]').getAttribute("data-provider"), { timeout: 20000 })
      .toMatch(/^(native|app)$/);
    const provider = await app.locator('[data-testid="sv-setup-provider"]').getAttribute("data-provider");
    console.log("### classification provider detected:", provider);
    await app.locator('[data-testid="sv-setup-finish"]').click();

    // Finish → the settings view, and the KVS carries the mapped keys + the stamp
    await expect(app.locator('[data-testid="sv-group-protection"]'), "settings view after Finish").toBeVisible({ timeout: 15000 });
    await expect.poll(async () => (await getKvs(GLOBAL))?.setupCompletedAt ?? null, { timeout: 15000, message: "setupCompletedAt written" }).not.toBeNull();
    const g = await getKvs(GLOBAL);
    stampAfter = g.setupCompletedAt;
    expect(Number.isFinite(Date.parse(g.setupCompletedAt)), "stamp is an ISO timestamp").toBe(true);
    expect(g.defaultLockDuration, "1 week → 604800 s").toBe(7 * 24 * 3600);
    expect(g.enableFlashMessages, "Standard keeps pop-ups").toBe(true);
    expect(g.enableDocRibbons, "Standard keeps the ribbon").toBe(true);
    expect(g.enableEmailDispatches, "Standard opens the comment master").toBe(true);
    expect(g.enableConfluenceDispatches, "Standard posts violation comments").toBe(true);
    expect(g.enableSealExpiryReminderEmail, "Standard: no seal-confirmation/halfway notices").toBe(false);
    expect(g.enableAutoUnsealDispatchEmail, "Standard: no expiry/release notices").toBe(false);
    // the merge kept everything else the record had
    for (const k of Object.keys(withoutStamp)) {
      if (["defaultLockDuration", "enableFlashMessages", "enableDocRibbons", "enableEmailDispatches", "enableConfluenceDispatches", "enableSealExpiryReminderEmail", "enableAutoUnsealDispatchEmail"].includes(k)) continue;
      expect(g[k], `untouched key ${k} kept by the merge`).toEqual(withoutStamp[k]);
    }
    console.log("### first-run Finish → mapped keys + setupCompletedAt ✓");

    // reload → settings view (the stamp is honoured), and the Expiry card shows 1 week
    const app2 = await openSteward(page);
    await expect(app2.locator('[data-testid="sv-setup"]')).toHaveCount(0);
    const dur = app2.locator('[data-testid="sv-row-defaultLockDuration"] input[type="number"]');
    expect((await dur.inputValue()).trim(), "168 h after reload").toBe("168");
  } finally {
    // put the record back as captured; keep A stamp so the steady state is the settings view
    const restored = { ...base, setupCompletedAt: base.setupCompletedAt || stampAfter || new Date().toISOString() };
    if (orig) await setKvs(GLOBAL, restored); else await setKvs(GLOBAL, { setupCompletedAt: restored.setupCompletedAt });
  }
  const after = await getKvs(GLOBAL);
  const { setupCompletedAt: _a, ...afterRest } = after || {};
  const { setupCompletedAt: _b, ...origRest } = base;
  expect(afterRest, "admin-settings-global restored EXACTLY (stamp aside)").toEqual(origRest);
});

test("site console: four outcome groups, one-line effects, effective defaults from the engine", async ({ page }) => {
  const app = await openSteward(page);
  await expect(app.locator('[data-testid="sv-setup"]'), "steady state is the settings view").toHaveCount(0);
  for (const g of ["protection", "expiry", "alerts", "advanced"]) {
    const card = app.locator(`[data-testid="sv-group-${g}"]`);
    await expect(card, `group ${g} rendered`).toBeVisible();
    await expect(card.locator(".sv-group-head .sv-group-text"), `group ${g} has its one-line description`).not.toBeEmpty();
    const rows = card.locator(".settings-row[data-testid^='sv-row-']");
    const n = await rows.count();
    expect(n, `group ${g} has rows`).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const row = rows.nth(i);
      const id = await row.getAttribute("data-testid");
      if (/sv-row-(validations-link|classification-link|rerun-setup)/.test(id || "")) continue;
      await expect(row.locator(".settings-row-description"), `${id} has a description`).not.toBeEmpty();
      await expect(row.locator(".settings-row-default"), `${id} shows its effective default`).toContainText("Effective default:");
    }
  }
  // the two value-level contradictions the review found, fixed at the source
  await expect(app.locator('[data-testid="sv-default-defaultLockDuration"]'), "G1: 48 h, not the old 24 h UI seed").toContainText("48 hours (2 days)");
  await expect(app.locator('[data-testid="sv-default-allowAdminOverride"]'), "G2: force-unseal defaults ON like the engine").toContainText("Effective default: On");
  // A7: the recurring banner lives under Expiry (its real parent), not under the comment master
  await expect(app.locator('[data-testid="sv-group-expiry"] [data-testid="sv-row-enablePeriodicReminderEmail"]')).toBeVisible();
  await expect(app.locator('[data-testid="sv-group-alerts"] [data-testid="sv-row-enablePeriodicReminderEmail"]')).toHaveCount(0);
  // the tab that the classification spec drives is still there, and the setup can be re-run
  await expect(app.locator('[data-testid="tab-classification"]')).toBeVisible();
  await expect(app.locator('[data-testid="sv-rerun-setup"]')).toBeVisible();
  await expect(app.locator('[data-testid="sv-quiet-note"]')).toBeVisible();
  const labels = await app.locator(".sv-group .settings-row-label").allInnerTexts();
  console.log("### site console rows:", JSON.stringify(labels));
});

test("site console: a nested toggle is disabled with the reason while its parent is off, usable once it is on", async ({ page }) => {
  const app = await openSteward(page);
  const parent = app.locator('[data-testid="sv-row-enableEmailDispatches"] input[type="checkbox"]');
  const child = app.locator('[data-testid="sv-row-enableSealExpiryReminderEmail"]');
  const childBox = child.locator('input[type="checkbox"]');
  // start from parent OFF (UI only — never saved)
  await ensureInViewport(page, parent);
  await parent.setChecked(false);
  await expect(parent).not.toBeChecked();
  await expect(child).toHaveAttribute("data-locked", "true");
  await expect(childBox).toBeDisabled();
  await expect(child.locator('[data-testid="sv-reason-enableSealExpiryReminderEmail"]')).toHaveText("Turn on Page comments that mention people first");
  await expect(child).toHaveClass(/is-dependent/);
  // parent ON → usable, reason gone
  await parent.setChecked(true);
  await expect(parent).toBeChecked();
  await expect(child).toHaveAttribute("data-locked", "false");
  await expect(childBox).toBeEnabled();
  await expect(child.locator('[data-testid="sv-reason-enableSealExpiryReminderEmail"]')).toHaveCount(0);
  // the same rule on the Expiry card: the recurring banner needs "Seals expire" OFF
  const expire = app.locator('[data-testid="sv-row-autoUnlockEnabled"] input[type="checkbox"]');
  const banner = app.locator('[data-testid="sv-row-enablePeriodicReminderEmail"]');
  await ensureInViewport(page, expire);
  await expire.setChecked(true);
  await expect(expire).toBeChecked();
  await expect(banner).toHaveAttribute("data-locked", "true");
  await expect(banner.locator(".settings-row-reason")).toHaveText("Turn off Seals expire first");
  await expire.setChecked(false);
  await expect(expire).not.toBeChecked();
  await expect(banner).toHaveAttribute("data-locked", "false");
  console.log("### nested dependency: locked → reason → unlocked ✓ (nothing saved)");
});

test("space console: the settings tabs show 'Site default: …' next to each space override", async ({ page }) => {
  const g = await getKvs(GLOBAL);
  const siteHours = Math.round(((g?.defaultLockDuration > 0 ? g.defaultLockDuration : 172800) as number) / 3600);
  let app = await openRealm(page, "Seal Duration");
  const sd = app.locator('[data-testid="sv-site-default-autoUnlockTimeoutHours"]');
  await expect(sd, "Seal Duration shows the site default").toBeVisible();
  await expect(sd).toContainText(`${siteHours} hour`);
  await expect(app.locator('[data-testid="sv-row-autoUnlockTimeoutHours"] .settings-row-default')).toContainText("Site default:");
  console.log("### seal duration site default:", await sd.innerText());

  app = await openRealm(page, "Macro");
  const macroSite = app.locator('[data-testid="sv-site-default-autoInsertMacro"]');
  await expect(macroSite, "Macro shows the site default").toBeVisible();
  const siteAuto = g?.globalAutoInsertMacro === true;
  await expect(macroSite).toHaveText(siteAuto ? "On" : "Off");
  const autoRow = app.locator('[data-testid="sv-row-autoInsertMacro"]');
  if (!siteAuto) {
    await expect(autoRow, "space auto-insert is locked while the site has it off").toHaveAttribute("data-locked", "true");
    await expect(autoRow.locator(".settings-row-reason")).toContainText("Off site-wide by a site admin");
    await expect(autoRow.locator('input[type="checkbox"]')).toBeDisabled();
  } else {
    await expect(autoRow).toHaveAttribute("data-locked", "false");
  }
  console.log("### macro site default:", await macroSite.innerText(), "locked:", await autoRow.getAttribute("data-locked"));

  app = await openRealm(page, "Access Control");
  await expect(app.locator('[data-testid="sv-site-default-notificationsMode"]'), "Notifications shows the site state").toBeVisible();
  await expect(app.locator('[data-testid="sv-site-default-notificationsMode"]')).toContainText(g?.enableEmailDispatches === true ? "On site-wide" : "Off site-wide");
  await expect(app.getByText("Space Activation"), "the inert Space Activation control is gone").toHaveCount(0);
  console.log("### space console site-default lines ✓");
});
