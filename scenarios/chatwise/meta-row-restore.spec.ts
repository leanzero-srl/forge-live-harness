// THE META ROW ON A RESTORED TURN — in a real browser, on BOTH surfaces.
//
// WHAT THIS IS FOR
// ----------------
// `ChatInterface._attachMessageExtras` is the restore path: the branch that
// rebuilds a turn the user scrolls back to, or reloads into. It used to gate the
// meta row on `skillsUsed || contextNote`, which is a decision
// `attachAssistantMeta` already makes for itself — and the two disagreed:
//
//     truncated only → NO meta row. A reply cut off at the iteration ceiling
//        came back looking like a finished answer.
//     a plain turn   → NO meta row. An ordinary reply lost its model and token
//        chips on reload, so what the user saw depended on whether they had
//        reloaded. Nobody reported that one; it was still wrong.
//
// The live path (`ChatMessageHandler`) never had the gate, so the defect was
// invisible until the moment it mattered.
//
// Run on BOTH surfaces and again under prefers-reduced-motion, because the two
// surfaces share no design tokens — the meta row's CSS is duplicated in the app
// and a single-surface pass leaves half of it unverified.
import { test, expect, Page } from "@playwright/test";
import { buildStub, Surface } from "./_stub/build";

let PAGES: Record<Surface, string>;
test.beforeAll(() => {
  PAGES = buildStub();
});

/** The resting opacity each surface designed for this row. They differ. */
const RESTING: Record<Surface, number> = { globalPage: 1, issuePanel: 0.85 };

/** Alpha of a computed colour — 1 is a solid fill, anything less is a tint. */
const alphaOf = (c: string) => {
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (!m) return 1;
  const p = m[1].split(",");
  return p.length > 3 ? parseFloat(p[3]) : 1;
};

async function settle(page: Page) {
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll(".message-meta")).every((el) =>
        el.getAnimations().every((a) => a.playState !== "running"),
      ),
    undefined,
    { timeout: 5000 },
  );
}

/**
 * Mount the surface and push rows through the RESTORE branch.
 *
 * Every message here is in the WIRE shape — `role: "assistant"`, no `type` —
 * because that is what comes back out of KVS, and `_withRenderType` mapping it
 * is part of the path under test. A fixture that pre-set `type: "ai"` would be
 * testing the live shape through the restore branch.
 */
async function mount(page: Page, url: string, reduced = false) {
  await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
  await page.goto(url);
  const applied = await page.evaluate(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  expect(applied, "prefers-reduced-motion emulation did not apply").toBe(reduced);

  await page.evaluate(() => {
    const w = window as any;
    w.chat = new w.CW.ChatInterface(document.getElementById("chatMessages"));
    // 1. THE COMMON CASE. No skill loaded, nothing summarised, nothing cut off.
    w.chat.addMessage({
      id: "m_plain",
      role: "assistant",
      content: "Berlin is the capital of Germany.",
      model: "claude-sonnet-4-5",
      usage: { total_tokens: 912 },
      iterations: 1,
      truncated: false,
      contextNote: null,
      skillsUsed: null,
      decks: null,
      answerOptions: null,
    });
    // 2. THE REPORTED BUG. Truncated and nothing else to say.
    w.chat.addMessage({
      id: "m_trunc",
      role: "assistant",
      content: "I got through four of the eight issues before I ran out of steps.",
      model: "claude-opus-5",
      usage: { total_tokens: 48200 },
      iterations: 12,
      truncated: true,
      contextNote: null,
      skillsUsed: null,
      decks: null,
      answerOptions: null,
    });
    // 3. GENUINELY NOTHING. Must draw no row at all — an empty .message-meta is
    //    a stray gap under every reply, invisible until you measure it.
    w.chat.addMessage({
      id: "m_nothing",
      role: "assistant",
      content: "Hi.",
      model: null,
      usage: null,
      iterations: null,
      truncated: false,
      contextNote: null,
      skillsUsed: null,
      decks: null,
      answerOptions: null,
    });
  });
}

const chipsOf = (page: Page, id: string) =>
  page.$$eval(
    `[data-message-id="${id}"] .message-meta-chip`,
    (els) => els.map((e) => (e.textContent || "").trim()),
  );

for (const surface of ["globalPage", "issuePanel"] as Surface[]) {
  test.describe(surface, () => {
    test("a BARE restored turn keeps its model and token chips", async ({ page }) => {
      await mount(page, PAGES[surface]);
      await settle(page);

      const row = page.locator('[data-message-id="m_plain"] .message-meta');
      await expect(row, "the common case drew no meta row on restore").toHaveCount(1);

      const chips = await chipsOf(page, "m_plain");
      expect(chips.join(" | ")).toMatch(/sonnet/i);
      expect(chips.join(" | ")).toMatch(/tokens/);
      // One tool call is not worth a chip; twelve is. Pinned so the row does not
      // quietly grow noise on the most common turn there is.
      expect(chips.join(" | ")).not.toMatch(/tool calls/);
    });

    test("TRUNCATION ALONE draws a solid warning chip", async ({ page }) => {
      await mount(page, PAGES[surface]);
      await settle(page);

      const chips = await chipsOf(page, "m_trunc");
      expect(chips.join(" | "), "a cut-off reply came back looking finished").toMatch(
        /truncated/i,
      );
      expect(chips.join(" | ")).toMatch(/12 tool calls/);

      const warn = page.locator(
        '[data-message-id="m_trunc"] .message-meta-chip.warn',
      );
      await expect(warn, "the truncation chip is not styled as a warning").toHaveCount(1);

      // A warning rendered in a 10% tint is not a warning. Solid colour, and
      // heavier than the muted chips beside it.
      const style = await warn.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { color: cs.color, weight: cs.fontWeight, opacity: cs.opacity };
      });
      expect(alphaOf(style.color), `warning chip is a faded tint: ${style.color}`).toBe(1);
      expect(Number(style.weight)).toBeGreaterThanOrEqual(600);
    });

    test("a turn with nothing to say draws no row and no stray gap", async ({ page }) => {
      await mount(page, PAGES[surface]);
      await settle(page);
      await expect(
        page.locator('[data-message-id="m_nothing"] .message-meta'),
        "an empty meta row was appended — a bare div with a top margin",
      ).toHaveCount(0);
    });

    test("the row ENTERS rather than blinking in, and lands at its resting state", async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto(PAGES[surface]);
      // Sample DURING the entrance: an element that is already at rest one frame
      // after insertion had no entrance at all.
      const running = await page.evaluate(() => {
        const w = window as any;
        w.chat = new w.CW.ChatInterface(document.getElementById("chatMessages"));
        w.chat.addMessage({
          id: "m_anim",
          role: "assistant",
          content: "x",
          model: "claude-sonnet-4-5",
          usage: { total_tokens: 10 },
        });
        const el = document.querySelector('[data-message-id="m_anim"] .message-meta');
        return el
          ? el.getAnimations().map((a) => ({
              name: (a as any).animationName,
              state: a.playState,
            }))
          : [];
      });
      expect(running.length, "the meta row has no entrance — it blinks in").toBeGreaterThan(
        0,
      );
      expect(running.some((a) => a.state === "running")).toBe(true);

      await settle(page);
      const rest = await page.$eval(
        '[data-message-id="m_anim"] .message-meta',
        (el) => getComputedStyle(el).opacity,
      );
      // `both` fills forwards, so a keyframe ending at the wrong value would
      // permanently override the surface's designed opacity.
      expect(Number(rest)).toBeCloseTo(RESTING[surface], 2);
    });

    test("reduced motion lands the row at its end state, never stranded", async ({
      page,
    }) => {
      await mount(page, PAGES[surface], true);
      await settle(page);
      const op = await page.$eval(
        '[data-message-id="m_plain"] .message-meta',
        (el) => getComputedStyle(el).opacity,
      );
      // The whole point of collapsing to 1ms rather than `animation: none` on a
      // `both`-filled keyframe: killed outright, this row would stay at 0.
      expect(Number(op), "the meta row is invisible under reduced motion").toBeCloseTo(
        RESTING[surface],
        2,
      );
    });

    test("no left rail, and no chip clipped out of existence", async ({ page }) => {
      await mount(page, PAGES[surface]);
      await settle(page);

      // The one device this UI never uses. The row has `overflow: hidden` on the
      // global page precisely so the chip separators clip at the line start —
      // that must not turn into a visible bar on the row itself.
      const rowBorder = await page.$eval(
        '[data-message-id="m_trunc"] .message-meta',
        (el) => getComputedStyle(el).borderLeftWidth,
      );
      expect(rowBorder).toBe("0px");

      // Every chip must be readable: nothing zero-width, nothing pushed outside
      // the row's clip box.
      const box = await page.$eval('[data-message-id="m_trunc"] .message-meta', (el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right };
      });
      const chips = await page.$$eval(
        '[data-message-id="m_trunc"] .message-meta-chip',
        (els) =>
          els.map((e) => {
            const r = e.getBoundingClientRect();
            return { text: (e.textContent || "").trim(), left: r.left, right: r.right, w: r.width };
          }),
      );
      expect(chips.length).toBeGreaterThan(2);
      for (const c of chips) {
        expect(c.w, `chip collapsed to nothing: ${c.text}`).toBeGreaterThan(4);
        expect(c.left, `chip clipped off the left: ${c.text}`).toBeGreaterThanOrEqual(
          box.left - 0.5,
        );
        expect(c.right, `chip clipped off the right: ${c.text}`).toBeLessThanOrEqual(
          box.right + 0.5,
        );
      }
    });
  });
}
