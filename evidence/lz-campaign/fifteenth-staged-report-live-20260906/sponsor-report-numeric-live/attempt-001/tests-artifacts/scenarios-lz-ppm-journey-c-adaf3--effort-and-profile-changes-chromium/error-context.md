# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/journey-campaign-report-numeric.spec.ts >> report analytics: actual capture retains exact seeded quantiles, scoped probabilities and 20h versus 12h overload despite later schedule, effort and profile changes
- Location: scenarios/lz-ppm/journey-campaign-report-numeric.spec.ts:15:1

# Error details

```
AggregateError: Owned schedule body/cleanup failures; every independent cleanup attempted
```

```
Error: Jira GET /rest/api/3/issue/WFH-2915?fields=project,labels,summary,customfield_10015,duedate,customfield_10180 failed 404: {"errorMessages":["Issue does not exist or you do not have permission to see it."],"errors":{}}
```

```
Error: Jira GET /rest/api/3/issue/WFH-2915?fields=project,labels,summary,customfield_10015,duedate,customfield_10180 failed 404: {"errorMessages":["Issue does not exist or you do not have permission to see it."],"errors":{}}
```

# Test source

```ts
  1   | // Low-level Jira Cloud REST client (adapted from CogniRunner/test-harness/lib/jira.mjs):
  2   | // basic auth, retry/backoff honoring Retry-After, JSON helpers, a small concurrency
  3   | // limiter, and common domain helpers. The API token is never logged. Used by the
  4   | // harness to create/seed/tear-down the live test DATA that the Forge UI then displays.
  5   | 
  6   | import { requireEnv, loadEnv } from "./env.mjs";
  7   | 
  8   | loadEnv();
  9   | const BASE = requireEnv("JIRA_BASE_URL").replace(/\/+$/, "");
  10  | const EMAIL = requireEnv("JIRA_ADMIN_EMAIL");
  11  | const TOKEN = requireEnv("JIRA_API_TOKEN");
  12  | const AUTH = "Basic " + Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");
  13  | 
  14  | export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  15  | 
  16  | export const stats = { requests: 0, status429: 0, status5xx: 0, retries: 0, retryAfterMsTotal: 0 };
  17  | export function resetStats() { stats.requests = 0; stats.status429 = 0; stats.status5xx = 0; stats.retries = 0; stats.retryAfterMsTotal = 0; }
  18  | 
  19  | const MAX_RETRIES = 6;
  20  | let VERBOSE = process.env.HARNESS_VERBOSE === "1";
  21  | export function setVerbose(v) { VERBOSE = v; }
  22  | 
  23  | function logLine(method, path, status, note) {
  24  |   if (!VERBOSE && status < 400) return;
  25  |   const tag = status >= 400 ? "!!" : "ok";
  26  |   console.log(`[jira ${tag}] ${method} ${path} -> ${status}${note ? " " + note : ""}`);
  27  | }
  28  | 
  29  | /**
  30  |  * Core request. Returns parsed JSON (or null for 204). Throws on non-2xx after
  31  |  * retries. Set opts.raw=true to get { status, headers, text }.
  32  |  */
  33  | export async function request(method, path, opts = {}) {
  34  |   const url = path.startsWith("http") ? path : `${BASE}${path}`;
  35  |   const headers = { Authorization: AUTH, Accept: "application/json", ...(opts.headers || {}) };
  36  |   let body = opts.body;
  37  |   if (body !== undefined && typeof body !== "string") {
  38  |     headers["Content-Type"] = headers["Content-Type"] || "application/json";
  39  |     body = JSON.stringify(body);
  40  |   }
  41  | 
  42  |   let attempt = 0;
  43  |   for (;;) {
  44  |     attempt++;
  45  |     let res;
  46  |     try {
  47  |       res = await fetch(url, { method, headers, body });
  48  |     } catch (err) {
  49  |       if (attempt > MAX_RETRIES) throw err;
  50  |       const wait = Math.min(30000, 500 * 2 ** (attempt - 1));
  51  |       logLine(method, path, 0, `network err, retry in ${wait}ms`);
  52  |       await sleep(wait);
  53  |       continue;
  54  |     }
  55  | 
  56  |     stats.requests++;
  57  |     if (res.status === 429) stats.status429++;
  58  |     else if (res.status >= 500) stats.status5xx++;
  59  | 
  60  |     if ((res.status === 429 || res.status >= 500) && attempt <= MAX_RETRIES) {
  61  |       stats.retries++;
  62  |       const ra = parseInt(res.headers.get("Retry-After") || "", 10);
  63  |       stats.retryAfterMsTotal += Number.isFinite(ra) ? ra * 1000 : 0;
  64  |       const wait = Number.isFinite(ra) ? ra * 1000 : Math.min(30000, 500 * 2 ** (attempt - 1));
  65  |       logLine(method, path, res.status, `retry in ${wait}ms (attempt ${attempt})`);
  66  |       await sleep(wait);
  67  |       continue;
  68  |     }
  69  | 
  70  |     const text = await res.text();
  71  |     logLine(method, path, res.status);
  72  | 
  73  |     if (opts.raw) return { status: res.status, headers: res.headers, text };
  74  |     if (res.status === 204 || text.length === 0) { if (res.ok) return null; }
  75  | 
  76  |     let json = null;
  77  |     try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text }; }
  78  | 
  79  |     if (!res.ok) {
> 80  |       const err = new Error(`Jira ${method} ${path} failed ${res.status}: ${text.slice(0, 600)}`);
      |                   ^ Error: Jira GET /rest/api/3/issue/WFH-2915?fields=project,labels,summary,customfield_10015,duedate,customfield_10180 failed 404: {"errorMessages":["Issue does not exist or you do not have permission to see it."],"errors":{}}
  81  |       err.status = res.status;
  82  |       err.body = json;
  83  |       throw err;
  84  |     }
  85  |     return json;
  86  |   }
  87  | }
  88  | 
  89  | export const get = (path, opts) => request("GET", path, opts);
  90  | export const post = (path, body, opts) => request("POST", path, { ...opts, body });
  91  | export const put = (path, body, opts) => request("PUT", path, { ...opts, body });
  92  | export const del = (path, opts) => request("DELETE", path, opts);
  93  | 
  94  | /** Simple promise concurrency limiter. */
  95  | export function pLimit(concurrency) {
  96  |   let active = 0;
  97  |   const queue = [];
  98  |   const next = () => {
  99  |     if (active >= concurrency || queue.length === 0) return;
  100 |     active++;
  101 |     const { fn, resolve, reject } = queue.shift();
  102 |     fn().then(resolve, reject).finally(() => { active--; next(); });
  103 |   };
  104 |   return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
  105 | }
  106 | 
  107 | /** Run items through worker with bounded concurrency; collects results in order. */
  108 | export async function mapLimit(items, concurrency, worker) {
  109 |   const limit = pLimit(concurrency);
  110 |   return Promise.all(items.map((item, i) => limit(() => worker(item, i))));
  111 | }
  112 | 
  113 | // ---- Common domain helpers ----
  114 | export const getMyself = () => get("/rest/api/3/myself");
  115 | export const getServerInfo = () => get("/rest/api/3/serverInfo");
  116 | export const getIssue = (key, fields) => get(`/rest/api/3/issue/${key}${fields ? `?fields=${fields}` : ""}`);
  117 | export const getTransitions = (key) => get(`/rest/api/3/issue/${key}/transitions?expand=transitions.fields`);
  118 | 
  119 | export async function doTransition(key, transitionId, fields) {
  120 |   const body = { transition: { id: String(transitionId) } };
  121 |   if (fields) body.fields = fields;
  122 |   const res = await request("POST", `/rest/api/3/issue/${key}/transitions`, { body, raw: true });
  123 |   return { status: res.status, text: res.text };
  124 | }
  125 | 
  126 | export async function uploadAttachment(key, filename, content) {
  127 |   const fd = new FormData();
  128 |   fd.append("file", new Blob([content], { type: "text/plain" }), filename);
  129 |   const res = await fetch(`${BASE}/rest/api/3/issue/${key}/attachments`, {
  130 |     method: "POST",
  131 |     headers: { Authorization: AUTH, "X-Atlassian-Token": "no-check" },
  132 |     body: fd,
  133 |   });
  134 |   return { status: res.status, ok: res.ok, text: await res.text() };
  135 | }
  136 | 
  137 | export async function searchJql(jql, fields = ["summary", "status"], maxResults = 100) {
  138 |   const out = [];
  139 |   let nextPageToken;
  140 |   do {
  141 |     const body = { jql, fields, maxResults };
  142 |     if (nextPageToken) body.nextPageToken = nextPageToken;
  143 |     const page = await post("/rest/api/3/search/jql", body);
  144 |     out.push(...(page.issues || []));
  145 |     nextPageToken = page.nextPageToken;
  146 |   } while (nextPageToken && out.length < 2000);
  147 |   return out;
  148 | }
  149 | 
  150 | export { BASE, EMAIL };
  151 | 
```