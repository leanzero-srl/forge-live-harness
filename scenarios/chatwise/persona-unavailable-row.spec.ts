// A PERSONA THIS USER CANNOT USE — visible, disabled, and it says WHY.
// Driven in a real browser, on BOTH surfaces, from the shipped component and
// the shipped CSS.
//
// WHAT THIS IS FOR
// ----------------
// `src/shared/persona/visibility.js` annotates every persona on every list
// route with `available`, `unavailableReason` and `unavailableHint`, and
// REMOVES NOTHING. The owner chose visible-and-disabled over hidden, because a
// row that silently vanishes is indistinguishable from a broken deploy. So the
// row exists TO BE INFORMATIVE, and everything below is about whether it is.
//
// The three things that are easy to get wrong, and are therefore pinned here:
//
//   1. THE CONTRACT IS `available === true`, NOT `!== false`. A persona a
//      future route forgets to annotate arrives with no field at all and must
//      render unavailable. That strictness is what lets the backend be an
//      annotator instead of a filter.
//
//   2. THE TWO REASONS ARE DIFFERENT FACTS AND THE USER ACTS DIFFERENTLY ON
//      EACH. `requires-jira-admin` is a permission they do not hold — nothing
//      to do in the app. `admin-check-unavailable` means ChatWise could not
//      ask Jira just now, and the reader is very likely an admin looking at a
//      row that SHOULD be available, so it must offer a Retry. Without one, a
//      transient 429 reads as "the deploy is broken". Collapsing the two into
//      one grey state is the defect this file exists to prevent.
//
//   3. NOTHING MAY REACH THE BACKEND WITH A PERSONA THE SERVER WILL REFUSE.
//      The server-side refusal is the security guarantee and it is already in
//      place — but a click that gets through produces a refusal BUBBLE instead
//      of an in-place explanation, which is a worse answer to the same question.
//
// BOTH SURFACES, TWICE. They share no design tokens: `--cw-*` on the global
// page, `--text-*` / `--button-*` on the issue panel, and the CSS for this row
// is duplicated in the app. A single-surface pass leaves half of it unverified.
// Then the whole set again with prefers-reduced-motion EMULATED AND ASSERTED,
// because the universal collapse-to-1ms turns a `both`-filled entrance into a
// jump to its END state — and an entrance that ends anywhere but the row's
// resting value would strand the explanation permanently dimmed.
import { test, expect, Page } from "@playwright/test";
import { buildStub, darkVariant, Surface } from "./_stub/build";

let PAGES: Record<Surface, string>;
test.beforeAll(() => {
  PAGES = buildStub();
});

const SURFACES: Surface[] = ["globalPage", "issuePanel"];

/** The two solid hues, one per reason. Neither may be a tint. */
const HUE = {
  admin: "rgb(124, 58, 237)", // #7c3aed — you do not hold the permission
  unknown: "rgb(194, 65, 12)", // #c2410c — we could not check; retry lives here
};

/** Alpha of a computed colour. 1 is a solid fill; anything less is a wash. */
const alphaOf = (c: string) => {
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (!m) return 1;
  const p = m[1].split(",");
  return p.length > 3 ? parseFloat(p[3]) : 1;
};

/**
 * The list every test starts from. Four rows, one per case that matters.
 *
 * `unannotated` deliberately carries NO `available` key — not `false`, not
 * `undefined` written out. That is the shape a route which forgot to annotate
 * actually produces, and the strict contract is the only thing standing between
 * it and a freely usable restricted persona.
 */
const FIXTURE = `[
  { "id": "coffee-break-ai", "name": "Coffee Break AI", "description": "Casual chat",
    "isFactory": true, "available": true },
  { "id": "jira-admin", "name": "Jira Administrator", "description": "Site administration",
    "isFactory": true, "available": false, "unavailableReason": "requires-jira-admin",
    "unavailableHint": "Requires the Administer Jira permission on this site." },
  { "id": "jira-admin-blip", "name": "Admin Assistant", "description": "Site administration",
    "isFactory": true, "available": false, "unavailableReason": "admin-check-unavailable",
    "unavailableHint": "Couldn't check your Jira admin permission just now. Try again in a moment." },
  { "id": "unannotated", "name": "Unannotated Assistant", "description": "A route forgot to stamp this",
    "isFactory": true }
]`;

/** Mount the picker, feed it the fixture, open it. */
async function mount(page: Page, url: string, reduced = false) {
  await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
  await page.goto(url);
  const applied = await page.evaluate(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  expect(applied, "prefers-reduced-motion emulation did not apply").toBe(reduced);

  await page.evaluate((json) => {
    const w = window as any;
    w.blocked = [];
    w.sel = new w.CW.PersonaSelector(null, {});
    w.sel.on("blocked-action", (e: any) => w.blocked.push(e));
    w.sel.setPersonas(JSON.parse(json));
    w.sel.open();
  }, FIXTURE);

  await expect(page.locator("#dropdownOptions")).toHaveClass(/open/);
  await settle(page);
}

/** Wait for every animation in the menu to stop, so opacity reads are resting. */
async function settle(page: Page) {
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll("#dropdownOptions *")).every((el) =>
        el.getAnimations().every((a) => a.playState !== "running"),
      ),
    undefined,
    { timeout: 5000 },
  );
}

/**
 * A blocked row is `aria-disabled`, which Playwright's actionability check
 * (correctly) reads as "not enabled". A real pointer still lands on it — it is a
 * div, not a form control — and the product has to REFUSE that click rather than
 * rely on the browser to swallow it. So the click is forced on purpose: this is
 * simulating the user who tries anyway, which is the whole case under test.
 */
const CLICK_A_BLOCKED_ROW = { force: true } as const;

const row = (page: Page, id: string) =>
  page.locator(`#dropdownOptions .dropdown-option[data-persona-id="${id}"]`);

for (const surface of SURFACES) {
  test.describe(`${surface} — unavailable persona row`, () => {
    test("an AVAILABLE persona is completely unaffected", async ({ page }) => {
      await mount(page, PAGES[surface]);
      const ok = row(page, "coffee-break-ai");

      await expect(ok).toHaveCount(1);
      await expect(ok).not.toHaveClass(/unavailable/);
      expect(await ok.getAttribute("aria-disabled")).toBeNull();
      expect(await ok.getAttribute("data-unavailable-reason")).toBeNull();
      await expect(ok.locator(".option-unavailable-note")).toHaveCount(0);
      await expect(ok.locator(".option-badge-blocked")).toHaveCount(0);
      // It still carries the Factory badge it always did.
      await expect(ok.locator(".option-badge")).toHaveText("Factory");

      // And it still selects.
      await ok.click();
      expect(
        await page.evaluate(() => (window as any).sel.getSelectedPersonaId()),
      ).toBe("coffee-break-ai");
    });

    test("a persona with NO `available` field renders UNAVAILABLE", async ({ page }) => {
      await mount(page, PAGES[surface]);
      const r = row(page, "unannotated");

      // The strict contract. `!== false` would render this one usable.
      await expect(r).toHaveCount(1);
      await expect(r).toHaveClass(/unavailable/);
      expect(await r.getAttribute("aria-disabled")).toBe("true");
      await expect(r.locator(".option-unavailable-note")).toHaveCount(1);

      // Unannotated resolves to "could not check", NEVER to "requires admin":
      // nobody told us the user lacks a permission, so claiming it would be a
      // fact we invented. And it is the branch with a way through.
      expect(await r.getAttribute("data-unavailable-reason")).toBe(
        "admin-check-unavailable",
      );
      await expect(r.locator(".option-retry-btn")).toHaveCount(1);
    });

    test("an unavailable row is NOT selectable — pointer, keyboard or code", async ({
      page,
    }) => {
      await mount(page, PAGES[surface]);
      const before = await page.evaluate(() =>
        (window as any).sel.getSelectedPersonaId(),
      );

      // 1. Pointer.
      await row(page, "jira-admin").click(CLICK_A_BLOCKED_ROW);
      expect(
        await page.evaluate(() => (window as any).sel.getSelectedPersonaId()),
      ).toBe(before);

      // 2. The programmatic path the welcome card uses.
      const returned = await page.evaluate(() =>
        (window as any).sel.selectPersona("jira-admin"),
      );
      expect(returned, "selectPersona reported success for a blocked row").toBe(false);
      expect(
        await page.evaluate(() => (window as any).sel.getSelectedPersonaId()),
      ).toBe(before);

      // 3. Enter on the highlighted row — the keyboard path.
      await page.evaluate(() => {
        const w = window as any;
        const el = document.querySelector(
          '#dropdownOptions .dropdown-option[data-persona-id="jira-admin"]',
        );
        w.sel.highlightOption(el);
        w.sel.selectHighlightedOption();
      });
      expect(
        await page.evaluate(() => (window as any).sel.getSelectedPersonaId()),
      ).toBe(before);

      // Every refusal was announced with the reason, so a host surface can act
      // on it. Three attempts, three blocked-action events.
      const blocked = await page.evaluate(() => (window as any).blocked);
      expect(blocked.length).toBe(3);
      for (const e of blocked) {
        expect(e.reason).toBe("Persona unavailable");
        expect(e.unavailableReason).toBe("requires-jira-admin");
      }
    });

    test("the refusal is FELT — the note nudges, and it restarts", async ({ page }) => {
      await mount(page, PAGES[surface]);
      const note = row(page, "jira-admin").locator(".option-unavailable-note");

      await row(page, "jira-admin").click(CLICK_A_BLOCKED_ROW);
      const first = await note.evaluate((el) =>
        el.getAnimations().map((a) => (a as any).animationName ?? ""),
      );
      expect(first.join(","), "no nudge animation after a refused click").toContain(
        "drop-nudge",
      );

      // A SECOND refused click must nudge again. Without the forced reflow in
      // _nudgeUnavailableRow the class is already present and nothing plays,
      // so the app looks like it stopped listening.
      await settle(page);
      await row(page, "jira-admin").click(CLICK_A_BLOCKED_ROW);
      const second = await note.evaluate((el) =>
        el.getAnimations().map((a) => (a as any).animationName ?? ""),
      );
      expect(second.join(","), "the nudge did not restart").toContain("drop-nudge");
    });

    test("the two reasons render DIFFERENTLY — not one grey state", async ({ page }) => {
      await mount(page, PAGES[surface]);
      const admin = row(page, "jira-admin");
      const blip = row(page, "jira-admin-blip");

      // Different reason codes on the rows.
      expect(await admin.getAttribute("data-unavailable-reason")).toBe(
        "requires-jira-admin",
      );
      expect(await blip.getAttribute("data-unavailable-reason")).toBe(
        "admin-check-unavailable",
      );

      // Different badge WORDS.
      const adminLabel = await admin.locator(".option-badge-blocked").innerText();
      const blipLabel = await blip.locator(".option-badge-blocked").innerText();
      expect(adminLabel.trim().length).toBeGreaterThan(0);
      expect(adminLabel).not.toBe(blipLabel);

      // Different SOLID hues — and solid, not an 8–12% wash.
      const adminBg = await admin
        .locator(".option-badge-blocked")
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      const blipBg = await blip
        .locator(".option-badge-blocked")
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(adminBg).toBe(HUE.admin);
      expect(blipBg).toBe(HUE.unknown);
      expect(alphaOf(adminBg)).toBe(1);
      expect(alphaOf(blipBg)).toBe(1);

      // Different glyphs, and each glyph carries its own solid hue.
      const adminIcon = await admin
        .locator(".option-unavailable-icon")
        .evaluate((el) => ({
          color: getComputedStyle(el).color,
          svg: el.innerHTML,
        }));
      const blipIcon = await blip.locator(".option-unavailable-icon").evaluate((el) => ({
        color: getComputedStyle(el).color,
        svg: el.innerHTML,
      }));
      expect(adminIcon.color).toBe(HUE.admin);
      expect(blipIcon.color).toBe(HUE.unknown);
      expect(adminIcon.svg).not.toBe(blipIcon.svg);

      // And the sentence the SERVER sent is the one on screen, not a local
      // paraphrase — the hint is where the actual explanation lives.
      await expect(admin.locator(".option-unavailable-text")).toHaveText(
        "Requires the Administer Jira permission on this site.",
      );
      await expect(blip.locator(".option-unavailable-text")).toHaveText(
        "Couldn't check your Jira admin permission just now. Try again in a moment.",
      );
    });

    test("RETRY appears only on admin-check-unavailable", async ({ page }) => {
      await mount(page, PAGES[surface]);

      // A button on "you do not hold this permission" could never succeed, and
      // a button that cannot succeed is worse than no button.
      await expect(row(page, "jira-admin").locator(".option-retry-btn")).toHaveCount(0);
      await expect(row(page, "jira-admin-blip").locator(".option-retry-btn")).toHaveCount(
        1,
      );
      await expect(row(page, "coffee-break-ai").locator(".option-retry-btn")).toHaveCount(
        0,
      );
    });

    test("RETRY asks its host, spins, and RESOLVES the row when it works", async ({
      page,
    }) => {
      await mount(page, PAGES[surface]);

      // Stand in for BaseApp.wirePersonaControls: hold the answer until the
      // test releases it, so the in-flight state can actually be observed.
      await page.evaluate(() => {
        const w = window as any;
        w.asked = 0;
        w.sel.on("availability-retry", () => {
          w.asked++;
        });
      });

      const btn = row(page, "jira-admin-blip").locator(".option-retry-btn");
      await btn.click();

      expect(await page.evaluate(() => (window as any).asked)).toBe(1);

      // In flight: EVERY retry button, because one probe answers for the whole
      // list and a sibling sitting idle would be a lie.
      const inflight = page.locator("#dropdownOptions .option-retry-btn");
      await expect(inflight).toHaveCount(2);
      for (let i = 0; i < 2; i++) {
        await expect(inflight.nth(i)).toHaveClass(/retrying/);
        await expect(inflight.nth(i)).toBeDisabled();
      }
      // The spinner is really turning, not a static ring.
      const spinning = await inflight.first().evaluate((el) =>
        el
          .getAnimations({ subtree: true })
          .some((a) => (a as any).animationName === "spin" && a.playState === "running"),
      );
      expect(spinning, "the retry spinner is not animating").toBe(true);

      // The host answers: the probe came back and the persona is available.
      await page.evaluate(() => {
        const w = window as any;
        const next = w.sel.personas.map((p: any) =>
          p.id === "jira-admin-blip"
            ? { ...p, available: true, unavailableReason: null, unavailableHint: null }
            : p,
        );
        w.sel.setPersonas(next);
      });

      const resolved = row(page, "jira-admin-blip");
      await expect(resolved).not.toHaveClass(/unavailable/);
      await expect(resolved.locator(".option-unavailable-note")).toHaveCount(0);
      await expect(resolved.locator(".option-badge-blocked")).toHaveCount(0);
      // The changed verdict is SEEN, not swapped in silently.
      await expect(resolved).toHaveClass(/availability-changed/);
      // And it is now selectable.
      await resolved.click();
      expect(
        await page.evaluate(() => (window as any).sel.getSelectedPersonaId()),
      ).toBe("jira-admin-blip");

      // THE IN-FLIGHT STATE IS RETIRED BY THE THING THAT COMPLETED IT. The
      // re-render REPLACED the rows; no orphan spinner survives anywhere.
      await expect(page.locator("#dropdownOptions .option-retry-btn.retrying")).toHaveCount(
        0,
      );
      expect(
        await page.evaluate(() => (window as any).sel.retryingAvailability),
      ).toBe(false);
    });

    test("a RETRY that changes nothing still settles, and says so", async ({ page }) => {
      await mount(page, PAGES[surface]);
      await page.evaluate(() => {
        const w = window as any;
        w.sel.on("availability-retry", () => {
          // The probe failed again. Same list back.
          w.sel.setPersonas(w.sel.personas.map((p: any) => ({ ...p })));
        });
      });

      await row(page, "jira-admin-blip").locator(".option-retry-btn").click();

      // Buttons come back. A spinner that never stops is the defect this
      // guards: it reads as a hung app and there is no second attempt.
      const btn = row(page, "jira-admin-blip").locator(".option-retry-btn");
      await expect(btn).not.toHaveClass(/retrying/);
      await expect(btn).toBeEnabled();
      await expect(btn).toHaveText("Retry");
      expect(
        await page.evaluate(() => (window as any).sel.retryingAvailability),
      ).toBe(false);

      // And the unchanged answer is announced by the same nudge a refusal uses,
      // or the press reads as having done nothing at all.
      const playing = await row(page, "jira-admin-blip")
        .locator(".option-unavailable-note")
        .evaluate((el) =>
          el.getAnimations().map((a) => (a as any).animationName ?? ""),
        );
      expect(playing.join(","), "an unchanged retry gave no cue").toContain("drop-nudge");
    });

    test("a host that never answers does not leave a spinner turning", async ({
      page,
    }) => {
      await mount(page, PAGES[surface]);
      // Nobody listens to availability-retry at all.
      await row(page, "jira-admin-blip").locator(".option-retry-btn").click();
      await expect(
        row(page, "jira-admin-blip").locator(".option-retry-btn"),
      ).toHaveClass(/retrying/);

      // The host's `finally` arrives (BaseApp calls this whatever happened).
      await page.evaluate(() => (window as any).sel.finishAvailabilityRetry());
      await expect(
        row(page, "jira-admin-blip").locator(".option-retry-btn"),
      ).not.toHaveClass(/retrying/);
      await expect(
        row(page, "jira-admin-blip").locator(".option-retry-btn"),
      ).toBeEnabled();
    });

    test("the PILL says so too, for a conversation restored onto a blocked persona", async ({
      page,
    }) => {
      await mount(page, PAGES[surface]);
      // setSelectedPersonaId is the silent restore path — it bypasses
      // selectPersona entirely, so this is the only place the user can learn
      // the truth BEFORE pressing send.
      await page.evaluate(() =>
        (window as any).sel.setSelectedPersonaId("jira-admin"),
      );

      const badge = page.locator("#dropdownSelected .selected-blocked-badge");
      await expect(badge).toHaveCount(1);
      expect(await badge.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
        HUE.admin,
      );
      expect(await badge.getAttribute("aria-label")).toContain("Administer Jira");
      await expect(page.locator("#personaDropdown")).toHaveClass(
        /has-unavailable-selection/,
      );

      // Restoring onto an AVAILABLE persona retires the badge by REMOVING it.
      // Editing it in place is how a chip once kept a spinner next to a
      // finished upload.
      await page.evaluate(() =>
        (window as any).sel.setSelectedPersonaId("coffee-break-ai"),
      );
      await expect(page.locator("#dropdownSelected .selected-blocked-badge")).toHaveCount(
        0,
      );
      await expect(page.locator("#personaDropdown")).not.toHaveClass(
        /has-unavailable-selection/,
      );
    });

    test("NO LEFT RAIL, on the row or on the explanation", async ({ page }) => {
      await mount(page, PAGES[surface]);
      const targets = [
        `.dropdown-option[data-persona-id="jira-admin"]`,
        `.dropdown-option[data-persona-id="jira-admin"] .option-unavailable-note`,
        `.dropdown-option[data-persona-id="jira-admin-blip"]`,
        `.dropdown-option[data-persona-id="jira-admin-blip"] .option-unavailable-note`,
        `.dropdown-option[data-persona-id="jira-admin-blip"] .option-retry-btn`,
        `.dropdown-option[data-persona-id="jira-admin"] .option-badge-blocked`,
      ];
      for (const sel of targets) {
        const b = await page.locator(`#dropdownOptions ${sel}`).evaluate((el) => {
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
        // A left border is only ever legitimate as part of a FULL border. A
        // left edge thicker than the other three is the rail, whether it is
        // drawn on the element or faked with a pseudo-element.
        expect(b.l, `${sel} has a left border-strip`).toBeLessThanOrEqual(
          Math.min(b.r, b.t, b.bo),
        );
        if (b.preContent !== "none") {
          expect(b.preL, `${sel}::before draws a left rail`).toBeLessThanOrEqual(2);
        }
      }
    });

    test("the explanation rests at full opacity and is not clipped", async ({ page }) => {
      await mount(page, PAGES[surface]);
      for (const id of ["jira-admin", "jira-admin-blip", "unannotated"]) {
        // THE ROW ITSELF IS NOT FADED. A washed-out ghost is the lazy way to
        // say "disabled" and it is the one the owner's rules forbid — the
        // signal here is a solid badge and a written explanation, not a 55%
        // opacity. Checked on both surfaces because neither stylesheet knows
        // what the other did.
        expect(
          await row(page, id).evaluate((el) => parseFloat(getComputedStyle(el).opacity)),
          `${id} row is faded out on ${surface}`,
        ).toBe(1);
        const note = row(page, id).locator(".option-unavailable-note");
        const box = await note.evaluate((el) => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          const parent = (el.parentElement as HTMLElement).getBoundingClientRect();
          const menu = (
            document.getElementById("dropdownOptions") as HTMLElement
          ).getBoundingClientRect();
          return {
            opacity: parseFloat(s.opacity),
            visible: s.visibility,
            w: r.width,
            h: r.height,
            overflowsRow: r.right - parent.right,
            overflowsMenu: r.right - menu.right,
            hOverflow: el.scrollWidth - el.clientWidth,
            vOverflow: el.scrollHeight - el.clientHeight,
          };
        });
        // The row's resting opacity is 1 on BOTH surfaces — this is not the
        // meta row, which lives at 0.85 on the panel. An entrance that ended
        // anywhere else would leave the explanation permanently dimmed.
        expect(box.opacity, `${id} note is dimmed on ${surface}`).toBe(1);
        expect(box.visible).toBe("visible");
        expect(box.w).toBeGreaterThan(80);
        expect(box.h).toBeGreaterThan(10);
        // Nothing sticks out of the row or out of the menu, and the sentence
        // wraps rather than being cut off.
        expect(box.overflowsRow, `${id} note overflows its row`).toBeLessThanOrEqual(1);
        expect(box.overflowsMenu, `${id} note overflows the menu`).toBeLessThanOrEqual(1);
        expect(box.hOverflow, `${id} note text is clipped horizontally`).toBeLessThanOrEqual(1);
        expect(box.vOverflow, `${id} note text is clipped vertically`).toBeLessThanOrEqual(1);
      }
    });

    test("the anchor dot is actually PAINTED on this surface", async ({ page }) => {
      // It used to be an inline `var(--cw-text-subtle)` — a token only the
      // global page defines — so on the issue panel every row was anchored by
      // an invisible element. One component, two stylesheets, written once.
      await mount(page, PAGES[surface]);
      const dot = await row(page, "coffee-break-ai")
        .locator(".option-dot")
        .evaluate((el) => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return { bg: s.backgroundColor, w: r.width, h: r.height };
        });
      expect(dot.w).toBeGreaterThan(3);
      expect(dot.h).toBeGreaterThan(3);
      expect(dot.bg).not.toBe("rgba(0, 0, 0, 0)");
      expect(alphaOf(dot.bg)).toBe(1);
    });

    test("DARK MODE keeps both hues solid and the note readable", async ({ page }) => {
      // Every colour here is hard-coded rather than derived from the surface's
      // accent, precisely so it does NOT need a dark variant — and this is what
      // proves it. Read with getComputedStyle, never off a screenshot.
      await mount(page, darkVariant(PAGES[surface]));
      expect(
        await page.evaluate(() =>
          document.documentElement.getAttribute("data-color-mode"),
        ),
      ).toBe("dark");

      const admin = row(page, "jira-admin");
      const blip = row(page, "jira-admin-blip");
      expect(
        await admin
          .locator(".option-badge-blocked")
          .evaluate((el) => getComputedStyle(el).backgroundColor),
      ).toBe(HUE.admin);
      expect(
        await blip
          .locator(".option-badge-blocked")
          .evaluate((el) => getComputedStyle(el).backgroundColor),
      ).toBe(HUE.unknown);
      expect(
        await blip
          .locator(".option-retry-btn")
          .evaluate((el) => getComputedStyle(el).backgroundColor),
      ).toBe(HUE.unknown);

      // The note followed the theme: its surface is dark and its text is light,
      // so the explanation is readable rather than white-on-white.
      const note = await admin
        .locator(".option-unavailable-note")
        .evaluate((el) => {
          const s = getComputedStyle(el);
          const lum = (c: string) => {
            const m = /rgba?\(([^)]+)\)/.exec(c)!;
            const [r, g, b] = m[1].split(",").map((n) => parseFloat(n));
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          };
          return { bgLum: lum(s.backgroundColor), fgLum: lum(s.color), opacity: parseFloat(s.opacity) };
        });
      expect(note.bgLum, "the note stayed light in dark mode").toBeLessThan(80);
      expect(note.fgLum, "the note's text stayed dark in dark mode").toBeGreaterThan(150);
      expect(note.opacity).toBe(1);

      // And the anchor dot is still painted, in the reason's hue.
      expect(
        await admin.locator(".option-dot").evaluate((el) => getComputedStyle(el).backgroundColor),
      ).toBe(HUE.admin);
      expect(
        await blip.locator(".option-dot").evaluate((el) => getComputedStyle(el).backgroundColor),
      ).toBe(HUE.unknown);
      expect(
        await row(page, "coffee-break-ai")
          .locator(".option-dot")
          .evaluate((el) => getComputedStyle(el).backgroundColor),
      ).not.toBe("rgba(0, 0, 0, 0)");
    });

    test("reduced motion: the explanation LANDS instead of stranding", async ({
      page,
    }) => {
      await mount(page, PAGES[surface], true);
      const note = row(page, "jira-admin").locator(".option-unavailable-note");
      // `both` fill + a 1ms duration means the end state must BE the resting
      // state. A stock 0→1 fade on the panel's meta-row-in would have ended at
      // 0.85 and dimmed this permanently.
      expect(await note.evaluate((el) => parseFloat(getComputedStyle(el).opacity))).toBe(1);
      await expect(note).toBeVisible();

      // The indeterminate spinner still turns — a frozen spinner reads as a
      // hung app, and the vestibular problem is travel, not rotation in place.
      await row(page, "jira-admin-blip").locator(".option-retry-btn").click();
      const spinning = await row(page, "jira-admin-blip")
        .locator(".option-retry-btn")
        .evaluate((el) =>
          el
            .getAnimations({ subtree: true })
            .some(
              (a) =>
                (a as any).animationName === "spin" && a.playState === "running",
            ),
        );
      expect(spinning, "the retry spinner froze under reduced motion").toBe(true);
    });
  });
}
