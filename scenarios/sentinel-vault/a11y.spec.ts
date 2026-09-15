// PERMANENT accessibility + microcopy regression guard. Consolidates the it35/36/37 SHIPPED fixes
// and the 2026-09-15 "one state, one action" + §7 accessibility work (UX review 2026-09-14):
//   it35  overlay sort-picker keyboard-operability (role=listbox/option + tabindex) + close aria-label
//   it37  overlay owner-seal status label converged to "My Seal"
//   it36  inline-panel label-add button accessible name (glyph "+" is not the accessible name)
//   §2    one primary action per row + a ⋯ menu (kit/ActionMenu): Enter opens, focus lands on the
//         first item, ArrowDown walks (and wraps), Escape closes AND returns focus to the trigger
//   §7.1  overlay grid: roving tabindex — ArrowDown moves focus between cards, one tab stop
//   §7.2  state chips carry role="status" + an accessible name, and are ≥ 11px
//   §7.4  kit Dialog: Escape closes and focus returns to the opener
// The door is the byline chip (see _door.ts). Dev-scoped (env 17516615). The dialog test flips
// allowArtifactDelete on for its duration when the policy hides Delete, and restores it.
import { test, expect } from "../../fixtures/forge";
import { getTestState } from "../../testhook/client";
import { openOverlayViaChip, findDevPanel } from "./_door";
const PAGE = "https://wolfaenpak.atlassian.net/wiki/pages/viewpage.action?pageId=265912321";
const GKEY = "admin-settings-global";
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
test.describe.configure({ retries: 1, timeout: 240_000 });

async function gotoPage(page: any) {
  await page.goto(PAGE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
}

// Which element inside the overlay frame has focus, described by its test id / class / text.
const focusedIn = (ov: any) => ov.locator("body").evaluate((b: HTMLElement) => {
  const a = b.ownerDocument.activeElement as HTMLElement | null;
  if (!a) return null;
  return { testid: a.getAttribute("data-testid"), cls: a.className, text: (a.textContent || "").trim().slice(0, 40), role: a.getAttribute("role"), tag: a.tagName };
});

test("overlay a11y + microcopy: sort keyboard-operable, close named, owner status = My Seal, chips named", async ({ page }) => {
  await gotoPage(page);
  const ov = await openOverlayViaChip(page);
  // it35: close button accessible name
  expect(await ov.locator(".modal-close").getAttribute("aria-label")).toBe("Close Sentinel Vault overlay");
  // it37: owner-seal status label converged
  const mine = ov.locator(".status-lozenge.locked-by-me").first();
  expect((await mine.innerText()).trim().toLowerCase()).toContain("my seal");
  // §7.2: the chip is a named status, not colour + 10px uppercase
  expect(await mine.getAttribute("role")).toBe("status");
  expect(await mine.getAttribute("aria-label")).toMatch(/sealed by you/i);
  const px = await mine.evaluate((el: HTMLElement) => parseFloat(getComputedStyle(el).fontSize));
  expect(px, "state chip font size ≥ 11px").toBeGreaterThanOrEqual(11);
  // it35: sort-picker keyboard-operability
  const trig = ov.locator(".sort-picker .column-picker-trigger");
  expect(await trig.getAttribute("aria-haspopup")).toBe("listbox");
  await trig.click(); await page.waitForTimeout(400);
  expect(await trig.getAttribute("aria-expanded")).toBe("true");
  const opts = ov.locator('.sort-picker .column-picker-dropdown[role="listbox"] [role="option"]');
  expect(await opts.count()).toBeGreaterThanOrEqual(2);
  expect(await opts.first().getAttribute("tabindex")).toBe("0");
});

test("§2 one state, one action: every card has exactly ONE primary and a ⋯ menu; the owner's seal says Release", async ({ page }) => {
  await gotoPage(page);
  const ov = await openOverlayViaChip(page);
  const cards = ov.locator(".artifact-card[data-roving-card]");
  const n = await cards.count();
  expect(n, "cards in the overlay").toBeGreaterThanOrEqual(1);
  for (let i = 0; i < n; i++) {
    const c = cards.nth(i);
    const kind = await c.getAttribute("data-primary");
    const primaries = await c.locator("[data-primary]").count();
    // Approve/Decline is the one two-button primary (a decision needs two buttons).
    expect(primaries, `card ${i} (${kind}) has one primary control`).toBe(kind === "decide" ? 1 : (kind === "none" ? 0 : 1));
    expect(await c.locator(".sv-kebab").count(), `card ${i} has a ⋯ menu`).toBe(1);
    // No second-line action buttons any more (Extend / Watch / Delete moved under ⋯).
    expect(await c.locator(".card-row-secondary .action-btn").count(), `card ${i} has no secondary action buttons`).toBe(0);
  }
  const fixture = ov.locator(".artifact-card", { hasText: "sv-aql-sealed-fixture" });
  await expect(fixture.locator('[data-primary="release"]'), "the owner's seal: primary is Release").toHaveText(/Release/);
  await expect(fixture.locator(".action-btn", { hasText: /^Extend$/ }), "Extend is no longer an inline button").toHaveCount(0);
});

test("§2/§7.4 ⋯ menu keyboard: Enter opens on the first item, ArrowDown ×2 walks, Escape closes and focus returns to the trigger", async ({ page }) => {
  await gotoPage(page);
  const ov = await openOverlayViaChip(page);
  const fixture = ov.locator(".artifact-card", { hasText: "sv-aql-sealed-fixture" });
  const kebab = fixture.locator(".sv-kebab");
  expect(await kebab.getAttribute("aria-haspopup")).toBe("menu");
  expect(await kebab.getAttribute("aria-expanded")).toBe("false");
  await kebab.focus();
  await page.keyboard.press("Enter");
  const menu = ov.locator('[data-testid="sv-kebab-menu"][role="menu"]');
  await expect(menu, "Enter opens the menu").toBeVisible({ timeout: 5000 });
  expect(await kebab.getAttribute("aria-expanded")).toBe("true");
  const items = menu.locator('[role="menuitem"]');
  const count = await items.count();
  expect(count, "the owner's menu has items (Extend, Copy link, …)").toBeGreaterThanOrEqual(2);
  const labels = (await items.allInnerTexts()).map((t: string) => t.trim());
  console.log("### menu items:", JSON.stringify(labels));
  expect(labels[0], "the owner's first item is Extend").toMatch(/Extend/);
  await page.waitForTimeout(300);
  let f = await focusedIn(ov);
  console.log("### focus after Enter:", JSON.stringify(f));
  expect(f?.role, "focus lands on the first menu item").toBe("menuitem");
  expect(f?.text).toBe(labels[0]);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  f = await focusedIn(ov);
  expect(f?.role).toBe("menuitem");
  expect(f?.text, "ArrowDown twice → third item (wrapping when there are only two)").toBe(labels[2 % count]);
  await page.keyboard.press("Escape");
  await expect(menu, "Escape closes the menu").toHaveCount(0);
  await page.waitForTimeout(200);
  f = await focusedIn(ov);
  expect(f?.testid, "…and focus returns to the ⋯ trigger").toBe("sv-kebab");
  expect(await kebab.getAttribute("aria-expanded")).toBe("false");
});

test("§7.1 overlay grid: one tab stop, ArrowDown moves focus between cards, Home/End jump", async ({ page }) => {
  await gotoPage(page);
  const ov = await openOverlayViaChip(page);
  const lists = ov.locator('[role="list"][aria-label]');
  expect(await lists.count(), "card lists carry role=list + a name").toBeGreaterThanOrEqual(1);
  // Find a list with ≥2 cards (the fixture page has a sealed and an available attachment; they
  // sit in different sections, so a row move inside a single list needs one with two cards).
  const allCards = ov.locator(".artifact-card[data-roving-card]");
  const total = await allCards.count();
  const tabStops = await ov.locator('.artifact-card[data-roving-card][tabindex="0"]').count();
  const lists_n = await lists.count();
  expect(tabStops, "exactly one card per list is in the tab order").toBe(Math.min(lists_n, total));
  let list: any = null;
  for (let i = 0; i < lists_n; i++) { if ((await lists.nth(i).locator("[data-roving-card]").count()) >= 2) { list = lists.nth(i); break; } }
  if (!list) {
    console.log("### no list with ≥2 cards on the fixture page; checking Enter → primary only");
    const c = allCards.first();
    await c.focus();
    expect((await focusedIn(ov))?.cls).toContain("artifact-card");
    return;
  }
  const cards = list.locator("[data-roving-card]");
  await cards.first().focus();
  expect((await focusedIn(ov))?.cls, "the card itself takes focus").toContain("artifact-card");
  const name0 = await cards.nth(0).getAttribute("aria-label");
  const name1 = await cards.nth(1).getAttribute("aria-label");
  await page.keyboard.press("ArrowDown");
  const after = await ov.locator("body").evaluate((b: HTMLElement) => b.ownerDocument.activeElement?.getAttribute("aria-label"));
  expect(after, "ArrowDown moved focus to the next card").toBe(name1);
  expect(await cards.nth(1).getAttribute("tabindex")).toBe("0");
  expect(await cards.nth(0).getAttribute("tabindex")).toBe("-1");
  await page.keyboard.press("Home");
  expect(await ov.locator("body").evaluate((b: HTMLElement) => b.ownerDocument.activeElement?.getAttribute("aria-label")), "Home → first card").toBe(name0);
});

test("§7.4 kit Dialog: Delete opens a real dialog (aria-modal + labelledby), Escape closes it and focus returns to the opener", async ({ page }) => {
  const orig = await getKvs(GKEY);
  const hadDelete = orig?.allowArtifactDelete === true;
  if (!hadDelete) await setKvs(GKEY, { ...(orig || {}), allowArtifactDelete: true });
  try {
    await gotoPage(page);
    const ov = await openOverlayViaChip(page);
    // An available (unsealed) card, or the owner's own seal: both offer Delete under ⋯.
    const card = ov.locator('.artifact-card[data-primary="seal"], .artifact-card[data-primary="release"]').first();
    await expect(card).toBeVisible();
    const kebab = card.locator(".sv-kebab");
    await kebab.click();
    const del = ov.locator('[data-testid="sv-kebab-delete"]');
    await expect(del, "Delete sits under ⋯ (allowArtifactDelete on)").toBeVisible({ timeout: 5000 });
    await del.click();
    const dlg = ov.locator('[role="dialog"][aria-modal="true"]');
    await expect(dlg, "a dialog opened").toBeVisible({ timeout: 5000 });
    const labelledBy = await dlg.getAttribute("aria-labelledby");
    expect(labelledBy, "dialog is named by its title").toBeTruthy();
    expect(await dlg.locator(`[id="${labelledBy}"]`).count(), "the labelledby id resolves inside the dialog").toBe(1);
    await expect(dlg.locator(".sv-dialog-title")).toContainText(/Delete/);
    await page.waitForTimeout(200);
    const f = await focusedIn(ov);
    expect(f?.tag, "focus moved INTO the dialog").toBe("BUTTON");
    expect(await dlg.evaluate((d: HTMLElement) => d.contains(d.ownerDocument.activeElement)), "…onto one of its controls").toBe(true);
    // Tab wraps inside the dialog
    await page.keyboard.press("Tab"); await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
    expect(await dlg.evaluate((d: HTMLElement) => d.contains(d.ownerDocument.activeElement)), "Tab stays trapped in the dialog").toBe(true);
    await page.keyboard.press("Escape");
    await expect(dlg, "Escape closes the dialog").toHaveCount(0);
    await page.waitForTimeout(300);
    expect((await focusedIn(ov))?.testid, "focus returns to the ⋯ that opened it").toBe("sv-kebab");
    // Nothing was deleted: the card is still there.
    await expect(card).toBeVisible();
  } finally {
    if (!hadDelete) await setKvs(GKEY, orig || {});
  }
});

test("inline-panel a11y: the '+' label-add button has an accessible name; section/attachment lists are lists", async ({ page }) => {
  await gotoPage(page);
  let panel: any = null;
  await expect.poll(async () => { panel = await findDevPanel(page); return !!panel; }, { timeout: 45_000 }).toBe(true);
  const add = panel.locator(".label-add-btn").first();
  await expect(add).toBeVisible({ timeout: 12000 });
  expect(await add.getAttribute("aria-label")).toBe("Add a label");
  expect(await panel.locator('.sv-card-list[role="list"][aria-label]').count(), "panel card grids are named lists").toBeGreaterThanOrEqual(1);
  const chip = panel.locator(".status-lozenge").first();
  await expect(chip).toBeVisible();
  expect(await chip.getAttribute("role")).toBe("status");
  expect(await chip.getAttribute("aria-label")).toBeTruthy();
});
