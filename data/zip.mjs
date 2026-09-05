// A ZIP CENTRAL-DIRECTORY READER, in thirty lines and with no dependency.
//
// A .pptx is a zip. "The download works" is not "the file is a presentation" —
// a truncated body, a base64 round trip that dropped bytes, or a renderer that
// wrote slide XML without registering it in ppt/presentation.xml all produce
// something a browser will happily save and PowerPoint will refuse or, worse,
// open with slides missing. So the harness opens the container itself.
//
// Reading the CENTRAL DIRECTORY rather than scanning for local headers is the
// point: the central directory is what a zip reader actually trusts, it is
// where the authoritative entry list lives, and a file whose local headers and
// central directory disagree is exactly the corruption worth catching.
//
// Deliberately NOT shelling out to `unzip`: a spec that depends on a system
// binary fails differently on a machine that does not have one, and the failure
// looks like the product.
import { inflateRawSync } from "node:zlib";

/** @returns {{names: string[], count: number}} every entry name in the archive. */
export function zipEntries(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length < 22) throw new Error(`not a zip: only ${buf.length} bytes`);
  if (buf.readUInt32LE(0) !== 0x04034b50) {
    throw new Error(
      `not a zip: the first four bytes are ${buf.subarray(0, 4).toString("hex")}, not a PK local header`,
    );
  }

  // End of central directory, searched backwards — the comment field means it
  // is not at a fixed offset.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip: no end-of-central-directory record");

  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const names = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`central directory entry ${i} has a bad signature`);
    }
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    names.push(buf.toString("utf8", offset + 46, offset + 46 + nameLen));
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return { names, count };
}

/** How many slide parts the archive actually contains. */
export function slideFileCount(names) {
  return names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length;
}

/**
 * Read ONE entry out of the archive as text.
 *
 * The part is STORED or DEFLATED depending on the writer, so both are handled:
 * a reader that only understood one would report a product failure the day the
 * renderer's compression level changed.
 */
export function readEntryText(buffer, name) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  let offset = 0;
  while (offset < buf.length - 4 && buf.readUInt32LE(offset) === 0x04034b50) {
    const method = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const entry = buf.toString("utf8", offset + 30, offset + 30 + nameLen);
    const dataAt = offset + 30 + nameLen + extraLen;
    if (entry === name) {
      const raw = buf.subarray(dataAt, dataAt + compSize);
      return method === 0 ? raw.toString("utf8") : inflateRawSync(raw).toString("utf8");
    }
    offset = dataAt + compSize;
  }
  throw new Error(`${name} could not be read out of the archive`);
}
