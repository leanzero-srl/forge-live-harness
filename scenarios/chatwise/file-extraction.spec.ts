// LIVE REGRESSION: file extraction, inside the real Forge bundle.
//
// WHY THIS CANNOT BE A UNIT TEST
// ------------------------------
// The PDF bug was never a logic bug. unpdf resolves PDF.js with a DYNAMIC
// import of a subpath that is exported only under the `import` condition, and
// the Forge backend bundler is webpack targeting node with CommonJS output. In
// plain `node` the library works perfectly — it is only inside the bundle that
// it fails, with "Serverless PDF.js bundle could not be resolved", which reads
// to a user like a corrupt PDF rather than a build problem.
//
// So the only test that means anything is one that runs against the DEPLOYED
// app. If this passes, the static import survived the bundler.
//
// PPTX is deliberately NOT covered here: its extractor was never broken, only
// unreachable because the picker's accept string filtered it out. That is a
// frontend reachability problem, so it belongs with the picker/drop-zone work
// rather than in a backend extraction spec.
import { test, expect } from "@playwright/test";
import { launchHarnessContext } from "../../forge/browser";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver } from "./chatwise-support";

/** A minimal, valid, text-bearing PDF built inline so the assertion is exact. */
function makePdf(canary: string): Buffer {
  const content = Buffer.from(`BT /F1 18 Tf 72 700 Td (${canary}) Tj ET`);
  const objs = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    ),
    Buffer.concat([
      Buffer.from(`<< /Length ${content.length} >>\nstream\n`),
      content,
      Buffer.from("\nendstream"),
    ]),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
  ];
  let buf = Buffer.from("%PDF-1.4\n");
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(buf.length);
    buf = Buffer.concat([buf, Buffer.from(`${i + 1} 0 obj\n`), o, Buffer.from("\nendobj\n")]);
  });
  const xref = buf.length;
  let tail = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) tail += `${String(off).padStart(10, "0")} 00000 n \n`;
  tail += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.concat([buf, Buffer.from(tail)]);
}

test("PDF extraction works inside the deployed Forge bundle", async () => {
  test.setTimeout(600_000);

  const T = getTarget("chatwise-global");
  const context = await launchHarnessContext({});
  const page = context.pages()[0] ?? (await context.newPage());
  const conversationId = `conv_harness_files_${Date.now()}`;
  let frame: Awaited<ReturnType<typeof openGlobalPage>> | null = null;

  const upload = (filename: string, mimeType: string, buf: Buffer) =>
    callResolver<any>(frame!, GLOBAL_APP, "uploadChatFile", {
      conversationId,
      filename,
      mimeType,
      base64: buf.toString("base64"),
    });

  try {
    frame = await openGlobalPage(page, T);
    await waitForChatApp(page, frame, GLOBAL_APP);
    await callResolver(frame!, GLOBAL_APP, "createConversation", {
      conversationId,
      title: "[harness-test] file extraction",
      personaId: "coffee-break-ai",
    });

    // --- PDF: the one that could only ever fail inside the bundle -----------
    const canary = `CANARY${Date.now()}`;
    const pdf = await upload("probe.pdf", "application/pdf", makePdf(canary));
    console.log("pdf ->", JSON.stringify(pdf).slice(0, 300));
    expect(
      pdf?.success,
      `PDF upload failed: ${pdf?.error} — if this says "Serverless PDF.js bundle could not be ` +
        `resolved", the static import did not survive the bundler`,
    ).toBeTruthy();
    expect(pdf.kind).toBe("pdf");
    expect(pdf.chars, "PDF produced no text").toBeGreaterThan(0);

    // Prove it is OUR text, not an empty success.
    const files = await callResolver<any>(frame!, GLOBAL_APP, "getChatFiles", { conversationId });
    const stored = (files?.files || []).find((f: any) => f.filename === "probe.pdf");
    expect(stored, "PDF missing from the conversation's file list").toBeTruthy();
    expect(stored.chars).toBeGreaterThan(0);

    // --- Images: accepted, with an honest placeholder, not an error ---------
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const img = await upload("shot.png", "image/png", png);
    console.log("png ->", JSON.stringify(img).slice(0, 240));
    expect(img?.success, `image was refused: ${img?.error}`).toBeTruthy();
    expect(img.kind).toBe("image");

    // --- A format we cannot decode is refused with a USEFUL message ---------
    const heic = await upload("photo.heic", "image/heic", png);
    expect(heic?.success).toBeFalsy();
    expect(heic?.error, "unhelpful refusal for an undecodable image").toMatch(/PNG or JPEG/i);
  } finally {
    if (frame) {
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
    await context.close();
  }
});
