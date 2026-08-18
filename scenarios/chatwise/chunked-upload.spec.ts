// LIVE: a file too big for a single invoke reaches the model intact.
//
// WHAT THIS PROVES THAT THE OLD SPEC DOES NOT
// -------------------------------------------
// file-extraction.spec.ts uploads through the one-shot path, which physically
// cannot carry more than ~370 KB: a front-end invoke REQUEST is capped at
// 500 KB and base64 inflates by 4/3. That cap is the actual reason the bug was
// reported as "I could only upload text files like JSON, like xlsx" — those
// are simply the files small enough to fit. A spec that only ever uploads a
// 2 KB PDF would have stayed green through the entire outage.
//
// So this drives the CHUNKED transport end to end against the deployed app,
// with a file several times over the invoke ceiling, and then reads back the
// stored text rather than trusting a success flag.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver } from "./chatwise-support";

/** 176 KiB raw → ~234 KiB base64, matching src/shared/files/fileTypes.js. */
const CHUNK_BYTES = 180_224;

/**
 * A text file well over the one-shot ceiling, carrying a canary the model
 * could not possibly know otherwise, plus filler so the size is real.
 */
function makeBigText(canary: string, bytes: number): Buffer {
  const head = `PROJECT BRIEF\n\nThe internal codename for this programme is ${canary}.\n\n`;
  const filler =
    "This paragraph exists only to make the document large enough that it cannot " +
    "travel in a single Forge invoke, which is the condition under test.\n";
  let body = head;
  while (Buffer.byteLength(body) < bytes) body += filler;
  return Buffer.from(body);
}

test("a file over the invoke ceiling uploads in chunks and reaches the model", async ({ page, context }) => {
  test.setTimeout(900_000);

  const T = getTarget("chatwise-global");
  const conversationId = `conv_harness_chunk_${Date.now()}`;
  let frame: Awaited<ReturnType<typeof openGlobalPage>> | null = null;

  try {
    frame = await openGlobalPage(page, T);
    await waitForChatApp(page, frame, GLOBAL_APP);
    await callResolver(frame!, GLOBAL_APP, "createConversation", {
      conversationId,
      title: "[harness-test] chunked upload",
      personaId: "coffee-break-ai",
    });

    const canary = `ZARQUON${Date.now()}`;
    // ~1.2 MB — over three times the ~370 KB a single invoke can carry, so a
    // regression to the one-shot path fails here rather than passing quietly.
    const buf = makeBigText(canary, 1_200_000);
    const uploadId = `up_harness_${Date.now().toString(36)}`;
    const total = Math.ceil(buf.length / CHUNK_BYTES);
    console.log(`file ${buf.length} bytes → ${total} chunks`);
    expect(total, "the fixture must exceed one chunk or this tests nothing").toBeGreaterThan(4);

    // --- begin ---------------------------------------------------------
    const begun = await callResolver<any>(frame!, GLOBAL_APP, "beginChatFileUpload", {
      conversationId,
      uploadId,
      filename: "brief.txt",
      mimeType: "text/plain",
      size: buf.length,
    });
    expect(begun?.success, `begin failed: ${begun?.error}`).toBeTruthy();
    expect(begun.totalChunks).toBe(total);

    // --- put × N -------------------------------------------------------
    for (let i = 0; i < total; i++) {
      const slice = buf.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES);
      const put = await callResolver<any>(frame!, GLOBAL_APP, "putChatFileChunk", {
        uploadId,
        index: i,
        base64: slice.toString("base64"),
      });
      expect(put?.success, `chunk ${i} failed: ${put?.error}`).toBeTruthy();
    }

    // A missing chunk must be caught BEFORE the queue, with a message naming
    // the problem — not as a chip that spins and then fails opaquely.
    const shortId = `up_harness_short_${Date.now().toString(36)}`;
    await callResolver(frame!, GLOBAL_APP, "beginChatFileUpload", {
      conversationId,
      uploadId: shortId,
      filename: "short.txt",
      mimeType: "text/plain",
      size: CHUNK_BYTES * 3,
    });
    await callResolver(frame!, GLOBAL_APP, "putChatFileChunk", {
      uploadId: shortId,
      index: 0,
      base64: Buffer.alloc(CHUNK_BYTES).toString("base64"),
    });
    const short = await callResolver<any>(frame!, GLOBAL_APP, "finishChatFileUpload", {
      uploadId: shortId,
    });
    expect(short?.success, "an incomplete upload must not be queued").toBeFalsy();
    expect(short?.error).toMatch(/never arrived/i);
    await callResolver(frame!, GLOBAL_APP, "cancelChatFileUpload", { uploadId: shortId });

    // --- finish + poll --------------------------------------------------
    const finished = await callResolver<any>(frame!, GLOBAL_APP, "finishChatFileUpload", {
      uploadId,
    });
    expect(finished?.success, `finish failed: ${finished?.error}`).toBeTruthy();

    let status: any = null;
    const deadline = Date.now() + 300_000;
    while (Date.now() < deadline) {
      status = await callResolver<any>(frame!, GLOBAL_APP, "getChatFileStatus", { uploadId });
      if (status?.status === "ready" || status?.status === "failed") break;
      await page.waitForTimeout(2000);
    }
    console.log("status:", JSON.stringify(status));
    expect(status?.status, `extraction did not finish: ${status?.error}`).toBe("ready");

    // --- the file is really stored, with real text ----------------------
    // A green status is not evidence. This reads the conversation's own file
    // list, which is what the prompt builder reads.
    const files = await callResolver<any>(frame!, GLOBAL_APP, "getChatFiles", { conversationId });
    const stored = (files?.files || []).find((f: any) => f.filename === "brief.txt");
    expect(stored, "the file never landed in the conversation").toBeTruthy();
    expect(stored.chars, "stored with no text").toBeGreaterThan(1000);

    // --- and the MODEL can actually use it ------------------------------
    // The end of the chain. Everything above could pass with the text stored
    // somewhere the prompt builder never looks.
    const sent = await callResolver<any>(frame!, GLOBAL_APP, "chat", {
      conversationId,
      message:
        "Read the attached brief and reply with ONLY the internal codename for the programme. " +
        "No other words.",
      personaId: "coffee-break-ai",
      personaLocked: true,
    });
    expect(sent?.success, `enqueue failed: ${sent?.error}`).toBeTruthy();

    let job: any = null;
    const jobDeadline = Date.now() + 300_000;
    while (Date.now() < jobDeadline) {
      const r = await callResolver<any>(frame!, GLOBAL_APP, "getJobStatus", { jobId: sent.jobId });
      job = r?.data ?? null;
      if (job && ["completed", "failed", "cancelled"].includes(job.status)) break;
      await page.waitForTimeout(3000);
    }
    expect(job?.status, `job did not complete: ${job?.error}`).toBe("completed");
    const reply = String(job.result?.response || "");
    console.log("reply:", reply.slice(0, 200));
    expect(
      reply,
      "the model could not read a file it was told it had — the text never reached the prompt",
    ).toContain(canary);

    // --- cancelling frees the chunk rows --------------------------------
    const cancelId = `up_harness_cancel_${Date.now().toString(36)}`;
    await callResolver(frame!, GLOBAL_APP, "beginChatFileUpload", {
      conversationId,
      uploadId: cancelId,
      filename: "abandoned.txt",
      mimeType: "text/plain",
      size: CHUNK_BYTES * 2,
    });
    await callResolver(frame!, GLOBAL_APP, "putChatFileChunk", {
      uploadId: cancelId,
      index: 0,
      base64: Buffer.alloc(CHUNK_BYTES).toString("base64"),
    });
    await callResolver(frame!, GLOBAL_APP, "cancelChatFileUpload", { uploadId: cancelId });
    const gone = await callResolver<any>(frame!, GLOBAL_APP, "getChatFileStatus", {
      uploadId: cancelId,
    });
    // A dismissed chip must not leave megabytes of chunk rows waiting on a TTL.
    expect(gone?.success, "a cancelled upload is still readable").toBeFalsy();
  } finally {
    if (frame) {
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
  }
});
