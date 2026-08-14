// Confluence Cloud REST helpers (reuse jira.mjs's authed client — same host/basic auth).
// Page ADF read/write verified against Sentinel Vault's writeDocBody (double-stringified
// atlas_doc_format, version+1, 409 retry).
import { get, post, request, BASE, sleep } from "./jira.mjs";
import { appendNode } from "./adf.mjs";

export { BASE };

const AUTH = "Basic " + Buffer.from(`${process.env.JIRA_ADMIN_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");

/** Upload a small text attachment to a page (v1 multipart) → { attachmentId, fileId, collection }. */
export async function uploadAttachment(pageId, filename, content) {
  const fd = new FormData();
  fd.append("file", new Blob([content], { type: "text/plain" }), filename);
  fd.append("minorEdit", "true");
  const up = await fetch(`${BASE}/wiki/rest/api/content/${pageId}/child/attachment`, {
    method: "POST",
    headers: { Authorization: AUTH, "X-Atlassian-Token": "no-check" },
    body: fd,
  });
  if (!up.ok) throw new Error(`uploadAttachment ${pageId} -> ${up.status}: ${(await up.text()).slice(0, 300)}`);
  const data = await up.json();
  const att = data.results?.[0] || data;
  const v2 = await get(`/wiki/api/v2/attachments/${att.id}`);
  return { attachmentId: att.id, fileId: v2.fileId, collection: `contentId-${pageId}` };
}

/** An ADF media block referencing a (real) attachment fileId, as Sentinel's sealer expects. */
export function mediaNode(fileId, pageId) {
  return { type: "mediaSingle", attrs: { layout: "center" }, content: [{ type: "media", attrs: { type: "file", id: fileId, collection: `contentId-${pageId}` } }] };
}

/** Set a Confluence content property (the seal gate collectMediaSealsForPage probes by key prefix). */
export async function setContentProperty(pageId, key, value) {
  const res = await request("POST", `/wiki/api/v2/pages/${pageId}/properties`, { raw: true, body: { key, value } });
  if (res.status >= 400 && res.status !== 409) throw new Error(`setContentProperty ${key} -> ${res.status}: ${res.text.slice(0, 200)}`);
  return res;
}

export async function spaceIdByKey(key) {
  const r = await get(`/wiki/api/v2/spaces?keys=${encodeURIComponent(key)}`);
  return r.results?.[0]?.id ?? null;
}

export async function createPage({ spaceId, title, adf, status = "current" }) {
  return post("/wiki/api/v2/pages", {
    spaceId: String(spaceId),
    status,
    title,
    body: { representation: "atlas_doc_format", value: JSON.stringify(adf) },
  });
}

export async function readPage(pageId) {
  const r = await get(`/wiki/api/v2/pages/${pageId}?body-format=atlas_doc_format`);
  return { page: r, version: r.version.number, status: r.status, title: r.title, adf: JSON.parse(r.body.atlas_doc_format.value) };
}

/** Write a new ADF body. Reads current version first; retries once on 409. */
export async function writeAdf(pageId, adf, { message = "harness update" } = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await readPage(pageId);
    const res = await request("PUT", `/wiki/api/v2/pages/${pageId}`, {
      raw: true,
      body: {
        id: String(pageId),
        status: cur.status,
        title: cur.title,
        body: { representation: "atlas_doc_format", value: JSON.stringify(adf) },
        version: { number: cur.version + 1, message },
      },
    });
    if (res.status === 409) { await sleep(500 * 2 ** attempt); continue; }
    if (res.status >= 400) throw new Error(`writeAdf ${pageId} -> ${res.status}: ${res.text.slice(0, 400)}`);
    return JSON.parse(res.text);
  }
  throw new Error(`writeAdf ${pageId}: version conflict after retries`);
}

/** Read current ADF, append a node, write it back. Returns the new page. */
export async function insertNode(pageId, node, { message } = {}) {
  const cur = await readPage(pageId);
  return writeAdf(pageId, appendNode(cur.adf, node), { message });
}

export async function deletePage(pageId) {
  return request("DELETE", `/wiki/api/v2/pages/${pageId}`, { raw: true });
}

export async function postComment(pageId, storageHtml) {
  return post(`/wiki/rest/api/content/${pageId}/child/comment`, {
    type: "comment",
    container: { id: String(pageId), type: "page" },
    body: { storage: { value: storageHtml, representation: "storage" } },
  });
}

export async function getComments(pageId) {
  const r = await get(`/wiki/rest/api/content/${pageId}/child/comment?expand=body.storage&limit=50`);
  return r.results || [];
}

export const pageUrl = (pageId) => `${BASE}/wiki/pages/viewpage.action?pageId=${pageId}`;

// ---------------------------------------------------------------------------
// Sentinel Vault media/trash helpers (incident 2026-07-22 regression suite).
// ---------------------------------------------------------------------------

/** A real 1x1 transparent PNG (67 bytes) — a genuine image Confluence will render. */
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** Upload a BINARY attachment (real content type — the text-only helper breaks image rendering). */
export async function uploadBinaryAttachment(pageId, filename, buffer, mime = "image/png") {
  const fd = new FormData();
  fd.append("file", new Blob([buffer], { type: mime }), filename);
  fd.append("minorEdit", "true");
  const up = await fetch(`${BASE}/wiki/rest/api/content/${pageId}/child/attachment`, {
    method: "POST",
    headers: { Authorization: AUTH, "X-Atlassian-Token": "no-check" },
    body: fd,
  });
  if (!up.ok) throw new Error(`uploadBinaryAttachment ${pageId} -> ${up.status}: ${(await up.text()).slice(0, 300)}`);
  const data = await up.json();
  const att = data.results?.[0] || data;
  const v2 = await getAttachment(att.id);
  return { attachmentId: att.id, fileId: v2.fileId, collection: `contentId-${pageId}` };
}

/**
 * v2 attachment GET → { status, fileId, version, title, pageId }.
 * Decision table probed live (Sentinel Vault INCIDENT-2026-07-22.md §7):
 * 200+"current" / 200+"trashed" (still carries fileId+version+pageId) / 404 → status "deleted".
 */
export async function getAttachment(attachmentId) {
  const res = await request("GET", `/wiki/api/v2/attachments/${attachmentId}`, { raw: true });
  if (res.status === 404) return { status: "deleted", fileId: null, version: null, title: null, pageId: null };
  if (res.status >= 400) throw new Error(`getAttachment ${attachmentId} -> ${res.status}`);
  const d = JSON.parse(res.text);
  return { status: d.status, fileId: d.fileId, version: d.version?.number ?? null, title: d.title, pageId: d.pageId ?? null };
}

/** Poll until the attachment reaches `want` status (default timeout 90s). Throws with the last seen status. */
export async function pollAttachmentStatus(attachmentId, want, { timeoutMs = 90000, intervalMs = 3000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = (await getAttachment(attachmentId)).status;
    if (last === want) return last;
    await sleep(intervalMs);
  }
  throw new Error(`pollAttachmentStatus ${attachmentId}: wanted "${want}", last saw "${last}" after ${timeoutMs}ms`);
}

/** Trash an attachment (v1 DELETE — status "trashed"; recoverable). */
export async function trashAttachment(attachmentId) {
  const res = await request("DELETE", `/wiki/rest/api/content/${attachmentId}`, { raw: true });
  if (res.status >= 400) throw new Error(`trashAttachment ${attachmentId} -> ${res.status}`);
}

/** Permanently purge a TRASHED attachment (v1 DELETE ?status=trashed — unrecoverable). */
export async function purgeAttachment(attachmentId) {
  const res = await request("DELETE", `/wiki/rest/api/content/${attachmentId}?status=trashed`, { raw: true });
  if (res.status >= 400) throw new Error(`purgeAttachment ${attachmentId} -> ${res.status}`);
}

/** Count page footer/inline comments whose storage body contains `needle` (paginated). */
export async function countCommentsMatching(pageId, needle) {
  let count = 0;
  let start = 0;
  for (;;) {
    const r = await get(`/wiki/rest/api/content/${pageId}/child/comment?expand=body.storage&limit=50&start=${start}`);
    const results = r.results || [];
    for (const c of results) {
      if ((c.body?.storage?.value || "").includes(needle)) count++;
    }
    if (results.length < 50) return count;
    start += 50;
  }
}

/** An ADF mediaSingle with explicit presentation attrs (resize/layout tamper vectors). */
export function mediaNodeWithAttrs(fileId, pageId, { layout = "center", width, widthType, mediaAttrs = {} } = {}) {
  const attrs = { layout };
  if (width !== undefined) attrs.width = width;
  if (widthType !== undefined) attrs.widthType = widthType;
  return {
    type: "mediaSingle",
    attrs,
    content: [{ type: "media", attrs: { type: "file", id: fileId, collection: `contentId-${pageId}`, ...mediaAttrs } }],
  };
}
