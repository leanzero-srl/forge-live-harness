// JOURNEY: files through the REAL upload UI on the global page.
//
// Every existing upload spec called the resolvers directly — which proves the
// transport and the extractors, and proves nothing about the paperclip, the
// chips, the inline error line, or the browser-side OCR hop that runs INSIDE
// AttachmentController before any resolver is called. This drives the actual
// <input type=file>, which is the one entry point `accept=` actually filters,
// and reads every assertion off the chips row or the backend list.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  GLOBAL_APP, awaitSwapSettled, callResolver, openGlobalPage, readAppState,
  settleBootSelection, waitForChatApp,
} from "./chatwise-support";

const T = getTarget("chatwise-global");

test.describe.configure({ timeout: 420_000 });

test("uploads journey: paperclip, chips, rejection line, image OCR, remove", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved — run `npm run discover`.");

  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);
  await frame.locator("#newChatButton").click();
  await awaitSwapSettled(frame);
  await frame.locator("#welcomeMessage .welcome-prompt").first().waitFor({ timeout: 15_000 });

  let conversationId: string | null = null;
  try {
    // ---- A small text file through the real picker ------------------------
    // setInputFiles on the hidden input is exactly what the paperclip does.
    const stamp = Date.now();
    await frame.locator("#attachFileInput").setInputFiles({
      name: `journey-${stamp}.md`,
      mimeType: "text/markdown",
      buffer: Buffer.from(`# Journey upload\n\nThe canary word is XYLOPHONE-${stamp}.\n`),
    });

    const chip = frame.locator(`#attachmentRow .attachment-chip[data-filename="journey-${stamp}.md"]`);
    await expect(chip, "no done-chip appeared for the uploaded file").toBeVisible({ timeout: 60_000 });
    await expect(chip.locator(".chip-meta"), "the chip shows no char count").toContainText("chars");
    // THE REGRESSION the user saw live: the temp "processing…" chip was never
    // retired on success (and carried a pending: key this selector could not
    // see), so the done chip appeared NEXT TO a stuck spinner.
    await expect(chip, "duplicate chips for one file").toHaveCount(1);
    await expect(chip, "still marked uploading after processing").not.toHaveClass(/uploading/);
    expect(
      await frame.locator("#attachmentRow .attachment-chip.uploading").count(),
      "a processing chip outlived its upload",
    ).toBe(0);

    conversationId = (await readAppState<string | null>(
      frame, GLOBAL_APP, "app.getActiveConversationId()",
    )) as string | null;
    expect(conversationId, "the upload did not auto-create a conversation").toBeTruthy();

    // ...and the backend really holds the text (a green chip is not evidence).
    const files = await callResolver<any>(frame, GLOBAL_APP, "getChatFiles", { conversationId });
    const stored = (files?.files || []).find((f: any) => f.filename === `journey-${stamp}.md`);
    expect(stored, "the file is not in the conversation's list").toBeTruthy();
    expect(stored.chars, "stored with no text").toBeGreaterThan(30);

    // ---- A rejected type: inline error line, no chip, nothing stored -------
    await frame.locator("#attachFileInput").setInputFiles({
      name: "movie.mov",
      mimeType: "video/quicktime",
      buffer: Buffer.from("not really a movie"),
    });
    const errLine = frame.locator("#attachmentError");
    await expect(errLine, "the rejection was silent").toBeVisible({ timeout: 10_000 });
    await expect(errLine).toContainText("movie.mov");
    expect(
      await frame.locator('#attachmentRow .attachment-chip[data-filename*="movie"]').count(),
      "a rejected file still produced a chip",
    ).toBe(0);

    // ---- An IMAGE through the same picker: OCR runs in the browser ---------
    // The PNG is rendered here with the browser's own antialiased font — a
    // hand-built bitmap font is what OCR is worst at, and would measure the
    // fixture rather than the feature.
    const phrase = `OCR JOURNEY ${String(stamp).slice(-6)}`;
    const pngBase64: string = await frame.locator("body").evaluate(async (_el, text) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1200; canvas.height = 200;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 1200, 200);
      ctx.fillStyle = "#000"; ctx.font = "600 72px Helvetica, Arial, sans-serif";
      ctx.textBaseline = "middle"; ctx.fillText(text, 40, 100);
      const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), "image/png"));
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = ""; for (const b of buf) s += String.fromCharCode(b);
      return btoa(s);
    }, phrase);

    await frame.locator("#attachFileInput").setInputFiles({
      name: `shot-${stamp}.png`,
      mimeType: "image/png",
      buffer: Buffer.from(pngBase64, "base64"),
    });
    const imgChip = frame.locator(`#attachmentRow .attachment-chip[data-filename="shot-${stamp}.png"]`);
    // OCR pays worker start-up (~11 MB of language data) on the first image.
    await expect(imgChip, "the image chip never settled").toBeVisible({ timeout: 180_000 });

    // The OCR text reached the BACKEND through the real path — not the spike
    // hook, the actual AttachmentController → uploadChatFile hop.
    await expect
      .poll(async () => {
        const r = await callResolver<any>(frame, GLOBAL_APP, "getChatFiles", { conversationId });
        const f = (r?.files || []).find((x: any) => x.filename === `shot-${stamp}.png`);
        return f ? { kind: f.kind, chars: f.chars } : null;
      }, { timeout: 60_000 })
      .toEqual(expect.objectContaining({ kind: "image" }));
    const r2 = await callResolver<any>(frame, GLOBAL_APP, "getChatFiles", { conversationId });
    const img = (r2?.files || []).find((x: any) => x.filename === `shot-${stamp}.png`);
    // The OCR'd text (with its transcription label) is far longer than the
    // honest placeholder — chars is the discriminator between "read" and
    // "not readable".
    expect(img.chars, "the image stored no OCR text — the browser hop did not run").toBeGreaterThan(60);
    // The image path retires its processing chip too — same regression.
    await expect(imgChip, "duplicate chips for the image").toHaveCount(1, { timeout: 30_000 });
    await expect(imgChip, "image chip stuck on processing").not.toHaveClass(/uploading/, { timeout: 30_000 });

    // ---- DRAG AND DROP, against the DEPLOYED page --------------------------
    // The handler contract lives in the offline stub; what only THIS can prove
    // is the wiring: the listeners are really attached to the deployed body,
    // the overlay really exists in the shipped markup, and a dropped file
    // really reaches the same upload path as the paperclip. The DataTransfer
    // is synthesised in-frame — Playwright cannot start an OS drag — shaped
    // exactly as a browser would shape it.
    const dropName = `dropped-${stamp}.md`;
    const overlayStates = await frame.locator("body").evaluate(async (body, name) => {
      const mk = (type: string, dt: unknown) => {
        const ev = new DragEvent(type, { bubbles: true, cancelable: true });
        Object.defineProperty(ev, "dataTransfer", { value: dt });
        body.dispatchEvent(ev);
      };
      const file = new File(
        [`# Dropped\n\nThis file arrived by drag and drop, not the paperclip.`],
        name,
        { type: "text/markdown" },
      );
      const dt = {
        types: ["Files"],
        items: [{ kind: "file", type: file.type, webkitGetAsEntry: () => null }],
        files: [file],
        dropEffect: "none",
      };
      const overlay = () =>
        document.getElementById("dropOverlay")?.classList.contains("visible") === true;
      mk("dragenter", dt);
      const during = overlay();
      mk("dragover", dt);
      mk("drop", dt);
      const after = overlay();
      return { during, after };
    }, dropName);
    expect(overlayStates.during, "the drop overlay never lit up on dragenter").toBe(true);
    expect(overlayStates.after, "the overlay stayed lit after the drop").toBe(false);

    const dropChip = frame.locator(`#attachmentRow .attachment-chip[data-filename="${dropName}"]`);
    await expect(dropChip, "the dropped file produced no chip").toBeVisible({ timeout: 60_000 });
    await expect
      .poll(async () => {
        const r = await callResolver<any>(frame, GLOBAL_APP, "getChatFiles", { conversationId });
        return (r?.files || []).some((f: any) => f.filename === dropName);
      }, { timeout: 30_000 })
      .toBe(true);

    // ---- PASTE, same wiring ------------------------------------------------
    const pasteName = `pasted-${stamp}.txt`;
    await frame.locator("#chatInput").evaluate((input, name) => {
      const dt = new DataTransfer();
      dt.items.add(new File(["Pasted straight into the composer."], name, { type: "text/plain" }));
      input.dispatchEvent(
        new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }),
      );
    }, pasteName);
    await expect(
      frame.locator(`#attachmentRow .attachment-chip[data-filename="${pasteName}"]`),
      "the pasted file produced no chip",
    ).toBeVisible({ timeout: 60_000 });

    // ---- Remove a chip through its own ✕ ----------------------------------
    await chip.hover();
    await chip.locator(".chip-remove").click();
    await expect(chip).toHaveCount(0, { timeout: 15_000 });
    const after = await callResolver<any>(frame, GLOBAL_APP, "getChatFiles", { conversationId });
    expect(
      (after?.files || []).some((f: any) => f.filename === `journey-${stamp}.md`),
      "the removed file is still attached server-side",
    ).toBe(false);
  } finally {
    if (conversationId) {
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
  }
});
