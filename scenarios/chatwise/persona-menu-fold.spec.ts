// THE PERSONA MENU'S FOLD — the last row is reachable, and when it is not, the
// menu SAYS SO. Driven in a real browser, on BOTH surfaces, from the shipped
// component and the shipped CSS.
//
// WHAT THIS IS FOR
// ----------------
// A live run in the real Forge iframe found two geometry defects that every
// existing assertion passed straight through, because NOTHING WAS CLIPPED —
// scrolled down, the menu rendered perfectly.
//
//   GLOBAL PAGE, shipped roster, nothing blocked:
//     scrollHeight 576 / clientHeight 318, "Jira Administrator" starting 430px
//     down. The newest persona was below the fold on an ORDINARY install, and
//     the menu ended on a clean rounded edge with a 2px scrollbar, so it read
//     as the end of the list. The cause was the ROWS, not the height:
//     descriptions wrapped to three, four and six lines at 260px and made a
//     single row 94–144px tall.
//
//   ISSUE PANEL, three rows, nothing blocked — and PRE-EXISTING:
//     the picker sits directly above the composer, the menu only ever opened
//     downward, and it went top 418 / bottom 600 in a 524px iframe. 76px of it
//     was outside the iframe with no way to reach it at all.
//
// So there are three properties here, and the first two are MEASUREMENTS
// rather than the presence of a class:
//
//   1. WITH THE SHIPPED ROSTER, THE LAST ROW IS VISIBLE WITHOUT SCROLLING, at
//      the real menu width. Not "not clipped" — visible.
//   2. THE MENU IS NEVER OUTSIDE THE VIEWPORT. On the panel that means opening
//      upward, because there is no room below and no height would have fixed it.
//   3. WHEN IT DOES SCROLL, IT SAYS SO, in a solid saturated pill that counts
//      what is left, updates as you scroll, and retires itself at the bottom.
//
// BOTH SURFACES, TWICE. `--cw-*` on the global page, `--text-*`/`--button-*` on
// the panel; the CSS for all of this is duplicated in the app and a
// single-surface pass leaves half of it unverified. Then reduced motion,
// EMULATED AND ASSERTED.
import { test, expect, Page } from "@playwright/test";
import { buildStub, darkVariant, Surface } from "./_stub/build";

let PAGES: Record<Surface, string>;
test.beforeAll(() => {
  PAGES = buildStub();
});

const SURFACES: Surface[] = ["globalPage", "issuePanel"];

/**
 * Each surface's real geometry. The panel is a narrow sidebar in a short
 * iframe; the global page is a full window. Testing both at 1280x800 would be
 * testing a panel nobody has.
 */
const VIEWPORT: Record<Surface, { width: number; height: number }> = {
  globalPage: { width: 1280, height: 800 },
  issuePanel: { width: 460, height: 524 },
};

/**
 * THE SHIPPED ROSTER, VERBATIM — five factory personas with their real
 * descriptions, which is the whole point. A fixture with short descriptions
 * would fit in any menu and would have proved nothing: the global page's fold
 * was caused by exactly these sentences wrapping.
 */
const SHIPPED = `[
  { "id": "coffee-break-ai", "name": "Coffee Break AI",
    "description": "A laid-back, friendly assistant that keeps things casual while getting Jira work done.",
    "isFactory": true, "available": true },
  { "id": "jira-scrubber", "name": "JIRA Scrubber",
    "description": "A meticulous assistant focused on JIRA hygiene, data quality, and issue management.",
    "isFactory": true, "available": true },
  { "id": "epic-master", "name": "Epic Master",
    "description": "A strategic assistant for epic planning, decomposition, and roadmap thinking.",
    "isFactory": true, "available": true },
  { "id": "product-owner", "name": "Product Owner",
    "description": "A strategic, role-focused assistant for backlog management, prioritization, and product planning.",
    "isFactory": true, "available": true },
  { "id": "jira-admin", "name": "Jira Administrator",
    "description": "Reads how this Jira site is actually configured — workflows, schemes, fields, roles and grants — and explains why it behaves the way it does.",
    "isFactory": true, "available": true }
]`;

/**
 * The same roster with two rows BLOCKED. The tester's second measurement:
 * three-line explanation notes took the global page to 748px of content. The
 * fold must survive the worst ordinary case, not just the best one.
 */
const SHIPPED_WITH_BLOCKED = JSON.stringify(
  JSON.parse(SHIPPED).map((p: any) =>
    p.id === "jira-admin" || p.id === "product-owner"
      ? {
          ...p,
          available: false,
          unavailableReason:
            p.id === "jira-admin" ? "requires-jira-admin" : "admin-check-unavailable",
          unavailableHint:
            "Requires the Administer Jira permission on this site, which this " +
            "account does not currently hold on this Jira instance.",
        }
      : p,
  ),
);

/** A roster big enough that no sane ceiling fits it — the scrolling case. */
const OVERFLOWING = JSON.stringify([
  ...JSON.parse(SHIPPED),
  ...JSON.parse(SHIPPED).map((p: any, i: number) => ({
    ...p,
    id: `extra-${i}`,
    name: `Extra Assistant ${i}`,
  })),
]);

/** Alpha of a computed colour. 1 is a solid fill; anything less is a wash. */
const alphaOf = (c: string) => {
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (!m) return 1;
  const p = m[1].split(",");
  return p.length > 3 ? parseFloat(p[3]) : 1;
};

/**
 * Put the trigger where it actually sits on this surface.
 *
 * On the issue panel the picker is the element directly above the composer, so
 * in a 524px iframe its bottom edge is around 420px down — which is the entire
 * reason the menu had nowhere to go. The stub mounts the VERBATIM persona
 * markup but in a bay of its own, so the bay is moved to reproduce the shipped
 * geometry. What the code under test reads is the trigger's rect and
 * window.innerHeight, and both are then real.
 */
async function placeTrigger(page: Page, surface: Surface) {
  if (surface !== "issuePanel") return;
  await page.evaluate(() => {
    const bay = document.querySelector(".stub-persona-bay") as HTMLElement;
    bay.style.position = "fixed";
    bay.style.left = "0";
    bay.style.right = "0";
    bay.style.top = `${window.innerHeight - 106}px`;
  });
}

async function mount(
  page: Page,
  url: string,
  surface: Surface,
  fixture: string = SHIPPED,
  { reduced = false, highTrigger = false } = {},
) {
  await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
  await page.setViewportSize(VIEWPORT[surface]);
  await page.goto(url);
  const applied = await page.evaluate(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  expect(applied, "prefers-reduced-motion emulation did not apply").toBe(reduced);

  if (!highTrigger) await placeTrigger(page, surface);

  await page.evaluate((json) => {
    const w = window as any;
    w.sel = new w.CW.PersonaSelector(null, {});
    w.sel.setPersonas(JSON.parse(json));
    w.sel.open();
  }, fixture);

  await expect(page.locator("#dropdownOptions")).toHaveClass(/open/);
  await settle(page);
}

/** Wait for every animation in the menu to stop, so reads are resting values. */
async function settle(page: Page) {
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll("#dropdownOptions, #dropdownOptions *")).every(
        (el) => el.getAnimations().every((a) => a.playState !== "running"),
      ),
    undefined,
    { timeout: 5000 },
  );
}

/**
 * The one measurement everything here is about: where the menu is, where its
 * fold is, and where the last row ends. Read from the live layout, never from a
 * screenshot.
 */
async function geometry(page: Page) {
  return page.evaluate(() => {
    const menu = document.getElementById("dropdownOptions") as HTMLElement;
    const dropdown = document.getElementById("personaDropdown") as HTMLElement;
    const rows = Array.from(menu.querySelectorAll(".dropdown-option")) as HTMLElement[];
    const mr = menu.getBoundingClientRect();
    const contentTop = mr.top + menu.clientTop;
    const foldY = contentTop + menu.clientHeight;
    const last = rows[rows.length - 1];
    const lastRect = last.getBoundingClientRect();
    const more = menu.querySelector(".dropdown-more") as HTMLElement | null;
    return {
      dropUp: dropdown.classList.contains("drop-up"),
      viewportH: window.innerHeight,
      menu: {
        top: mr.top,
        bottom: mr.bottom,
        width: mr.width,
        scrollHeight: menu.scrollHeight,
        clientHeight: menu.clientHeight,
        scrollTop: menu.scrollTop,
        inlineMaxHeight: menu.style.maxHeight,
      },
      // How many pixels of the menu are drawn outside the window. On the panel
      // this was 76 and there was no way to reach them.
      outsideViewport:
        Math.max(0, mr.bottom - window.innerHeight) + Math.max(0, 0 - mr.top),
      rowCount: rows.length,
      // The number that matters. Positive means the last row starts (or ends)
      // past the fold, i.e. below it.
      lastRowBelowFoldBy: lastRect.bottom - foldY,
      lastRowId: last.dataset.personaId,
      rowHeights: rows.map((r) => r.getBoundingClientRect().height),
      more: more
        ? {
            text: (more.textContent || "").trim(),
            atBottom: more.classList.contains("at-bottom"),
            inert: (more as any).inert === true,
            opacity: parseFloat(getComputedStyle(more).opacity),
            bg: getComputedStyle(more).backgroundColor,
            rect: more.getBoundingClientRect().toJSON(),
            ariaHidden: more.getAttribute("aria-hidden"),
          }
        : null,
    };
  });
}

for (const surface of SURFACES) {
  test.describe(`${surface} — persona menu fold`, () => {
    /* ============================================================
       1. THE SHIPPED ROSTER FITS.
       ============================================================ */

    test("the LAST persona is visible WITHOUT SCROLLING on the shipped roster", async ({
      page,
    }) => {
      await mount(page, PAGES[surface], surface);
      const g = await geometry(page);

      expect(g.rowCount, "the fixture did not render five rows").toBe(5);
      expect(g.lastRowId).toBe("jira-admin");
      expect(g.menu.scrollTop, "the menu was already scrolled — measure at rest").toBe(0);

      // THE ASSERTION THE OLD ONES MISSED. "Nothing is clipped" was true before
      // the fix and is not the property: the last row has to be ON SCREEN.
      expect(
        g.lastRowBelowFoldBy,
        `"Jira Administrator" is ${Math.round(g.lastRowBelowFoldBy)}px below the ` +
          `fold (menu ${Math.round(g.menu.clientHeight)}px, content ` +
          `${g.menu.scrollHeight}px) — the newest persona is the one nobody finds`,
      ).toBeLessThanOrEqual(1);

      // And therefore it does not scroll at all, so there is nothing to say.
      expect(g.menu.scrollHeight - g.menu.clientHeight).toBeLessThanOrEqual(1);
      expect(g.more, "a scroll cue appeared on a roster that fits").toBeNull();
    });

    test("it still fits with two rows BLOCKED — the case that was 748px", async ({
      page,
    }) => {
      // The explanation note adds a full-width paragraph to a row. This is the
      // worst ORDINARY roster, and it is the one an admin-less user sees.
      await mount(page, PAGES[surface], surface, SHIPPED_WITH_BLOCKED);
      const g = await geometry(page);

      expect(g.rowCount).toBe(5);
      await expect(page.locator("#dropdownOptions .option-unavailable-note")).toHaveCount(2);
      expect(g.outsideViewport, "the menu is drawn outside the window").toBeLessThanOrEqual(1);

      // This one is allowed to scroll — two three-line notes is genuinely more
      // content than a menu can hold on a short panel. What is NOT allowed is
      // scrolling in silence.
      if (g.lastRowBelowFoldBy > 1) {
        expect(g.more, "the menu scrolls and says nothing").not.toBeNull();
        expect(g.more!.atBottom).toBe(false);
      }
    });

    test("the description is CLAMPED, so one persona cannot eat the menu", async ({
      page,
    }) => {
      await mount(page, PAGES[surface], surface);
      // The Jira Administrator's real description wrapped to SIX lines at 260px
      // and made its row 144px tall — taller than two of its neighbours put
      // together. Every row is now within a hair of every other.
      const heights = (await geometry(page)).rowHeights;
      const min = Math.min(...heights);
      const max = Math.max(...heights);
      expect(
        max - min,
        `row heights range ${Math.round(min)}–${Math.round(max)}px; one ` +
          "description is still free to wrap without limit",
      ).toBeLessThanOrEqual(2);

      const desc = await page
        .locator('#dropdownOptions .dropdown-option[data-persona-id="jira-admin"] .option-description')
        .evaluate((el) => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          const lh = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.2;
          return { lines: r.height / lh, overflow: s.overflow, text: (el.textContent || "").length };
        });
      expect(desc.text, "the fixture description is too short to prove a clamp").toBeGreaterThan(100);
      expect(desc.lines, "the description is not clamped").toBeLessThanOrEqual(2.2);
      expect(desc.overflow).toBe("hidden");
    });

    /* ============================================================
       2. NEVER OUTSIDE THE IFRAME.
       ============================================================ */

    test("the menu is never drawn outside the window — it opens UPWARD instead", async ({
      page,
    }) => {
      await mount(page, PAGES[surface], surface, OVERFLOWING);
      const g = await geometry(page);

      expect(
        g.outsideViewport,
        `${Math.round(g.outsideViewport)}px of menu is outside the ` +
          `${g.viewportH}px window with no way to reach it`,
      ).toBeLessThanOrEqual(1);

      // On the panel the trigger sits above the composer, so there is no room
      // below and the flip is the only thing that can fix it. On the global
      // page the pill is near the top and the menu should still drop DOWN — a
      // menu that flips when it does not need to is its own defect.
      expect(g.dropUp).toBe(surface === "issuePanel");

      // The height was clamped to the room available, not left at the ceiling.
      expect(g.menu.inlineMaxHeight, "no measured height was applied").toMatch(/^\d+px$/);
      expect(parseFloat(g.menu.inlineMaxHeight)).toBeLessThanOrEqual(g.viewportH);
    });

    test("with room BELOW it drops down, and still stays inside the window", async ({
      page,
    }) => {
      // The trigger is left where the stub puts it — near the top. Both
      // surfaces must behave the same way here; the flip is conditional, not a
      // per-surface constant.
      await mount(page, PAGES[surface], surface, OVERFLOWING, { highTrigger: true });
      const g = await geometry(page);
      expect(g.dropUp, "the menu flipped upward with room below it").toBe(false);
      expect(g.outsideViewport).toBeLessThanOrEqual(1);
    });

    /* ============================================================
       3. IT SAYS THAT IT SCROLLS.
       ============================================================ */

    test("a menu that scrolls carries a SOLID cue that counts what is left", async ({
      page,
    }) => {
      await mount(page, PAGES[surface], surface, OVERFLOWING);
      const g = await geometry(page);

      expect(g.more, "the menu scrolls in silence").not.toBeNull();
      const more = g.more!;
      // It says a NUMBER. "Scroll for more" would be true of every long menu
      // ever built; the count is what tells you the list is bigger than it looks.
      expect(more.text).toMatch(/^\d+ more$/i);
      const n = parseInt(more.text, 10);
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThan(g.rowCount);

      // Solid and saturated, never an 8–12% wash.
      expect(alphaOf(more.bg)).toBe(1);
      expect(more.bg).not.toBe("rgba(0, 0, 0, 0)");
      expect(more.opacity).toBe(1);

      // It is pinned to the bottom EDGE of the menu, not scrolled away with the
      // rows — a cue you have to scroll to see is not a cue.
      expect(Math.abs(more.rect.bottom - g.menu.bottom)).toBeLessThanOrEqual(6);
      expect(more.rect.width).toBeGreaterThan(80);

      // Pointer-only and out of the listbox's accessibility tree: the keyboard
      // path is ArrowDown, and a non-option control inside role="listbox" would
      // be a real a11y defect rather than a fix for one.
      expect(more.ariaHidden).toBe("true");
      const optionRoles = await page.evaluate(() =>
        Array.from(document.querySelectorAll("#dropdownOptions > *"))
          .filter((el) => el.getAttribute("aria-hidden") !== "true")
          .map((el) => el.getAttribute("role")),
      );
      expect(new Set(optionRoles)).toEqual(new Set(["option"]));
    });

    test("the count SHRINKS as you scroll and the cue RETIRES at the bottom", async ({
      page,
    }) => {
      await mount(page, PAGES[surface], surface, OVERFLOWING);
      const before = parseInt((await geometry(page)).more!.text, 10);

      // Half way.
      await page.evaluate(() => {
        const m = document.getElementById("dropdownOptions") as HTMLElement;
        m.scrollTop = Math.round((m.scrollHeight - m.clientHeight) / 2);
        m.dispatchEvent(new Event("scroll"));
      });
      await page.waitForFunction(
        (b) => {
          const el = document.querySelector(".dropdown-more");
          return el && parseInt((el.textContent || "0").trim(), 10) < b;
        },
        before,
        { timeout: 3000 },
      );
      const mid = parseInt((await geometry(page)).more!.text, 10);
      expect(mid).toBeLessThan(before);
      expect(mid).toBeGreaterThan(0);

      // All the way. THE IN-FLIGHT CUE IS RETIRED BY THE THING THAT COMPLETES
      // IT — not left as a permanent bar over the last row.
      await page.evaluate(() => {
        const m = document.getElementById("dropdownOptions") as HTMLElement;
        m.scrollTop = m.scrollHeight;
        m.dispatchEvent(new Event("scroll"));
      });
      await page.waitForFunction(
        () => document.querySelector(".dropdown-more")?.classList.contains("at-bottom"),
        undefined,
        { timeout: 3000 },
      );
      await settle(page);
      const end = (await geometry(page)).more!;
      expect(end.atBottom).toBe(true);
      expect(end.opacity, "the retired cue is still painted over the last row").toBe(0);
      // Invisible AND unclickable. A faded pill that still takes clicks is a
      // dead zone exactly where the last persona now is.
      expect(end.inert, "the retired cue can still be clicked").toBe(true);

      // And the last row is genuinely reachable now.
      const g = await geometry(page);
      expect(g.lastRowBelowFoldBy).toBeLessThanOrEqual(1);
    });

    test("clicking the cue actually scrolls the menu", async ({ page }) => {
      await mount(page, PAGES[surface], surface, OVERFLOWING);
      expect((await geometry(page)).menu.scrollTop).toBe(0);

      await page.locator("#dropdownOptions .dropdown-more").click({ force: true });
      await page.waitForFunction(
        () => (document.getElementById("dropdownOptions") as HTMLElement).scrollTop > 10,
        undefined,
        { timeout: 3000 },
      );

      const g = await geometry(page);
      expect(g.menu.scrollTop).toBeGreaterThan(10);
      // Clicking inside the menu must not close it or change the selection —
      // the container's stopPropagation is what keeps that true.
      await expect(page.locator("#dropdownOptions")).toHaveClass(/open/);
      expect(await page.evaluate(() => (window as any).sel.getSelectedPersonaId())).toBeNull();
    });

    test("the cue ENTERS with this surface's own motion, and its chevron nudges", async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.setViewportSize(VIEWPORT[surface]);
      await page.goto(PAGES[surface]);
      await placeTrigger(page, surface);
      // Catch the animations while they are still running — the pill is created
      // at the moment the menu is told it overflows.
      await page.evaluate((json) => {
        const w = window as any;
        w.sel = new w.CW.PersonaSelector(null, {});
        w.sel.setPersonas(JSON.parse(json));
        w.sel.open();
      }, OVERFLOWING);

      const names = await page
        .locator("#dropdownOptions .dropdown-more")
        .evaluate((el) =>
          el.getAnimations({ subtree: true }).map((a) => (a as any).animationName ?? ""),
        );
      // The surface's OWN entrance, not a second vocabulary invented for this.
      expect(names.join(","), "the cue appeared with no entrance").toMatch(
        /message-in|fadeInUp/,
      );
      // And the chevron reuses drop-nudge, the surface's existing gesture.
      expect(names.join(","), "the chevron does not nudge").toContain("drop-nudge");
    });

    test("NO LEFT RAIL on the cue", async ({ page }) => {
      await mount(page, PAGES[surface], surface, OVERFLOWING);
      const b = await page.locator("#dropdownOptions .dropdown-more").evaluate((el) => {
        const s = getComputedStyle(el);
        const pre = getComputedStyle(el, "::before");
        return {
          l: parseFloat(s.borderLeftWidth),
          r: parseFloat(s.borderRightWidth),
          t: parseFloat(s.borderTopWidth),
          bo: parseFloat(s.borderBottomWidth),
          preL: parseFloat(pre.borderLeftWidth) || 0,
          preContent: pre.content,
        };
      });
      expect(b.l, "the cue has a left border-strip").toBeLessThanOrEqual(
        Math.min(b.r, b.t, b.bo),
      );
      if (b.preContent !== "none") expect(b.preL).toBeLessThanOrEqual(2);
    });

    test("DARK MODE keeps the cue solid and its text legible", async ({ page }) => {
      await mount(page, darkVariant(PAGES[surface]), surface, OVERFLOWING);
      expect(
        await page.evaluate(() => document.documentElement.getAttribute("data-color-mode")),
      ).toBe("dark");

      const c = await page.locator("#dropdownOptions .dropdown-more").evaluate((el) => {
        const s = getComputedStyle(el);
        const lum = (col: string) => {
          const m = /rgba?\(([^)]+)\)/.exec(col)!;
          const [r, g, b] = m[1].split(",").map((n) => parseFloat(n));
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        return { bg: s.backgroundColor, bgLum: lum(s.backgroundColor), fgLum: lum(s.color) };
      });
      expect(alphaOf(c.bg)).toBe(1);
      // Text against fill, either way round, with real separation. The global
      // page's --cw-accent-fg FLIPS with the theme; the panel's is white on a
      // dark accent in both. Both must clear the same bar.
      expect(Math.abs(c.fgLum - c.bgLum), "the cue's label is not legible in dark mode").toBeGreaterThan(70);
    });

    test("reduced motion: the cue LANDS instead of stranding", async ({ page }) => {
      await mount(page, PAGES[surface], surface, OVERFLOWING, { reduced: true });
      const more = (await geometry(page)).more!;
      // The universal collapse to 1ms turns an entrance into a jump to its END
      // state. A `both`-filled one would also have pinned opacity at 1 forever
      // and made `.at-bottom` unable to fade it — so the resting value is the
      // whole assertion here.
      expect(more.opacity).toBe(1);
      expect(more.atBottom).toBe(false);
      await expect(page.locator("#dropdownOptions .dropdown-more")).toBeVisible();

      // And it still retires at the bottom with motion off.
      await page.evaluate(() => {
        const m = document.getElementById("dropdownOptions") as HTMLElement;
        m.scrollTop = m.scrollHeight;
        m.dispatchEvent(new Event("scroll"));
      });
      await page.waitForFunction(
        () => document.querySelector(".dropdown-more")?.classList.contains("at-bottom"),
        undefined,
        { timeout: 3000 },
      );
      await settle(page);
      expect(
        await page
          .locator("#dropdownOptions .dropdown-more")
          .evaluate((el) => parseFloat(getComputedStyle(el).opacity)),
      ).toBe(0);
    });

    /* ============================================================
       4. NOTHING THE PICKER ALREADY DID GOT BROKEN.
       ============================================================ */

    test("the cue is not a row: it is not selectable and not in the keyboard walk", async ({
      page,
    }) => {
      await mount(page, PAGES[surface], surface, OVERFLOWING);
      // ArrowDown walks .dropdown-option only. If the pill ever answered that
      // selector, Enter on it would try to select a persona called "undefined".
      const walked = await page.evaluate(() => {
        const w = window as any;
        const seen: string[] = [];
        for (let i = 0; i < 12; i++) {
          w.sel.highlightNextOption();
          const el = document.querySelector("#dropdownOptions .dropdown-option.highlighted") as HTMLElement;
          seen.push(el ? el.dataset.personaId! : "NONE");
        }
        return seen;
      });
      expect(walked).not.toContain("NONE");
      expect(walked.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
      await expect(page.locator("#dropdownOptions .dropdown-more.highlighted")).toHaveCount(0);
    });

    test("the roster shrinking removes the cue and leaves no orphan", async ({ page }) => {
      await mount(page, PAGES[surface], surface, OVERFLOWING);
      await expect(page.locator("#dropdownOptions .dropdown-more")).toHaveCount(1);

      // The retry path re-renders the whole list while the menu is open. The
      // cue must be retired by the render that made it unnecessary, not left
      // annotated — the stuck-chip defect, one surface over.
      await page.evaluate((json) => (window as any).sel.setPersonas(JSON.parse(json)), SHIPPED);
      await expect(page.locator("#dropdownOptions .dropdown-more")).toHaveCount(0);

      // And it comes back when the list grows again — exactly one of it.
      await page.evaluate((json) => (window as any).sel.setPersonas(JSON.parse(json)), OVERFLOWING);
      await expect(page.locator("#dropdownOptions .dropdown-more")).toHaveCount(1);
    });

    test("the iframe growing retires the cue WITHOUT a re-render", async ({ page }) => {
      // THE PATH THE OTHER TESTS CANNOT REACH. Everything above changes the
      // roster, and a roster change wipes the menu's innerHTML — so the cue
      // would disappear even if nothing ever removed it. A Forge iframe is
      // resized by its host while the menu is open, and on that path there is
      // no re-render at all: the cue has to be taken away by the measurement
      // that made it unnecessary.
      await page.emulateMedia({ reducedMotion: "no-preference" });
      // Short enough that the measured clamp, not the CSS ceiling, decides the
      // height — so the shipped five rows do not fit and the cue is correct.
      await page.setViewportSize({ width: VIEWPORT[surface].width, height: 300 });
      await page.goto(PAGES[surface]);
      await placeTrigger(page, surface);
      await page.evaluate((json) => {
        const w = window as any;
        w.sel = new w.CW.PersonaSelector(null, {});
        w.sel.setPersonas(JSON.parse(json));
        w.sel.open();
      }, SHIPPED);
      await settle(page);

      const cramped = await geometry(page);
      expect(cramped.more, "a 300px window fitted five rows — the clamp did nothing").not.toBeNull();
      expect(cramped.outsideViewport).toBeLessThanOrEqual(1);
      const crampedHeight = cramped.menu.clientHeight;

      // The host gives the panel room. No setPersonas, no render() — only the
      // resize listener.
      await page.setViewportSize({ width: VIEWPORT[surface].width, height: 900 });
      await page.waitForFunction(
        () => document.querySelectorAll("#dropdownOptions .dropdown-more").length === 0,
        undefined,
        { timeout: 3000 },
      );
      await settle(page);

      const roomy = await geometry(page);
      expect(roomy.menu.clientHeight, "the menu did not grow with the window").toBeGreaterThan(
        crampedHeight,
      );
      expect(roomy.more, "the cue outlived the reason for it").toBeNull();
      expect(roomy.lastRowBelowFoldBy).toBeLessThanOrEqual(1);
      expect(roomy.outsideViewport).toBeLessThanOrEqual(1);
    });

    test("a persona is still selectable through the whole menu", async ({ page }) => {
      await mount(page, PAGES[surface], surface, OVERFLOWING);
      await page.locator('#dropdownOptions .dropdown-option[data-persona-id="jira-admin"]').click();
      expect(await page.evaluate(() => (window as any).sel.getSelectedPersonaId())).toBe(
        "jira-admin",
      );
      await expect(page.locator("#dropdownOptions")).not.toHaveClass(/open/);
    });
  });
}
