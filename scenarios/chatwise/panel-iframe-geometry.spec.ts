// LIVE: WHAT `window.innerHeight` MEANS INSIDE A REAL FORGE IFRAME — and
// therefore whether the persona menu's drop-up flip can work at all.
//
// WHY THIS EXISTS
// ---------------
// `persona-menu-fold.spec.ts` proves the fold and the flip in the STUB
// harness, where the component runs in a top-level browsing context. In a stub
// `window.innerHeight` is trivially the iframe's own height, because there is
// no iframe. `PersonaSelector._positionMenu()` reads exactly that number to
// decide whether there is room below the trigger:
//
//     const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
//     const below = Math.max(0, viewportH - rect.bottom - MENU_EDGE_GAP);
//     const up = below < MENU_MIN_SPACE && above > below;
//
// If a Forge iframe reported the HOST viewport instead of its own box, `below`
// would be computed against ~900px of Jira page that the menu cannot draw into,
// `up` would be false, and the panel would go straight back to the shipped bug:
// a menu drawn 76px outside a 524px iframe with no way to reach it. Every stub
// assertion would still be green. That is why this is a DEPLOYED spec and not
// another stub case — the stub cannot ask this question.
//
// The measurement is a precondition, not a nicety, so it is asserted rather
// than logged: the day Atlassian changes how the surface is embedded, this goes
// red with the numbers in the message instead of the panel silently regressing.
//
// It is deliberately NOT in persona-menu-fold.spec.ts: that file drives the
// stub through `@playwright/test`'s own `test`, and this one needs the shared
// worker context from fixtures/forge. Two test objects in one file is a trap
// worth avoiding for the sake of a filename.
//
// NO MODEL RUNS HERE. Nothing below depends on a reply, so it cannot be
// quota-blocked and never skips.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  openPanel,
  openGlobalPage,
  waitForChatApp,
  PANEL_APP,
  GLOBAL_APP,
} from "./chatwise-support";
// eslint-disable-next-line
import { get, post } from "../../data/jira.mjs";
import { deleteFixtures } from "./chatwise-support";

const PROJECT = process.env.CHATWISE_TEST_PROJECT || "WFH";

/** Everything the two surfaces are measured on, read from the live layout. */
async function menuGeometry(frame: any) {
  return frame.locator("body").evaluate(() => {
    const menu = document.getElementById("dropdownOptions") as HTMLElement;
    const dd = document.getElementById("personaDropdown") as HTMLElement;
    const trig = document.getElementById("dropdownSelected") as HTMLElement;
    const mr = menu.getBoundingClientRect();
    const tr = trig.getBoundingClientRect();
    const rows = Array.from(menu.querySelectorAll(".dropdown-option")) as HTMLElement[];
    const last = rows[rows.length - 1];
    const foldY = mr.top + menu.clientTop + menu.clientHeight;
    return {
      open: menu.classList.contains("open"),
      dropUp: dd.classList.contains("drop-up"),
      innerHeight: window.innerHeight,
      docClientHeight: document.documentElement.clientHeight,
      menuTop: mr.top,
      menuBottom: mr.bottom,
      menuClientHeight: menu.clientHeight,
      menuScrollHeight: menu.scrollHeight,
      inlineMaxHeight: menu.style.maxHeight,
      triggerTop: tr.top,
      triggerBottom: tr.bottom,
      rowCount: rows.length,
      lastRowId: last ? (last as HTMLElement).dataset.personaId : null,
      lastRowBelowFoldBy: last ? last.getBoundingClientRect().bottom - foldY : NaN,
      moreCue: (menu.querySelector(".dropdown-more") as HTMLElement | null)?.textContent?.trim() ?? null,
    };
  });
}

/** The rect of the iframe ELEMENT the given surface lives in, read host-side. */
async function chatWiseIframeBox(page: any, urlFragment: RegExp) {
  return page.evaluate((frag: string) => {
    const re = new RegExp(frag, "i");
    const candidates = Array.from(document.querySelectorAll("iframe"))
      .map((f) => ({ f, r: f.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.height > 0);
    // Forge serves each app from its own *.cdn.prod.atlassian-dev.net origin,
    // so the src is opaque. Pick the biggest visible one that is not zero-sized
    // — on an issue page the ChatWise panel is the only visible Forge iframe of
    // any size, and the assertion below cross-checks it against the frame's own
    // innerWidth so a wrong pick cannot pass silently.
    const best = candidates.sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0];
    return best
      ? {
          hostInnerHeight: window.innerHeight,
          w: Math.round(best.r.width),
          h: Math.round(best.r.height),
          top: Math.round(best.r.top),
          bottom: Math.round(best.r.bottom),
          count: candidates.length,
        }
      : null;
  }, urlFragment.source);
}

test("ISSUE PANEL: innerHeight is the IFRAME's height, not the host viewport", async ({ page }) => {
  test.setTimeout(300_000);
  const T = getTarget("chatwise-issue-panel");
  const made: string[] = [];
  try {
    // Seed our own issue rather than borrowing one: a spec that depends on a
    // hand-picked key dies the day somebody tidies the project.
    const meta: any = await get(`/rest/api/3/issue/createmeta/${PROJECT}/issuetypes?maxResults=200`);
    const types: any[] = meta?.issueTypes || meta?.values || [];
    const std = types.find((t: any) => t.hierarchyLevel === 0);
    expect(std, `${PROJECT} has no standard issue type`).toBeTruthy();
    const issue: any = await post("/rest/api/3/issue", {
      fields: {
        project: { key: PROJECT },
        issuetype: { id: String(std.id) },
        summary: `[harness-test] panel geometry ${Date.now()}`,
        labels: ["harness-test"],
      },
    });
    made.push(issue.key);

    const frame = await openPanel(page, T, issue.key);
    await waitForChatApp(page, frame, PANEL_APP, 120_000);

    const box = await chatWiseIframeBox(page, /cdn\.prod\.atlassian-dev/);
    expect(box, "no visible Forge iframe was found on the issue page").not.toBeNull();

    const inside = await frame.locator("body").evaluate(() => ({
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
      docClientHeight: document.documentElement.clientHeight,
    }));
    console.log(
      `[panel] host innerHeight=${box!.hostInnerHeight} · iframe element ${box!.w}x${box!.h} ` +
        `· inside innerHeight=${inside.innerHeight} innerWidth=${inside.innerWidth} ` +
        `docClientHeight=${inside.docClientHeight}`,
    );

    // The iframe we measured host-side is the one we are inside. Without this,
    // picking the wrong iframe would make every number below meaningless.
    expect(inside.innerWidth, "host-side iframe pick does not match the frame we are in").toBe(box!.w);

    // THE PRECONDITION THAT MAKES THE TEST NON-VACUOUS. If the host viewport and
    // the iframe were the same height, "innerHeight is the iframe" would be
    // indistinguishable from "innerHeight is the host".
    expect(
      box!.hostInnerHeight,
      `the host viewport (${box!.hostInnerHeight}px) happens to equal the iframe height ` +
        `(${box!.h}px) — this run cannot tell the two answers apart, so it proves nothing`,
    ).not.toBe(box!.h);

    // THE ANSWER. HANDOFF §1.9 asked whether a Forge iframe reports the host
    // viewport here. It does not: innerHeight is the iframe's own box.
    expect(
      inside.innerHeight,
      `window.innerHeight inside the panel iframe reported ${inside.innerHeight}px against an ` +
        `iframe element of ${box!.h}px and a host viewport of ${box!.hostInnerHeight}px. ` +
        `_positionMenu() computes "room below" from this number, so if it is the HOST's, the ` +
        `drop-up flip can never fire and the menu goes back to drawing outside the iframe.`,
    ).toBe(box!.h);
    expect(inside.innerHeight).not.toBe(box!.hostInnerHeight);
    expect(inside.docClientHeight).toBe(box!.h);

    // AND THEREFORE THE FLIP ACTUALLY HAPPENS, ON THE DEPLOYED SURFACE.
    await frame.locator("#dropdownSelected").click();
    await expect(frame.locator("#dropdownOptions")).toHaveClass(/open/);
    await page.waitForTimeout(600); // let the open transition finish before measuring
    const g = await menuGeometry(frame);
    console.log(`[panel] menu ${JSON.stringify(g)}`);

    expect(g.rowCount, "the panel roster rendered no personas").toBeGreaterThan(0);
    expect(
      g.dropUp,
      `the menu opened DOWNWARD from a trigger whose bottom is ${Math.round(g.triggerBottom)}px ` +
        `in a ${g.innerHeight}px iframe — this is the shipped bug`,
    ).toBe(true);
    expect(g.menuTop, "the menu is drawn above the top of the iframe").toBeGreaterThanOrEqual(-1);
    expect(
      g.menuBottom,
      `${Math.round(g.menuBottom - g.innerHeight)}px of menu is below the bottom of a ` +
        `${g.innerHeight}px iframe, with no way to scroll to it`,
    ).toBeLessThanOrEqual(g.innerHeight + 1);
    // The last row is reachable without scrolling, or the cue says how many are left.
    if (g.lastRowBelowFoldBy > 1) {
      expect(g.moreCue, "the panel menu scrolls and says nothing").toMatch(/\d+ more/i);
    }
  } finally {
    await deleteFixtures(made, "panel-iframe-geometry");
  }
});

test("GLOBAL PAGE: innerHeight is the iframe's, and the menu stays inside it", async ({ page }) => {
  test.setTimeout(240_000);
  const T = getTarget("chatwise-global");
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP, 120_000);

  const box = await chatWiseIframeBox(page, /cdn\.prod\.atlassian-dev/);
  expect(box).not.toBeNull();
  const inside = await frame.locator("body").evaluate(() => ({
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
  }));
  console.log(
    `[global] host innerHeight=${box!.hostInnerHeight} · iframe ${box!.w}x${box!.h} ` +
      `· inside innerHeight=${inside.innerHeight}`,
  );
  expect(inside.innerWidth, "host-side iframe pick does not match the frame we are in").toBe(box!.w);
  // The global page's iframe is nearly the whole window, so an exact equality
  // here would be a coin toss against Jira's banner height. What matters is that
  // the frame reports ITS OWN box: within a pixel of the element's height.
  expect(Math.abs(inside.innerHeight - box!.h), "innerHeight is not the iframe's own height").toBeLessThanOrEqual(1);

  await frame.locator("#dropdownSelected").click();
  await expect(frame.locator("#dropdownOptions")).toHaveClass(/open/);
  await page.waitForTimeout(600);
  const g = await menuGeometry(frame);
  console.log(`[global] menu ${JSON.stringify(g)}`);

  expect(g.rowCount, "the global roster rendered no personas").toBeGreaterThanOrEqual(5);
  // Near the top of a tall page there is room below, so it must NOT flip — a
  // menu that jumps sides when it does not need to is its own defect.
  expect(g.dropUp, "the global menu flipped upward with room below it").toBe(false);
  expect(g.menuBottom).toBeLessThanOrEqual(g.innerHeight + 1);
  expect(g.menuTop).toBeGreaterThanOrEqual(-1);
  if (g.lastRowBelowFoldBy > 1) {
    expect(g.moreCue, "the global menu scrolls and says nothing").toMatch(/\d+ more/i);
  }
});
