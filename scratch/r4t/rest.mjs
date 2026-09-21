export const U = "https://087a8e18-d45a-4cb7-9d87-3e84101ac4f3.hello.atlassian-dev.net/x1/p85enLGWqKdylGWa9TPM-Py3nh4";
export const T = process.env.LZ_PPM_REST_TOKEN || ""; // minted per run via testhook `what=mintApiToken`, revoked at exit
export const TOKEN_ID = process.env.LZ_PPM_REST_TOKEN_ID || "";
export async function rest(qs, { method = "GET", body } = {}) {
  const r = await fetch(`${U}?${qs}`, { method, headers: { Authorization: `Bearer ${T}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const t = await r.text();
  try { return { status: r.status, ...JSON.parse(t) }; } catch { return { status: r.status, text: t.slice(0, 1500) }; }
}
export async function hook(q) {
  const r = await fetch(`${process.env.LZ_PPM_TESTHOOK_URL}?${q}`, { headers: { Authorization: `Bearer ${process.env.HARNESS_SECRET}` } });
  const t = await r.text(); try { return JSON.parse(t); } catch { return { status: r.status, text: t.slice(0, 1500) }; }
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
