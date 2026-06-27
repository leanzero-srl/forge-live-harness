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
