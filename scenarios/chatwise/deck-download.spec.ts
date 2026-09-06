// LIVE: THE DECK COMES BACK — as real PowerPoint bytes, and it is still there
// after a reload.
//
// WHY THIS EXISTS
// ---------------
// `getDeckContent` had no permanent spec, and this feature has failed silently
// twice in ways no unit test noticed:
//
//   1. `job.routes.js` `result` is an explicit ALLOW-LIST, and for one commit
//      the `decks` line was missing. The deck was built, held, and downloadable
//      by handle — and the browser never received the handle, so a working
//      Download button simply never appeared and nothing anywhere said why.
//   2. The job row and the MESSAGE row were two hand-written literals that
//      disagreed: the job named `decks`, the permanent message named none of
//      them. So a presentation was downloadable for exactly as long as the user
//      stayed on the tab and vanished the moment they came back — which reads
//      as the file having been lost. It had not been; it sat in its store until
//      the TTL with nothing on screen offering it.
//
// Both are FIELDS DROPPED IN A FORWARDING HOP, which is this repo's signature
// defect and is invisible to any test that stubs the hop. So this spec asks for
// a deck, then goes after it three ways:
//
//   THE BYTES ARE A REAL PPTX. Base64 in, decoded here, and the ZIP CENTRAL
//   DIRECTORY read by the harness — not "the response was truthy". A truncated
//   body or a base64 round trip that lost bytes produces something a browser
//   saves happily and PowerPoint refuses.
//
//   THE SLIDE COUNT IS INTERNALLY CONSISTENT. The number of
//   ppt/slides/slideN.xml parts must equal the number of <p:sldId> entries
//   registered in ppt/presentation.xml, AND equal the count the tool reported.
//   A renderer that writes a slide part without registering it produces a file
//   that opens with slides missing and no error at all. This assertion is
//   model-independent: it does not care how many slides the model chose.
//
//   IT SURVIVES A RELOAD. A hard reload of the surface, the conversation read
//   back from storage, the handle still on the stored assistant message, the
//   download row still rendered in the thread, and getDeckContent still
//   answering with the same bytes. That is precisely the bug in (2), asserted
//   on the user-visible side rather than on the store.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  GLOBAL_APP,
  callResolver,
  describeLogs,
  logWindow,
  openGlobalPage,
  skipIfQuotaBlocked,
  waitForChatApp,
} from "./chatwise-support";
// eslint-disable-next-line
import { zipEntries, slideFileCount, readEntryText } from "../../data/zip.mjs";

async function ask(frame: any, page: any, conversationId: string, message: string) {
  const sent = await callResolver<any>(frame, GLOBAL_APP, "chat", {
    conversationId,
    message,
    personaId: "jira-scrubber",
    personaLocked: true,
  });
  expect(sent?.success, `enqueue failed: ${sent?.error}`).toBeTruthy();
  let data: any = null;
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    const r = await callResolver<any>(frame, GLOBAL_APP, "getJobStatus", { jobId: sent.jobId });
    data = r?.data ?? null;
    if (data && ["completed", "failed", "cancelled"].includes(data.status)) break;
    await page.waitForTimeout(3000);
  }
  expect(data?.status, `job did not complete: ${data?.error}`).toBe("completed");
  console.log(
    `[deck] model=${data.result?.model} iterations=${data.result?.iterations} ` +
      `usage=${JSON.stringify(data.result?.usage)}`,
  );
  return data.result || {};
}

test("a generated deck downloads as a real .pptx, and it is still there after a reload", async ({
  page,
}) => {
  test.setTimeout(900_000);
  const T = getTarget("chatwise-global");
  const stamp = Date.now();
  const conversationId = `conv_harness_deck_${stamp}`;
  const title = `Harness Deck ${stamp}`;
  let frame: any = null;

  try {
    frame = await openGlobalPage(page, T);
    await waitForChatApp(page, frame, GLOBAL_APP, 120_000);
    await callResolver(frame, GLOBAL_APP, "createConversation", {
      conversationId,
      title: "[harness-test] deck download",
      personaId: "jira-scrubber",
    });

    // ---- THE TURN ----------------------------------------------------------
    // No issueKey, deliberately: the download path is the one under test, and
    // an attachment would give the model a second way to feel finished.
    const result = await ask(
      frame,
      page,
      conversationId,
      `Build a PowerPoint deck titled "${title}" with exactly three slides: a cover ` +
        `slide, a points slide listing three benefits of writing tests, and a section ` +
        `slide. Do NOT attach it to any Jira issue — I want the download.`,
    );
    const reply = String(result.response || "");
    console.log(`[deck] reply: ${reply.slice(0, 400)}`);
    skipIfQuotaBlocked(reply, "deck-download");

    // ---- THE HANDLE REACHED THE BROWSER -----------------------------------
    // This is the allow-list defect: everything upstream can be perfect and the
    // feature still never appears.
    const decks: any[] = result.decks || [];
    expect(
      decks.length,
      `the turn carried NO deck. job.routes.js's result is an explicit allow-list and ` +
        `\`decks\` has been missing from it before, which makes a working download button ` +
        `simply never appear. Reply was: "${reply.slice(0, 500)}"`,
    ).toBeGreaterThan(0);

    const deck = decks[0];
    console.log(`[deck] ${JSON.stringify(deck)}`);
    expect(deck.handle, "the deck has no handle, so nothing can fetch it").toMatch(/^[a-f0-9]{32}$/);
    expect(deck.filename, "the deck has no filename").toMatch(/\.pptx$/i);
    expect(deck.slides, "the tool did not report a slide count").toBeGreaterThan(0);
    expect(deck.attached, "the deck was attached to Jira despite being told not to").toBe(false);

    // ---- THE BYTES ---------------------------------------------------------
    const got = await callResolver<any>(frame, GLOBAL_APP, "getDeckContent", {
      handle: deck.handle,
      deckId: deck.handle,
      conversationId,
    });
    expect(got?.success, `getDeckContent refused: ${got?.error}`).toBe(true);
    expect(got.filename).toBe(deck.filename);
    expect(got.mimeType).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    expect(typeof got.base64, "getDeckContent returned no base64").toBe("string");

    const bytes = Buffer.from(got.base64, "base64");
    console.log(`[deck] ${bytes.length} bytes decoded (tool reported ${deck.sizeBytes})`);
    expect(bytes.length, "the decoded deck is empty").toBeGreaterThan(1000);
    expect(
      bytes.length,
      `the decoded body is ${bytes.length} bytes but the renderer produced ${deck.sizeBytes} — ` +
        `the base64 round trip lost or added data`,
    ).toBe(deck.sizeBytes);

    // ---- IT IS A PRESENTATION, NOT JUST A FILE ----------------------------
    const { names } = zipEntries(bytes);
    expect(names, "no ppt/presentation.xml — this is not a PowerPoint file").toContain(
      "ppt/presentation.xml",
    );
    expect(names).toContain("[Content_Types].xml");

    const slideParts = slideFileCount(names);
    // The registration count, read out of the presentation part itself. A slide
    // written but not registered opens with slides missing and no error.
    const presXml = readEntryText(bytes, "ppt/presentation.xml");
    const sldIds = (presXml.match(/<p:sldId\b/g) || []).length;
    console.log(`[deck] slide parts=${slideParts} registered=${sldIds} reported=${deck.slides}`);
    expect(slideParts, "the deck has no slide parts at all").toBeGreaterThan(0);
    expect(
      sldIds,
      `${slideParts} slide part(s) in the archive but ${sldIds} registered in ` +
        `ppt/presentation.xml — PowerPoint would open this with slides missing and no error`,
    ).toBe(slideParts);
    expect(
      slideParts,
      `the tool reported ${deck.slides} slides and the file contains ${slideParts}`,
    ).toBe(deck.slides);

    // ---- IT SURVIVES A RELOAD ---------------------------------------------
    // The exact defect: downloadable for as long as the tab lived, gone on the
    // way back. Asserted on the STORED message and on the RENDERED row.
    await page.reload({ waitUntil: "domcontentloaded" });
    frame = await openGlobalPage(page, T);
    await waitForChatApp(page, frame, GLOBAL_APP, 120_000);

    const conv = await callResolver<any>(frame, GLOBAL_APP, "getConversation", { conversationId });
    const messages: any[] = conv?.data?.messages || conv?.conversation?.messages || conv?.messages || [];
    const assistant = messages.filter((m) => m.role === "assistant").pop();
    expect(assistant, "the assistant turn was not stored at all").toBeTruthy();
    expect(
      assistant.decks?.[0]?.handle,
      `the STORED message carries no deck handle. The job row and the message row are ` +
        `written from the same builder for exactly this reason; when they disagreed, a deck ` +
        `was downloadable only until the user switched away. Stored message keys: ` +
        `${Object.keys(assistant).join(", ")}`,
    ).toBe(deck.handle);

    // And the row is actually drawn when the conversation is opened.
    await frame
      .locator(`#conversationsList .conversation-item[data-conversation-id="${conversationId}"]`)
      .click();
    const deckRow = frame.locator("#chatMessages .message.assistant .message-decks").last();
    await expect(
      deckRow,
      "the conversation reloaded without its download row — the deck is in storage and the " +
        "user has no way to reach it",
    ).toBeVisible({ timeout: 30_000 });
    await expect(deckRow).toContainText(deck.filename);

    // And the handle still answers with the SAME bytes after the reload.
    const again = await callResolver<any>(frame, GLOBAL_APP, "getDeckContent", {
      handle: deck.handle,
      deckId: deck.handle,
      conversationId,
    });
    expect(again?.success, `getDeckContent failed after a reload: ${again?.error}`).toBe(true);
    expect(
      Buffer.from(again.base64, "base64").length,
      "the deck came back a different size after a reload",
    ).toBe(bytes.length);
  } finally {
    if (frame) {
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
  }
});


/**
 * THE CEILING THE MODEL USED TO INVENT — AND THE BUDGET THAT MADE OBEYING IT
 * IMPOSSIBLE.
 *
 * TWO DEFECTS MET ON THIS ONE REQUEST, and the second was only visible because
 * the first was fixed.
 *
 * ONE: `MAX_SLIDES` is 40 and it was stated ONLY in the tool RESULT, so the
 * model never saw it — and the decision NOT to call a tool is taken from its
 * DESCRIPTION. Three live runs on v6.102.0 produced three different invented
 * limits ("works best with 5-20 slides", "idealerweise 5-10 Folien", and a
 * promise to build 45 outright). The number is interpolated into the schema
 * now, so a 45-slide ask has exactly two correct outcomes and both NAME FORTY.
 * That assertion is over the stated-ceiling SHAPE, not over the presence of the
 * string "40", because the defect returns as a sentence rather than an error.
 *
 * TWO: with the ceiling visible the model split correctly — and then could not
 * afford the split it had just been told to make. `createPresentation` was
 * `risk: "write"` unconditionally, so every call cost one of the turn's three
 * write units. Measured on v6.103.0, twice:
 *
 *     run 1 — four calls, the fourth refused
 *             `[writeGuard] refused createPresentation —
 *              {"allowWrites":true,"writesRemaining":0,...}`
 *             ZERO decks. User told: "neither file was produced".
 *     run 2 — three calls, ONE deck of 23 slides, part two never built.
 *
 * A budget is meant to bound what a turn CHANGES, and a deck that is never
 * attached changes nothing in Jira. v6.104.0 charges `createPresentation` zero
 * unless it carries an `issueKey`, and REFUNDS a pre-flight refusal that
 * declares `sideEffects: false`.
 *
 * SO THE ASSERTION IS THE DELIVERABLE, NOT THE PROSE: `decks.length === 2`.
 * A reply that describes two files while the job row carries one is the
 * narration defect wearing this feature's clothes, and it is exactly what run 2
 * produced — "Both decks follow the diconium brand" beside a single handle.
 *
 * WHY THE TOOL CALL IS RECORDED AND NOT REQUIRED ON THE CEILING SIDE: refusing
 * to build a deck nobody can use is a legitimate answer to "45 slides". What is
 * NOT acceptable is a number the app has never had, or a budget that stops the
 * remedy the app itself recommended.
 */
test("a 45-slide ask meets the REAL ceiling of 40 — and both files actually arrive", async ({
  page,
}) => {
  test.setTimeout(1_200_000);
  const T = getTarget("chatwise-global");
  const stamp = Date.now();
  const conversationId = `conv_harness_deck45_${stamp}`;
  let frame: any = null;

  try {
    frame = await openGlobalPage(page, T);
    await waitForChatApp(page, frame, GLOBAL_APP, 120_000);
    const pol: any = await callResolver(frame, GLOBAL_APP, "getToolPolicy");
    expect(pol?.policy?.allowDocuments, "allowDocuments is off — there is no deck tool to call").toBe(
      true,
    );
    await callResolver(frame, GLOBAL_APP, "createConversation", {
      conversationId,
      title: "[harness-test] deck ceiling",
      personaId: "jira-scrubber",
    });

    const t0 = Date.now();
    const result = await ask(
      frame,
      page,
      conversationId,
      "Build me a 45-slide PowerPoint deck introducing agile ceremonies to a new team. " +
        "Do not attach it to any Jira issue.",
    );
    const reply = String(result.response || "");
    const decks = Array.isArray(result.decks) ? result.decks : [];
    console.log(
      `[deck45] decks=${JSON.stringify(decks)} iterations=${result.iterations}`,
    );
    console.log(`[deck45] reply:\n${reply.slice(0, 2000)}`);
    skipIfQuotaBlocked(reply, "deck-download/45-slide ceiling");

    const lines = await logWindow(
      page,
      (ls) => ls.some((l) => l.at >= t0 && /^\[Consumer\] toolset:/.test(l.text)),
      { label: "the ceiling turn's consumer line" },
    );
    const win = lines.filter((l) => l.at >= t0);
    const calls = win.filter((l) => /^\[Tools\] createPresentation/.test(l.text));
    console.log(
      `[deck45] createPresentation calls=${calls.length}\n` +
        describeLogs(win.filter((l) => /^\[Tools\] createPresentation|^\[writeGuard\]/.test(l.text))),
    );

    // ---- THE REAL NUMBER IS IN THE ANSWER ---------------------------------
    expect(
      reply,
      "the reply never names 40 — the ONLY per-call slide ceiling this app has. Either it " +
        "silently built something smaller, or it is back to guessing.",
    ).toMatch(/\b40\b/);

    const stated = [
      ...reply.matchAll(
        /(?:max(?:imum|imal)?|limit(?:ed)?(?:\s+to)?|up to|no more than|capped? at|höchstens|maximal)\D{0,12}(\d{1,3})\s*(?:slides?|folien)/gi,
      ),
    ].map((m) => m[1]);
    expect(
      stated.filter((n) => n !== "40"),
      `the reply states a per-call slide ceiling that is not 40: ${JSON.stringify(stated)}. ` +
        `MAX_SLIDES is 40 and it is interpolated into the tool's own description, so any other ` +
        `number is invented. Reply:\n${reply.slice(0, 1500)}`,
    ).toEqual([]);

    const ranges = [...reply.matchAll(/\b(\d{1,3})\s*[-–]\s*(\d{1,3})\s*(?:slides?|folien)/gi)].map(
      (m) => m[0],
    );
    expect(
      ranges,
      `the reply recommends a slide RANGE (${JSON.stringify(ranges)}). That is the exact shape of ` +
        `the invented ceiling measured on v6.102.0 — "works best with 5-20 slides" — and the app ` +
        `has no such guidance anywhere.`,
    ).toEqual([]);

    // ---- THE BUDGET NO LONGER BITES ---------------------------------------
    // A deck with no issueKey attaches nothing, so it must cost nothing. This
    // is the assertion that would have caught both v6.103.0 runs.
    const refused = win.filter((l) => /^\[writeGuard\] refused createPresentation/.test(l.text));
    expect(
      refused.map((l) => l.text),
      `the write budget refused a deck build. A deck with no issueKey changes nothing in Jira ` +
        `and must cost zero write units — this is the v6.103.0 defect, where the model was told ` +
        `to split and then could not afford to.`,
    ).toEqual([]);

    // A REFUND IS ONLY OWED ON A CALL THAT WAS CHARGED, and this is where the
    // first version of this assertion was WRONG about the app rather than the
    // other way round. `costOf` is
    //
    //     createPresentation: (args) => (args?.issueKey ? 1 : 0)
    //
    // and `refund()` returns 0 when `cost <= 0`. So an over-ceiling deck with
    // no issueKey is refused having paid nothing, and NO `[writeGuard]
    // refunded` line is the correct outcome — printing one would mean budget
    // had been invented. Measured on v6.104.0: a `slides:<array 45>` call, no
    // refusal, no refund, and both files still delivered.
    //
    // The refund therefore only has work to do on an ATTACHED deck, which is
    // the branch `deck-refund` below reaches for.
    const overCeiling = calls.filter((l) => {
      const m = l.text.match(/slides:<array (\d+)>/);
      return m ? Number(m[1]) > 40 : false;
    });
    const charged = overCeiling.filter((l) => /issueKey:"/.test(l.text));
    const refunded = win.filter((l) => /^\[writeGuard\] refunded/.test(l.text));
    console.log(
      `[deck45] over-ceiling calls=${overCeiling.length} (charged=${charged.length}) ` +
        `refunds=${refunded.length}`,
    );
    if (charged.length) {
      expect(
        refunded.map((l) => l.text),
        `${charged.length} over-ceiling createPresentation call(s) CARRIED an issueKey, so each ` +
          `was charged a write unit — and nothing was refunded. A pre-flight refusal declares ` +
          `sideEffects:false precisely so the model is not billed for being told no.\n` +
          `${describeLogs(charged)}`,
      ).not.toEqual([]);
    }
    expect(
      refunded.length,
      `a refund was issued for a deck that cost nothing — that is budget being invented, and ` +
        `Math.min on the budget is the only thing bounding it.\n${describeLogs(refunded)}`,
    ).toBe(charged.length ? refunded.length : 0);

    // ---- THE REPLY MAY NOT PROMISE MORE FILES THAN THE ROW CARRIES -------
    //
    // THIS IS THE ASSERTION, and it took three runs to find the right one.
    // "decks.length === 2" pins ONE of several acceptable model behaviours —
    // 34+11, 23+22 and a single 40 are all defensible answers to "45 slides".
    // What is never defensible is the bubble describing files the user cannot
    // download, and that is deterministic: the handle is what the Download
    // button uses, so a part with no handle does not exist.
    //
    // MEASURED, v6.104.0, run 3 of 3 on this exact prompt. The model built
    // three decks — `slides:<array 23>`, `<array 25>`, `<array 20>` — ALL under
    // the same title, and told the user:
    //
    //     "the 45 slides came out as two downloadable files, both below this
    //      message.  Part 1 — 25 slides … Part 2 — 20 slides"
    //
    // `decks` carried ONE handle, 20 slides. The user asked for 45 and received
    // the back half of a deck with no cover, under a message saying both files
    // were there.
    //
    // THE CAUSE IS IN agent.js:970-982, not in the model. Decks are collapsed
    // by TITLE, last-write-wins, on the assumption that a repeated title is a
    // RETRY of the same deck. A SPLIT breaks that assumption: two genuinely
    // different decks share a title whenever the model does not think to
    // suffix it, and the schema says `title` is "the deck's subject". The
    // comment there already worries about the opposite direction. Two cards for
    // a retry is a smaller harm than one card for a split.
    const claimedParts = new Set(
      [...reply.matchAll(/\b(?:part|teil)\s*(\d{1,2})\b/gi)].map((m) => Number(m[1])),
    );
    const wordCount = /\b(two|zwei)\s+(?:downloadable\s+)?(?:separate\s+)?(?:files|decks|dateien)\b/i.test(
      reply,
    )
      ? 2
      : 0;
    const claimed = Math.max(claimedParts.size, wordCount, 1);
    console.log(`[deck45] reply claims ${claimed} file(s); the row carries ${decks.length}`);
    expect(
      decks.length,
      `THE REPLY PROMISES ${claimed} FILE(S) AND THE JOB ROW CARRIES ${decks.length}. The handle ` +
        `is what the Download button uses, so every part without one is a file the user was told ` +
        `about and cannot open. See this block's comment: agent.js collapses decks by TITLE, ` +
        `last-write-wins, which treats a SPLIT as a RETRY.\n` +
        `decks=${JSON.stringify(decks)}\n\nreply:\n${reply.slice(0, 1800)}`,
    ).toBeGreaterThanOrEqual(claimed);

    // ---- AND EVERY DELIVERED FILE IS A LEGAL ONE --------------------------
    expect(decks.length, "no deck was delivered at all for a 45-slide ask").toBeGreaterThan(0);
    const slideTotal = decks.reduce((n: number, d: any) => n + (Number(d?.slides) || 0), 0);
    console.log(`[deck45] slide totals: ${decks.map((d: any) => d.slides).join(" + ")} = ${slideTotal}`);
    for (const d of decks) {
      expect(
        Number(d.slides),
        `a delivered deck has ${d.slides} slides, over the ceiling of 40: ${JSON.stringify(d)}`,
      ).toBeLessThanOrEqual(40);
      expect(Number(d.slides), `a delivered deck has no slides: ${JSON.stringify(d)}`).toBeGreaterThan(0);
      expect(d.attached, "a deck was attached to Jira and the ask said not to").toBe(false);
    }
    // TWO DELIVERED FILES MUST NOT BE THE SAME FILE UNDER TWO NAMES.
    expect(
      new Set(decks.map((d: any) => d.handle)).size,
      `two entries share a handle: ${JSON.stringify(decks)}`,
    ).toBe(decks.length);

    // ---- THREE BUILDS IS THE CEILING, AND ONLY BUILDS COUNT ---------------
    // v6.105.0 caps a turn at MAX_DECKS_PER_TURN = 3 BUILT decks. v6.104.0 had
    // no counter at all — making decks free removed the only one there was, and
    // one turn made SEVEN createPresentation calls of which five produced
    // nothing.
    //
    // COUNTED FROM `decks`, NOT FROM THE LOG, and the first version of this
    // assertion got that wrong. A `[Tools] createPresentation` line is an
    // ATTEMPT; the ceiling is on BUILDS, and the log cannot tell the two apart
    // — a call whose slot names are wrong is refused by the renderer and is not
    // a build. Since v6.105.0 decks never collapse, every successful build adds
    // an entry, so `decks.length` IS the build count. Measured: five attempts
    // (42 refused over-ceiling, then 20, 21, 23, 25) with TWO on the row —
    // the 20 and the 23 failed and were re-issued. Four attempts, two builds,
    // ceiling not touched. Asserting on attempts called that a violation.
    const buildAttempts = calls.filter((l) => {
      const m = l.text.match(/slides:<array (\d+)>/);
      return m ? Number(m[1]) <= 40 : false;
    });
    console.log(
      `[deck45] attempts=${calls.length} (over-ceiling ${overCeiling.length}, ` +
        `build-shaped ${buildAttempts.length}) -> builds=${decks.length}`,
    );
    expect(
      decks.length,
      `${decks.length} decks were BUILT in one turn. MAX_DECKS_PER_TURN is 3.\n${describeLogs(calls)}`,
    ).toBeLessThanOrEqual(3);

    // THE CEILING BOUNDS BUILDS, NOT ATTEMPTS — so a model whose calls keep
    // failing can still churn, and each attempt costs ~40s of the 900s window.
    // Not an assertion (a failed render is the model's mistake, not the app's)
    // but worth saying out loud, because it is what the counter does NOT do.
    if (buildAttempts.length > decks.length + 1) {
      console.warn(
        `[deck45] CHURN: ${buildAttempts.length} build-shaped attempts produced ${decks.length} ` +
          `deck(s). MAX_DECKS_PER_TURN does not bound attempts, only builds; the iteration cap is ` +
          `the only thing that ends this.`,
      );
    }

    // IF a build was refused for the ceiling, the refusal must name it AND say
    // a new message restores the allowance — a per-turn cap that does not say
    // so reads as a permanent one.
    const ceilingRefusal = win.filter((l) => /MAX_DECKS|deck.{0,20}per turn|three decks/i.test(l.text));
    if (ceilingRefusal.length || /deck limit|three decks|3 decks/i.test(reply)) {
      expect(
        reply,
        `the reply mentions hitting the deck ceiling but does not name 3:\n${reply.slice(0, 1200)}`,
      ).toMatch(/\b3\b|three/i);
      expect(
        reply,
        `the deck-ceiling refusal does not tell the user a NEW MESSAGE restores the allowance:\n${reply.slice(0, 1200)}`,
      ).toMatch(/new message|next message|another message|send.{0,20}again/i);
    }

    // ---- AND THE LOG LINE IS A SHAPE, NOT A PAYLOAD -----------------------
    // v6.103.0 printed the whole deck: forty slides of the user's own text into
    // `forge logs`, which is billed, stored, read by a different audience, and
    // pushes the one line an operator needs out of a window that already
    // truncates silently at ~30 lines.
    for (const l of calls) {
      expect(
        l.text.length,
        `a [Tools] createPresentation log line is ${l.text.length} chars. LOG_LINE_MAX is 500 and ` +
          `nothing may recurse into the slide array.\n${l.text.slice(0, 300)}…`,
      ).toBeLessThanOrEqual(560); // 500 + the "[Tools] createPresentation " prefix and the user suffix
      expect(
        l.text,
        `the [Tools] log line contains slide CONTENT rather than a shape:\n${l.text.slice(0, 300)}`,
      ).toMatch(/slides:<array \d+>|slides:<\d+ chars>/);
    }
  } finally {
    if (frame) {
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
  }
});
