// JSM ASSETS (CMDB) REST GROUND TRUTH, fetched by the harness itself.
//
// WHY THIS IS A SEPARATE CLIENT AND NOT data/jira.mjs
// ---------------------------------------------------
// The Assets API is NOT served from the site host. Inside a Forge app,
// `requestJira` is a path-relative client against
// `https://api.atlassian.com/ex/jira/{cloudId}`, so the app addresses it as
// `/jsm/assets/workspace/{ws}/v1/...` and it just works. From OUTSIDE, against
// `https://<site>.atlassian.net`, that exact path answers a 404 HTML page — the
// harness's first attempt got Jira's "Oops, you've found a dead link" template
// back and it looks nothing like an auth or a scope problem.
//
// The workspace id comes from the SITE host
// (`/rest/servicedeskapi/assets/workspace`, which is normal Jira REST) and
// everything after it goes to `https://api.atlassian.com/jsm/assets/...`.
//
// BASIC AUTH CARRIES THE WHOLE USER, NOT THE APP'S OAUTH SCOPES. So a 200 here
// proves the object exists and the data is what we say it is — it proves
// NOTHING about whether the deployed app's `asUser` can reach it. That is
// exactly the division of labour we want: the app's reach is what the live spec
// measures, and this file is only ever the independent witness.
import { get } from "./jira.mjs";
import { loadEnv, requireEnv } from "./env.mjs";

loadEnv();
const AUTH =
  "Basic " +
  Buffer.from(`${requireEnv("JIRA_ADMIN_EMAIL")}:${requireEnv("JIRA_API_TOKEN")}`).toString("base64");

let WORKSPACE = null;

/** The one workspace id every Assets URL needs. Cached per process. */
export async function assetsWorkspaceId() {
  if (WORKSPACE) return WORKSPACE;
  const res = await get("/rest/servicedeskapi/assets/workspace");
  const id = res?.values?.[0]?.workspaceId || null;
  if (!id) throw new Error("this site has no Assets workspace — the Assets specs cannot run here");
  WORKSPACE = id;
  return id;
}

/** Raw call. Returns { status, body } and NEVER throws on a 4xx — a 404 after a
 *  delete is a result this harness wants to read, not an exception to catch. */
export async function assets(method, path, body) {
  const ws = await assetsWorkspaceId();
  const url = `https://api.atlassian.com/jsm/assets/workspace/${ws}/v1${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: AUTH,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (res.status >= 400 && res.status !== 404) {
    console.log(`[assets !!] ${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  }
  return { status: res.status, body: parsed, text };
}

export const listSchemas = () => assets("GET", "/objectschema/list");
export const listObjectTypes = (schemaId) => assets("GET", `/objectschema/${schemaId}/objecttypes`);
export const listTypeAttributes = (typeId) => assets("GET", `/objecttype/${typeId}/attributes`);
export const getObject = (id) => assets("GET", `/object/${id}`);
export const deleteObject = (id) => assets("DELETE", `/object/${id}`);

/**
 * AQL, the way Atlassian documents it: paging on the QUERY STRING, `qlQuery` in
 * the body. Both are sent because the field reports say the opposite and this
 * is correct under either reading.
 */
export const aql = (qlQuery, maxResults = 25, startAt = 0) =>
  assets(
    "POST",
    `/object/aql?startAt=${startAt}&maxResults=${maxResults}&includeAttributes=true`,
    { qlQuery, startAt, maxResults, includeAttributes: true },
  );

/**
 * Find a SIMPLE object type to write into: one whose only required EDITABLE
 * attribute is the Name label, so a create needs exactly one value and the test
 * is about the tool rather than about filling a form.
 *
 * Discovered, never hard-coded. The tenant's schema list has changed twice this
 * week; a spec pinned to "type 43" would be reporting a tidy-up as a product
 * failure. A schema whose key is CRT ("CogniRunner Test Assets") is preferred
 * because it is the throwaway one, but any schema will do.
 */
export async function findSimpleObjectType() {
  const schemas = await listSchemas();
  if (schemas.status !== 200) {
    throw new Error(`could not list Assets schemas: HTTP ${schemas.status} ${schemas.text.slice(0, 200)}`);
  }
  const ordered = [...(schemas.body?.values || [])].sort(
    (a, b) => (a.objectSchemaKey === "CRT" ? -1 : 0) - (b.objectSchemaKey === "CRT" ? -1 : 0),
  );
  for (const schema of ordered) {
    const types = await listObjectTypes(schema.id);
    for (const type of types.body || []) {
      const attrs = await listTypeAttributes(type.id);
      const list = attrs.body || [];
      const requiredEditable = list.filter(
        (a) => (a.minimumCardinality > 0 || a.required) && a.editable !== false,
      );
      const name = list.find((a) => a.name === "Name" && a.editable !== false);
      if (name && requiredEditable.length === 1 && requiredEditable[0].name === "Name") {
        return {
          schemaId: String(schema.id),
          schemaName: schema.name,
          schemaKey: schema.objectSchemaKey,
          typeId: String(type.id),
          typeName: type.name,
          nameAttributeId: String(name.id),
        };
      }
    }
  }
  throw new Error("no Assets object type on this site takes only a Name — the Assets spec needs one");
}
