// Drag-and-drop, paste, and the shared upload gate — verified in a browser.
//
// Runs against BOTH chat surfaces. The issue panel had no upload UI at all
// before this work, so "it works on the global page" proves nothing about it.
//
// DataTransfer is synthesised in-page rather than driven with real mouse
// events, because Playwright cannot start an OS-level file drag. What matters
// here is the handler contract — depth counting, dropEffect, folder and
// wrong-shape rejection, the file cap — and that is exactly what a synthetic
// DataTransfer exercises.
import { test, expect, Page } from "@playwright/test";
import { buildStub, Surface } from "./_stub/build";

let PAGES: Record<Surface, string>;
test.beforeAll(() => {
  PAGES = buildStub();
});

/**
 * Mount the drop zone over a recording controller.
 *
 * The AttachmentController is NOT stubbed out wholesale — handleFiles is what
 * enforces type, size and the file cap for every entry point, so replacing it
 * would leave the actual gate untested. Only the resolver call is stubbed.
 */
async function mount(page: Page, url: string) {
  await page.goto(url);
  await page.evaluate(() => {
    const w = window as any;
    w.uploaded = [];
    w.rejected = [];
    w.ctl = new w.CW.AttachmentController({
      forgeAPI: {
        call: async (name: string, args: any) => {
          if (name === "uploadChatFile") {
            w.uploaded.push(args.filename);
            return { success: true };
          }
          if (name === "getChatFiles") return { success: true, files: [] };
          return { success: true };
        },
      },
      getConversationId: () => "conv_test",
    });
    w.ctl.setup();
    const origShow = w.ctl.showError.bind(w.ctl);
    w.ctl.showError = (m: string) => {
      w.rejected.push(m);
      origShow(m);
    };
    w.zone = new w.CW.DropZone({
      onFiles: (f: File[]) => w.ctl.handleFiles(f),
      onReject: (m: string) => w.ctl.showError(m),
    });
    w.zone.attach();
  });
}

/**
 * Fire a drag event carrying a CONTROLLED DataTransfer.
 *
 * A real `new DataTransfer()` is not usable here: outside a genuine OS drag
 * Chromium ignores writes to `dropEffect` (it reads back "none") and will not
 * let webkitGetAsEntry be defined on its items — so two of the behaviours that
 * matter most would be untestable, and the "image dragged from another tab"
 * case (types contains Files, files is empty) cannot be built at all.
 *
 * A plain object shaped like a DataTransfer, shadowed onto the event, exercises
 * exactly the handler contract under test and records what the handler wrote.
 */
async function fire(
  page: Page,
  type: string,
  files: Array<{ name: string; size?: number; type?: string }> = [],
  opts: { folder?: boolean; filesInTypesButNone?: boolean; noFiles?: boolean } = {},
) {
  return page.evaluate(
    ({ type, files, opts }) => {
      const built = files.map(
        (f) => new File([new Uint8Array(f.size ?? 8)], f.name, { type: f.type ?? "text/plain" }),
      );
      const items = built.map((f) => ({
        kind: "file",
        type: f.type,
        webkitGetAsEntry: () => ({ isDirectory: !!opts.folder }),
      }));
      const types: string[] = [];
      if (built.length || opts.filesInTypesButNone) types.push("Files");
      if (opts.noFiles) types.push("text/uri-list");

      const dt: any = {
        types,
        items,
        files: opts.filesInTypesButNone ? [] : built,
        _dropEffect: "none",
        get dropEffect() {
          return this._dropEffect;
        },
        set dropEffect(v: string) {
          this._dropEffect = v;
        },
      };
      const ev = new DragEvent(type, { bubbles: true, cancelable: true });
      Object.defineProperty(ev, "dataTransfer", { value: dt });
      document.body.dispatchEvent(ev);
      return { defaultPrevented: ev.defaultPrevented, dropEffect: dt.dropEffect };
    },
    { type, files, opts },
  );
}

const active = (page: Page) =>
  page.evaluate(() => ({
    wrapper: !!document.getElementById("chatInputWrapper")?.classList.contains("drag-over"),
    overlay: !!document.getElementById("dropOverlay")?.classList.contains("visible"),
  }));

for (const surface of ["globalPage", "issuePanel"] as Surface[]) {
  test.describe(surface, () => {
    test("the composer lights up on a file drag and settles on drop", async ({ page }) => {
      await mount(page, PAGES[surface]);
      expect(await active(page)).toEqual({ wrapper: false, overlay: false });

      await fire(page, "dragenter", [{ name: "a.txt" }]);
      expect(await active(page), "the composer must show it is a target").toEqual({
        wrapper: true,
        overlay: true,
      });

      await fire(page, "drop", [{ name: "a.txt" }]);
      expect(await active(page), "and must settle after the drop").toEqual({
        wrapper: false,
        overlay: false,
      });
    });

    test("crossing a child node does not strobe the highlight", async ({ page }) => {
      await mount(page, PAGES[surface]);
      // THE DEPTH COUNTER. dragleave fires every time the cursor crosses into
      // a child, so toggling on the raw events flickers the highlight off and
      // on continuously as the user moves across the composer.
      await fire(page, "dragenter", [{ name: "a.txt" }]);
      await fire(page, "dragenter", [{ name: "a.txt" }]); // into a child
      await fire(page, "dragleave", [{ name: "a.txt" }]); // out of the child
      expect((await active(page)).wrapper, "still over the page — stay lit").toBe(true);
      await fire(page, "dragleave", [{ name: "a.txt" }]); // out of the document
      expect((await active(page)).wrapper).toBe(false);
    });

    test("dragover sets dropEffect, or the browser refuses the drop", async ({ page }) => {
      await mount(page, PAGES[surface]);
      const r = await fire(page, "dragover", [{ name: "a.txt" }]);
      expect(r.defaultPrevented, "dragover must preventDefault").toBe(true);
      // Without dropEffect = "copy" the cursor shows no-entry and the drop
      // never fires, which reads as a dead feature.
      expect(r.dropEffect).toBe("copy");
    });

    test("dragging selected text is ignored", async ({ page }) => {
      await mount(page, PAGES[surface]);
      // Selecting text and dragging it fires identical events. Lighting the
      // composer up for that is noise.
      await fire(page, "dragenter", [], { noFiles: true });
      expect((await active(page)).wrapper).toBe(false);
    });

    test("a stray drop never navigates the iframe away", async ({ page }) => {
      await mount(page, PAGES[surface]);
      // Without a window-level preventDefault, a near-miss navigates the
      // Custom UI iframe to file://… and the app vanishes with no error.
      const prevented = await page.evaluate(() => {
        const dt = new DataTransfer();
        const ev = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt });
        window.dispatchEvent(ev);
        return ev.defaultPrevented;
      });
      expect(prevented).toBe(true);
    });

    test("a dropped file reaches the upload path", async ({ page }) => {
      await mount(page, PAGES[surface]);
      await fire(page, "drop", [{ name: "notes.md" }]);
      await expect
        .poll(() => page.evaluate(() => (window as any).uploaded))
        .toEqual(["notes.md"]);
    });

    test("wrong types are refused before any round trip", async ({ page }) => {
      await mount(page, PAGES[surface]);
      await fire(page, "drop", [{ name: "clip.mov", type: "video/quicktime" }]);
      // `accept` filters only the OS picker — it does nothing for a dropped
      // file, so this check is the one that actually holds here.
      await expect.poll(() => page.evaluate(() => (window as any).uploaded)).toEqual([]);
      const msgs = await page.evaluate(() => (window as any).rejected);
      expect(msgs.join(" ")).toContain("clip.mov");
    });

    test("folders are refused, not recursed", async ({ page }) => {
      await mount(page, PAGES[surface]);
      await fire(page, "drop", [{ name: "my-folder", size: 0, type: "" }], { folder: true });
      await expect.poll(() => page.evaluate(() => (window as any).uploaded)).toEqual([]);
      expect((await page.evaluate(() => (window as any).rejected)).join(" ")).toMatch(/folder/i);
    });

    test("an image dragged from another tab says so instead of going quiet", async ({ page }) => {
      await mount(page, PAGES[surface]);
      await fire(page, "drop", [], { filesInTypesButNone: true });
      const msgs = await page.evaluate(() => (window as any).rejected);
      // There is no File to read in this case and no retry will produce one,
      // so silence would read as a broken feature.
      expect(msgs.join(" ")).toMatch(/drag it from your computer|paperclip/i);
    });

    test("the file cap matches what the backend actually keeps", async ({ page }) => {
      await mount(page, PAGES[surface]);
      await fire(
        page,
        "drop",
        Array.from({ length: 8 }, (_, i) => ({ name: `f${i}.txt` })),
      );
      // The backend trims to the newest 5 and drops the rest silently; a UI
      // that accepted 8 would show five successes and three vanishings.
      await expect
        .poll(() => page.evaluate(() => (window as any).uploaded.length))
        .toBe(5);
      expect((await page.evaluate(() => (window as any).rejected)).join(" ")).toMatch(/5 files/i);
    });

    test("pasting a file uploads it", async ({ page }) => {
      await mount(page, PAGES[surface]);
      await page.evaluate(() => {
        const dt = new DataTransfer();
        dt.items.add(new File([new Blob(["x"])], "screenshot.png", { type: "image/png" }));
        document
          .getElementById("chatInput")!
          .dispatchEvent(
            new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }),
          );
      });
      // Pasting a screenshot is the single most common way an image reaches a
      // chat box.
      await expect
        .poll(() => page.evaluate(() => (window as any).uploaded))
        .toEqual(["screenshot.png"]);
    });

    test("pasting plain text is left alone", async ({ page }) => {
      await mount(page, PAGES[surface]);
      const prevented = await page.evaluate(() => {
        const dt = new DataTransfer();
        dt.setData("text/plain", "hello");
        const ev = new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: dt,
        });
        document.getElementById("chatInput")!.dispatchEvent(ev);
        return ev.defaultPrevented;
      });
      expect(prevented, "a normal paste must still insert text").toBe(false);
    });

    test("the accept list is rewritten from the shared table at boot", async ({ page }) => {
      await mount(page, PAGES[surface]);
      const accept = await page.evaluate(
        () => (document.getElementById("attachFileInput") as HTMLInputElement).accept,
      );
      // AttachmentController.setup() overwrites `accept` from fileTypes.js, so
      // the markup can never drift from what the backend actually reads. The
      // value in index.html is only a pre-boot fallback.
      expect(accept).toContain(".pptx");
      expect(accept).toContain(".png");
      expect(accept, ".doc has no extractor — offering it guarantees an error chip").not.toContain(
        ".doc,",
      );

      const overlayTypes = await page.evaluate(
        () => document.getElementById("dropOverlayTypes")?.textContent,
      );
      // Written by the app, not by the markup, for the same reason. Empty here
      // because the stub mounts the controller without the host app's boot.
      expect(overlayTypes).toBe("");
    });

    test("the error line and chip row are announced to a screen reader", async ({ page }) => {
      await mount(page, PAGES[surface]);
      const a11y = await page.evaluate(() => ({
        err: document.getElementById("attachmentError")?.getAttribute("aria-live"),
        row: document.getElementById("attachmentRow")?.getAttribute("aria-live"),
        overlay: document.getElementById("dropOverlay")?.getAttribute("aria-hidden"),
      }));
      // Upload failures were completely silent to a screen reader before this.
      expect(a11y.err).toBe("polite");
      expect(a11y.row).toBe("polite");
      // Drag-and-drop is pointer-only; the paperclip is the keyboard path.
      expect(a11y.overlay).toBe("true");
    });
  });
}
