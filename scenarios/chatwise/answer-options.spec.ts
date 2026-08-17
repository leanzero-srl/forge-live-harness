// The Product Owner's questions, as clickable answers — verified in a browser.
//
// Runs the SAME assertions against both chat surfaces and again with
// prefers-reduced-motion emulated, because the app carries two copies of this
// CSS (the surfaces share no design tokens) and a motion rule that only holds
// in one mode is not a motion rule.
//
// Nothing here trusts a screenshot: colours come from getComputedStyle,
// smoothness from real rAF deltas, and every behavioural claim is on what the
// component emitted.
//
// It has already earned its keep — on the first run it caught three defects
// that reading could not: an answered menu being handed back by the next
// render (so the same option could be sent twice), a message mid-delete-fade
// counting as the newest one, and removeMessage never re-settling at all.
import { test, expect, Page } from "@playwright/test";
import { buildStub, Surface } from "./_stub/build";

const GROUPS = [
  {
    question: "Who are the most important customers we are targeting?",
    options: ["Enterprise ops teams", "SMB admins", "Internal support agents"],
  },
  {
    question: "What outcome matters most in the first quarter?",
    options: ["Cut handling time", "Raise self-serve rate", "Fewer escalations"],
  },
];

let PAGES: Record<Surface, string>;
test.beforeAll(() => {
  PAGES = buildStub();
});

/** Alpha of a computed colour — 1 means a solid fill, anything less is a tint. */
const alphaOf = (c: string) => {
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (!m) return 1;
  const p = m[1].split(",");
  return p.length > 3 ? parseFloat(p[3]) : 1;
};

/**
 * Wait until every entrance animation has finished.
 *
 * A fixed timeout is not good enough here: this config records video and
 * traces, which stretches wall-clock enough that a 220ms entrance is still
 * in flight when a naive sample lands — and a mid-flight opacity reads as a
 * stranded element rather than a running one.
 */
async function settle(page: Page) {
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll(".message-options")).every((el) =>
        el.getAnimations().every((a) => a.playState !== "running"),
      ),
    undefined,
    { timeout: 5000 },
  );
}

async function mount(page: Page, url: string, reduced = false) {
  await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
  await page.goto(url);
  // Prove the emulation took. A reduced-motion suite that silently ran as the
  // normal one would report green while testing nothing.
  const applied = await page.evaluate(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  expect(applied, "prefers-reduced-motion emulation did not apply").toBe(reduced);
  await page.evaluate((groups) => {
    const w = window as any;
    w.chat = new w.CW.ChatInterface(document.getElementById("chatMessages"));
    w.sent = [];
    w.chat.on("message-sent", (e: any) => w.sent.push(e));
    w.chat.addMessage({
      id: "m1",
      type: "ai",
      content: "Two questions before I draft this.",
      answerOptions: groups,
    });
  }, GROUPS);
  await settle(page);
}

for (const surface of ["globalPage", "issuePanel"] as Surface[]) {
  for (const reduced of [false, true]) {
    const suffix = reduced ? " (reduced motion)" : "";
    test.describe(`${surface}${suffix}`, () => {

      test("structure, semantics and escaping", async ({ page }) => {
        await mount(page, PAGES[surface], reduced);
        const shape = await page.evaluate(() => {
          const row = document.querySelector(".message-options");
          const body = row?.parentElement;
          const first = document.querySelector(".option-btn");
          return {
            parentIsBody: body?.className === "message-body",
            siblingOfBubble: !!body?.querySelector(":scope > .message-bubble"),
            insideBubble: !!document.querySelector(".message-bubble .message-options"),
            groups: document.querySelectorAll(".option-group").length,
            buttons: document.querySelectorAll(".option-btn").length,
            own: document.querySelectorAll(".option-btn-own").length,
            recommended: document.querySelectorAll(".option-btn.recommended").length,
            firstIsRecommended: first?.classList.contains("recommended"),
            badge: document.querySelector(".option-btn-badge")?.textContent,
            badgeHidden: document.querySelector(".option-btn-badge")?.getAttribute("aria-hidden"),
            ariaLabel: first?.getAttribute("aria-label"),
            realButtons: Array.from(document.querySelectorAll(".option-btn")).every(
              (b) => b.tagName === "BUTTON" && (b as HTMLButtonElement).type === "button",
            ),
            groupRole: document.querySelector(".message-options")?.getAttribute("role"),
            labelled: !!document.querySelector(".option-buttons[aria-labelledby]"),
          };
        });
        // Placement is load-bearing: createMessageElement and updateMessage both
        // set bubble.innerHTML, so anything inside the bubble is destroyed.
        expect(shape.parentIsBody && shape.siblingOfBubble).toBeTruthy();
        expect(shape.insideBubble, "options must never live inside the bubble").toBeFalsy();
        expect(shape.groups).toBe(2);
        expect(shape.buttons, "3 options + 'type your own', per group").toBe(8);
        expect(shape.own).toBe(2);
        expect(shape.recommended).toBe(2);
        expect(shape.firstIsRecommended, "options[0] IS the recommendation").toBe(true);
        // The badge is decorative; the word rides in aria-label so a screen
        // reader hears "recommended" once, not twice.
        expect(shape.badge).toBe("Recommended");
        expect(shape.badgeHidden).toBe("true");
        expect(shape.ariaLabel).toMatch(/\(recommended\)$/);
        // Real buttons mean Enter and Space work with no key handling of our own.
        expect(shape.realButtons).toBeTruthy();
        expect(shape.groupRole).toBe("group");
        expect(shape.labelled).toBeTruthy();

        // Option text is model-authored. It must never be parsed as markup.
        const injected = await page.evaluate(() => {
          (window as any).chat.addMessage({
            id: "x",
            type: "ai",
            content: "hi",
            answerOptions: [{ question: "<img src=x onerror=alert(1)>", options: ["<b>b</b>"] }],
          });
          const q = document.querySelectorAll(".option-question");
          const t = document.querySelectorAll(".option-btn-text");
          return {
            qHtml: q[q.length - 1].innerHTML,
            bText: t[t.length - 1].textContent,
            parsed: document.querySelectorAll(".message-options img, .message-options b").length,
          };
        });
        expect(injected.parsed).toBe(0);
        expect(injected.qHtml).toContain("&lt;img");
        expect(injected.bText).toBe("<b>b</b>");
      });

      test("survives the double updateMessage a streaming settle performs", async ({ page }) => {
        await mount(page, PAGES[surface], reduced);
        // StreamingAnimation._settle calls updateMessage twice, 500ms apart.
        const buttons = await page.evaluate(() => {
          const c = (window as any).chat;
          c.updateMessage("m1", { content: "Two questions before I draft this.", streaming: false });
          c.updateMessage("m1", { content: "Two questions before I draft this.", wasStreaming: true });
          return document.querySelectorAll(".option-btn").length;
        });
        expect(buttons).toBe(8);
      });

      test("hover and chosen fills are solid, with no left rail", async ({ page }) => {
        await mount(page, PAGES[surface], reduced);
        const sel = '[data-message-id="m1"] .option-btn';
        const rest = await page.evaluate(
          (s) => getComputedStyle(document.querySelector(s)!).backgroundColor,
          sel,
        );
        await page.hover(sel);
        await page.waitForTimeout(250);
        const hover = await page.evaluate((s) => {
          const cs = getComputedStyle(document.querySelector(s)!);
          return { bg: cs.backgroundColor, border: cs.borderTopColor };
        }, sel);

        expect(hover.bg, "hover must change the fill").not.toBe(rest);
        // Project rule: solid saturated accent, never an 8-12% tint.
        expect(alphaOf(hover.bg), `faded hover fill ${hover.bg}`).toBe(1);
        expect(hover.bg, "one solid colour, fill and border agree").toBe(hover.border);

        // Project rule: no left accent rail anywhere.
        const rails = await page.evaluate(
          () =>
            Array.from(document.querySelectorAll(".message-options, .message-options *")).filter(
              (el) => {
                const cs = getComputedStyle(el);
                return (
                  (parseFloat(cs.borderLeftWidth) || 0) > 0 &&
                  (parseFloat(cs.borderTopWidth) || 0) === 0
                );
              },
            ).length,
        );
        expect(rails).toBe(0);
      });

      test("a tabbed-to option shows a real focus ring", async ({ page }) => {
        await mount(page, PAGES[surface], reduced);
        await page.evaluate(() => document.getElementById("chatInput")!.focus());
        let found: { visible: boolean; shadow: string } | null = null;
        for (let i = 0; i < 12 && !found; i++) {
          await page.keyboard.press("Tab");
          const r = await page.evaluate(() => {
            const el = document.activeElement as HTMLElement;
            return {
              isOption: el?.classList?.contains("option-btn"),
              visible: el?.matches?.(":focus-visible"),
              shadow: getComputedStyle(el).boxShadow,
            };
          });
          if (r.isOption) found = { visible: r.visible, shadow: r.shadow };
        }
        expect(found, "option buttons must be reachable by Tab").toBeTruthy();
        expect(found!.visible).toBe(true);
        expect(found!.shadow).not.toBe("none");
      });

      test("the row animates as one layer and honours reduced motion", async ({ page }) => {
        await mount(page, PAGES[surface], reduced);
        const anim = await page.evaluate(() => {
          (window as any).chat.addMessage({
            id: "m2",
            type: "ai",
            content: "again",
            answerOptions: [{ question: "Q", options: ["a", "b", "c"] }],
          });
          const row = document.querySelectorAll(".message-options")[1];
          const cs = getComputedStyle(row);
          return {
            rowAnim: cs.animationName,
            rowDur: parseFloat(cs.animationDuration),
            kids: Array.from(row.querySelectorAll(".option-btn")).map(
              (b) => getComputedStyle(b).animationName,
            ),
          };
        });
        // Per-element staggering is exactly what reads as "choppy".
        expect(anim.rowAnim).not.toBe("none");
        expect(anim.kids.every((n) => n === "none"), "buttons must not animate individually").toBe(
          true,
        );

        await settle(page);
        const opacity = await page.evaluate(
          () => getComputedStyle(document.querySelectorAll(".message-options")[1]).opacity,
        );
        // Whatever the duration, the END STATE must apply — a `both`-filled
        // keyframe with its animation switched off strands the row invisible.
        expect(opacity).toBe("1");

        if (reduced) {
          expect(anim.rowDur).toBeLessThanOrEqual(0.005);
        } else {
          expect(anim.rowDur).toBeGreaterThan(0.1);
          const frames: number[] = await page.evaluate(
            () =>
              new Promise((res) => {
                const d: number[] = [];
                let last = performance.now();
                let n = 0;
                const tick = (t: number) => {
                  d.push(t - last);
                  last = t;
                  if (++n < 90) requestAnimationFrame(tick);
                  else res(d.slice(1));
                };
                requestAnimationFrame(tick);
              }),
          );
          const janky = frames.filter((f) => f > 33).length;
          expect(janky, `${janky} frames over 33ms`).toBe(0);
        }
      });

      test("clicking submits that answer, once, and spends the menu", async ({ page }) => {
        await mount(page, PAGES[surface], reduced);
        const sel = '[data-message-id="m1"] .option-btn';
        const clicked = await page.evaluate((s) => {
          const b = document.querySelector(s) as HTMLButtonElement;
          b.click();
          return {
            sent: (window as any).sent.map((e: any) => e.message ?? e.content ?? e),
            isChosen: b.classList.contains("is-chosen"),
          };
        }, sel);
        expect(JSON.stringify(clicked.sent)).toContain("Enterprise ops teams");
        // Two questions on screen: a bare "SMB admins" is ambiguous to the
        // model, and state fidelity is the entire point of the wizard.
        expect(JSON.stringify(clicked.sent)).toContain("Who are the most important customers");
        expect(clicked.isChosen).toBeTruthy();

        const chosenBg = await page.evaluate(
          () => getComputedStyle(document.querySelector(".option-btn.is-chosen")!).backgroundColor,
        );
        expect(alphaOf(chosenBg), "the chosen state must stay solid once disabled").toBe(1);

        await settle(page);
        const spent = await page.evaluate(() => {
          const row = document.querySelector(".message-options")!;
          return {
            answered: row.classList.contains("answered"),
            disabled: Array.from(row.querySelectorAll("button")).every((b) => b.disabled),
            opacity: getComputedStyle(row).opacity,
          };
        });
        expect(spent.answered && spent.disabled).toBeTruthy();
        // Spent rows stay a legible record of what was offered.
        expect(spent.opacity).toBe("1");

        // THE REGRESSION. _refreshOptionInteractivity re-runs on the very next
        // addMessage — the user bubble this click produces — and "last row
        // wins" used to hand the menu straight back.
        const extra = await page.evaluate((s) => {
          const w = window as any;
          const before = w.sent.length;
          (document.querySelector(s) as HTMLButtonElement).click();
          return w.sent.length - before;
        }, sel);
        expect(extra, "a second click must send nothing").toBe(0);
      });

      test("a single question sends the bare answer", async ({ page }) => {
        await mount(page, PAGES[surface], reduced);
        const sent = await page.evaluate(() => {
          const w = window as any;
          w.chat.removeMessage("m1");
          w.sent = [];
          w.chat.addMessage({
            id: "m3",
            type: "ai",
            content: "one more",
            answerOptions: [{ question: "Ship it?", options: ["Yes, ship it", "Not yet"] }],
          });
          (document.querySelector('[data-message-id="m3"] .option-btn') as HTMLButtonElement).click();
          return w.sent.map((e: any) => e.message ?? e.content ?? e);
        });
        // With one question the bubble reads exactly like something the user typed.
        expect(sent).toEqual(["Yes, ship it"]);
      });

      test("deleting the newest turn hands the menu back to the one before it", async ({ page }) => {
        await mount(page, PAGES[surface], reduced);
        await page.evaluate(() => {
          (window as any).chat.addMessage({
            id: "m2",
            type: "ai",
            content: "newer",
            answerOptions: [{ question: "Q2", options: ["x", "y"] }],
          });
        });
        const before = await page.evaluate(
          () =>
            (document.querySelector('[data-message-id="m1"] .option-btn') as HTMLButtonElement)
              .disabled,
        );
        expect(before, "an older menu is not answerable").toBe(true);

        await page.evaluate(() => (window as any).chat.removeMessage("m2"));
        await page.waitForTimeout(340); // the delete fade, or this measures a corpse
        const after = await page.evaluate(
          () =>
            (document.querySelector('[data-message-id="m1"] .option-btn') as HTMLButtonElement)
              .disabled,
        );
        expect(after, "removeMessage must re-settle interactivity").toBe(false);
      });
    });
  }
}
