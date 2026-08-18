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
            own: document.querySelectorAll(".option-own-input").length,
            ownIsInput: Array.from(document.querySelectorAll(".option-own-input")).every(
              (el) => el.tagName === "INPUT" && (el as HTMLInputElement).type === "text",
            ),
            ownPlaceholder: (document.querySelector(".option-own-input") as HTMLInputElement)
              ?.placeholder,
            ownLabelled: Array.from(document.querySelectorAll(".option-own-input")).every(
              (el) => !!el.getAttribute("aria-label"),
            ),
            // One strip per LINE: within a group, each button starts below the
            // previous one and spans (nearly) the full row width.
            stacked: (() => {
              const g = document.querySelector(".option-buttons")!;
              const bs = Array.from(g.querySelectorAll(".option-btn")).map((b) =>
                b.getBoundingClientRect(),
              );
              const gw = g.getBoundingClientRect().width;
              return (
                bs.every((r, i) => i === 0 || r.top >= bs[i - 1].bottom - 1) &&
                bs.every((r) => r.width > gw * 0.9)
              );
            })(),
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
        expect(shape.buttons, "3 option strips per group — the input is not a chip").toBe(6);
        expect(shape.own, "one 'type your own' input per group").toBe(2);
        expect(shape.ownIsInput, "'type your own' must be a standard text input").toBe(true);
        expect(shape.ownPlaceholder).toMatch(/type your own answer/i);
        expect(shape.ownLabelled, "the inputs carry the question in aria-label").toBe(true);
        expect(shape.stacked, "answers must stack one per line, full width").toBe(true);
        const sendShape = await page.evaluate(() => {
          const send = document.querySelector(".option-send-btn") as HTMLButtonElement;
          return send
            ? { disabled: send.disabled, count: send.querySelector(".option-send-count")?.textContent }
            : null;
        });
        expect(sendShape, "a multi-question row must carry a Send answers footer").toBeTruthy();
        expect(sendShape!.disabled, "Send must be disabled before any answer").toBe(true);
        expect(sendShape!.count).toBe("0/2");
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
          return {
            btns: document.querySelectorAll(".option-btn").length,
            inputs: document.querySelectorAll(".option-own-input").length,
          };
        });
        expect(buttons).toEqual({ btns: 6, inputs: 2 });
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

      test("multi-question: clicks STAGE, and Send submits the whole sheet once", async ({ page }) => {
        await mount(page, PAGES[surface], reduced);
        const afterFirst = await page.evaluate(() => {
          const w = window as any;
          const groups = document.querySelectorAll('[data-message-id="m1"] .option-group');
          (groups[0].querySelector(".option-btn") as HTMLButtonElement).click();
          const send = document.querySelector(".option-send-btn") as HTMLButtonElement;
          return {
            sent: w.sent.length,
            chosen: groups[0].querySelector(".option-btn")!.classList.contains("is-chosen"),
            sendDisabled: send.disabled,
            count: send.querySelector(".option-send-count")?.textContent,
          };
        });
        // THE BROKEN FLOW: one click used to fire inference immediately,
        // abandoning every other question on screen.
        expect(afterFirst.sent, "a click on one of several questions must SEND NOTHING").toBe(0);
        expect(afterFirst.chosen, "the click must stage visibly").toBe(true);
        expect(afterFirst.sendDisabled, "Send stays disabled while questions remain").toBe(true);
        expect(afterFirst.count).toBe("1/2");

        // Changing your mind restages within the group — still nothing sent.
        const restaged = await page.evaluate(() => {
          const w = window as any;
          const g0 = document.querySelectorAll('[data-message-id="m1"] .option-group')[0];
          const btns = g0.querySelectorAll(".option-btn");
          (btns[1] as HTMLButtonElement).click();
          return {
            sent: w.sent.length,
            first: btns[0].classList.contains("is-chosen"),
            second: btns[1].classList.contains("is-chosen"),
          };
        });
        expect(restaged.sent).toBe(0);
        expect(restaged.first, "the old choice must unstage").toBe(false);
        expect(restaged.second).toBe(true);

        const submitted = await page.evaluate(() => {
          const w = window as any;
          const groups = document.querySelectorAll('[data-message-id="m1"] .option-group');
          (groups[1].querySelector(".option-btn") as HTMLButtonElement).click();
          const send = document.querySelector(".option-send-btn") as HTMLButtonElement;
          const enabledAtFull = !send.disabled;
          send.click();
          return { enabledAtFull, sent: w.sent.map((e: any) => e.message ?? e.content ?? e) };
        });
        expect(submitted.enabledAtFull, "Send must arm once every question is answered").toBe(true);
        expect(submitted.sent.length, "Send must submit exactly one message").toBe(1);
        // The model-proof shape: its own questions quoted back with the answers.
        const text = String(submitted.sent[0]);
        expect(text).toContain("Here are my answers to your questions:");
        expect(text).toContain("Q: Who are the most important customers");
        expect(text).toMatch(/A: /);

        await settle(page);
        const spent = await page.evaluate(() => {
          const row = document.querySelector(".message-options")!;
          const w = window as any;
          const before = w.sent.length;
          (document.querySelector(".option-send-btn") as HTMLButtonElement).click();
          (row.querySelector(".option-btn") as HTMLButtonElement).click();
          return {
            answered: row.classList.contains("answered"),
            disabled: Array.from(row.querySelectorAll("button")).every((b) => b.disabled),
            extra: w.sent.length - before,
          };
        });
        expect(spent.answered && spent.disabled, "Send must spend the menu").toBeTruthy();
        expect(spent.extra, "a spent sheet must never send again").toBe(0);
      });

      test("the inline input STAGES in a multi-question sheet; Enter on a complete sheet sends", async ({ page }) => {
        await mount(page, PAGES[surface], reduced);
        const out = await page.evaluate(() => {
          const w = window as any;
          const groups = document.querySelectorAll('[data-message-id="m1"] .option-group');
          const input = groups[0].querySelector(".option-own-input") as HTMLInputElement;
          const enter = () =>
            input.dispatchEvent(
              new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
            );
          // Empty Enter is a no-op.
          enter();
          const afterEmpty = w.sent.length;
          // Typing stages live (input event), clears the group's strip choice.
          (groups[0].querySelector(".option-btn") as HTMLButtonElement).click();
          input.value = "  Our own niche segment  ";
          input.dispatchEvent(new Event("input", { bubbles: true }));
          const stripCleared = !groups[0].querySelector(".option-btn")!.classList.contains("is-chosen");
          const sentAfterTyping = w.sent.length;
          // Answer the second question by strip, then Enter in the input sends
          // the complete sheet — the keyboard path needs no button.
          (groups[1].querySelector(".option-btn") as HTMLButtonElement).click();
          enter();
          const sent = w.sent.map((e: any) => e.message ?? e.content ?? e);
          const row = document.querySelector(".message-options")!;
          const spent = {
            answered: row.classList.contains("answered"),
            inputsDisabled: Array.from(row.querySelectorAll("input")).every((i: any) => i.disabled),
          };
          enter();
          return { afterEmpty, stripCleared, sentAfterTyping, sent, ...spent, extra: w.sent.length - sent.length };
        });
        expect(out.afterEmpty, "an empty Enter must send nothing").toBe(0);
        expect(out.stripCleared, "typing must unstage the clicked strip").toBe(true);
        expect(out.sentAfterTyping, "typing alone must send nothing").toBe(0);
        expect(out.sent.length, "Enter on a complete sheet sends exactly once").toBe(1);
        const text = String(out.sent[0]);
        expect(text).toContain("A: Our own niche segment");
        expect(text).toContain("Here are my answers to your questions:");
        expect(out.answered && out.inputsDisabled, "the sheet must spend on send").toBeTruthy();
        expect(out.extra, "a second Enter must send nothing").toBe(0);
      });

      test("decoding: a streaming message scrambles its options, resolve reveals them", async ({ page }) => {
        await mount(page, PAGES[surface], reduced);
        const during = await page.evaluate(() => {
          const w = window as any;
          w.chat.addMessage({
            id: "dec1",
            type: "ai",
            content: "thinking",
            streaming: true,
            answerOptions: [{ question: "Pick a lane?", options: ["The fast one", "The safe one", "The cheap one"] }],
          });
          const row = document.querySelector('[data-message-id="dec1"] .message-options')!;
          return {
            decoding: row.classList.contains("decoding"),
            hidden: row.getAttribute("aria-hidden"),
            busy: row.getAttribute("aria-busy"),
            disabled: Array.from(row.querySelectorAll("button, input")).every((b: any) => b.disabled),
            text: row.querySelector(".option-btn-text")!.textContent,
          };
        });
        expect(during.decoding, "a streaming message's options must render decoding").toBe(true);
        expect(during.hidden, "scramble must be aria-hidden").toBe("true");
        expect(during.busy).toBe("true");
        expect(during.disabled, "decoding options must not be clickable").toBe(true);
        if (!reduced) {
          expect(during.text, "the real answer must not be readable mid-generation").not.toBe("The fast one");
          expect(during.text!.length, "scramble keeps the real length — no layout shift").toBe("The fast one".length);
        } else {
          // Reduced motion: no glyph churn — quiet disabled wait with real text.
          expect(during.text).toBe("The fast one");
        }

        // The settle: handler re-attaches after the typewriter finishes.
        await page.evaluate(() => {
          const w = window as any;
          w.chat.updateMessage("dec1", { content: "done", streaming: false });
          const msg = w.chat.messages.find((m: any) => m.id === "dec1");
          w.chat.attachAnswerOptions("dec1", msg.answerOptions);
        });
        await page.waitForFunction(() => {
          const row = document.querySelector('[data-message-id="dec1"] .message-options');
          return row && !row.classList.contains("decoding");
        }, undefined, { timeout: 3000 });
        const after = await page.evaluate(() => {
          const row = document.querySelector('[data-message-id="dec1"] .message-options')!;
          return {
            text: row.querySelector(".option-btn-text")!.textContent,
            hidden: row.getAttribute("aria-hidden"),
            enabled: !(row.querySelector(".option-btn") as HTMLButtonElement).disabled,
          };
        });
        expect(after.text, "the resolve must land on the exact real text").toBe("The fast one");
        expect(after.hidden).toBeNull();
        expect(after.enabled, "resolved options must be clickable").toBe(true);
        await page.evaluate(() => (window as any).chat.removeMessage("dec1"));
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

      test("REGRESSION: a spent menu stays spent across a full re-render", async ({ page }) => {
        // Liveness used to be "the last .message-options in the DOM", with the
        // answered flag living only on the node. A reload re-attached every row
        // with no memory of it, so a menu that had already been answered came
        // back clickable and the same question could be answered twice.
        await mount(page, PAGES[surface], reduced);
        await page.evaluate(() => {
          const groups = document.querySelectorAll('[data-message-id="m1"] .option-group');
          (groups[0].querySelector(".option-btn") as HTMLButtonElement).click();
          (groups[1].querySelector(".option-btn") as HTMLButtonElement).click();
          (document.querySelector(".option-send-btn") as HTMLButtonElement).click();
        });
        // Simulate the reload: rebuild every node from the message list.
        const after = await page.evaluate(() => {
          const w = window as any;
          w.chat.renderMessages();
          w.chat._refreshOptionInteractivity();
          const btns = Array.from(
            document.querySelectorAll('[data-message-id="m1"] .option-btn'),
          ) as HTMLButtonElement[];
          return { count: btns.length, enabled: btns.filter((b) => !b.disabled).length };
        });
        expect(after.count, "the options row vanished on re-render").toBeGreaterThan(0);
        expect(after.enabled, "an answered menu came back clickable after a re-render").toBe(0);
      });

      test("REGRESSION: typing your own answer retires the menu", async ({ page }) => {
        // A user bubble contributes no .message-options row, so "last row in
        // the DOM" never changed and the old menu stayed live forever.
        await mount(page, PAGES[surface], reduced);
        const enabled = await page.evaluate(() => {
          const w = window as any;
          w.chat.addMessage({ id: "typed", type: "user", content: "something else entirely" });
          w.chat._refreshOptionInteractivity();
          return Array.from(
            document.querySelectorAll('[data-message-id="m1"] .option-btn'),
          ).filter((b: any) => !b.disabled).length;
        });
        expect(enabled, "the menu stayed live after the user typed their own answer").toBe(0);
      });

      test("REGRESSION: a browse URL is not mangled into a bogus issue link", async ({ page }) => {
        // The issue-key linkifier guarded with a lookbehind, which the regex
        // engine simply retries past — so every browse URL the model emitted
        // (and the system prompt tells it to) rendered as a chip reading
        // "BC-12", linking to an issue that does not exist, with the remains of
        // the href as visible text.
        await mount(page, PAGES[surface], reduced);
        const out = await page.evaluate(() => {
          const w = window as any;
          const html = w.chat.formatAIMessage("https://x.atlassian.net/browse/ABC-123");
          const el = document.createElement("div");
          el.innerHTML = html;
          const links = Array.from(el.querySelectorAll("a"));
          return {
            linkCount: links.length,
            href: links[0]?.getAttribute("href"),
            text: el.textContent,
          };
        });
        expect(out.linkCount, "the URL produced nested or extra links").toBe(1);
        expect(out.href).toBe("https://x.atlassian.net/browse/ABC-123");
        // Nothing of the markup may survive as visible text.
        expect(out.text).not.toContain("data-url");
        expect(out.text).toBe("https://x.atlassian.net/browse/ABC-123");
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
