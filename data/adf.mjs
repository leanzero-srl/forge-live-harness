// ADF helpers for Forge-macro insertion + deterministic content hashing.
// The node shapes mirror Sentinel Vault's PROVEN src/server/infra/doc-surgery.js
// (which auto-inserts these in production), so pure-REST insertion renders with no
// editor round-trip. canonicalizeAdf/hashAdf are ported from the same file for the
// deterministic section-restore wait.

export function ariToUuid(s) {
  const m = String(s).match(/app\/([0-9a-fA-F-]{36})/);
  return m ? m[1] : s;
}

/** Inline Forge macro → type:"extension". */
export function buildExtensionNode(appId, envId, moduleKey, { title = "App", params = {} } = {}) {
  const uuid = ariToUuid(appId);
  const extensionKey = `${uuid}/${envId}/static/${moduleKey}`;
  const extensionId = `ari:cloud:ecosystem::extension/${uuid}/${envId}/static/${moduleKey}`;
  return {
    type: "extension",
    attrs: {
      extensionType: "com.atlassian.ecosystem",
      extensionKey,
      layout: "default",
      parameters: { extensionId, extensionTitle: title, guestParams: params },
    },
  };
}

/** Bodied Forge macro (wraps content) → type:"bodiedExtension". */
export function buildBodiedExtensionNode(appId, envId, moduleKey, { title = "App", params = {}, content = [] } = {}) {
  const uuid = ariToUuid(appId);
  const extensionKey = `${uuid}/${envId}/static/${moduleKey}`;
  const extensionId = `ari:cloud:ecosystem::extension/${uuid}/${envId}/static/${moduleKey}`;
  return {
    type: "bodiedExtension",
    attrs: {
      extensionType: "com.atlassian.ecosystem",
      extensionKey,
      layout: "default",
      parameters: { extensionId, extensionTitle: title, guestParams: params },
    },
    content: content.length ? content : [{ type: "paragraph", content: [] }],
  };
}

export function emptyDoc(text = "Harness test page.") {
  return { version: 1, type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}
export function paragraph(text) {
  return { type: "paragraph", content: [{ type: "text", text }] };
}
export function heading(text, level = 2) {
  return { type: "heading", attrs: { level }, content: [{ type: "text", text }] };
}
/** A simple 1x1 table (for Sentinel required-table validation scenarios). */
export function simpleTable() {
  return {
    type: "table",
    attrs: { isNumberColumnEnabled: false, layout: "default" },
    content: [{ type: "tableRow", content: [{ type: "tableCell", attrs: {}, content: [paragraph("cell")] }] }],
  };
}
export function appendNode(adf, node) {
  return { ...adf, content: [...(adf.content || []), node] };
}

// ---- canonicalize + FNV-1a hash (ported verbatim from Sentinel doc-surgery.js) ----
const VOLATILE_ADF_KEYS = new Set(["localId"]);
export function canonicalizeAdf(value) {
  if (Array.isArray(value)) return value.map(canonicalizeAdf);
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) {
      if (VOLATILE_ADF_KEYS.has(k)) continue;
      const v = canonicalizeAdf(value[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  return value;
}
export function hashAdf(node) {
  const str = JSON.stringify(canonicalizeAdf(node));
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ("0000000" + h.toString(16)).slice(-8);
}
