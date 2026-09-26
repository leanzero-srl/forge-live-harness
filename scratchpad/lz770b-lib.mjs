import fs from "node:fs";
export const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz770b";
const HOOK = process.env.LZ_PPM_TESTHOOK_URL, SECRET = process.env.HARNESS_SECRET;
export const hook = async (q) => {
  const u = new URL(HOOK); for (const [k,v] of Object.entries(q)) u.searchParams.set(k,String(v));
  const r = await fetch(u, { headers: { Authorization: `Bearer ${SECRET}` } });
  const t = await r.text(); if (!r.ok) throw new Error(`hook ${q.what} ${r.status} ${t.slice(0,400)}`);
  return JSON.parse(t);
};
export const bed = () => JSON.parse(fs.readFileSync(`${OUT}/bed.json`,"utf8"));
export const save = (o) => fs.writeFileSync(`${OUT}/bed.json`, JSON.stringify({ ...bed(), ...o }, null, 2));
export async function api(tok, method, query, body) {
  const url = new URL(tok.url);
  for (const [k,v] of Object.entries(query)) url.searchParams.set(k,String(v));
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${tok.token}`, ...(body!==undefined?{"Content-Type":"application/json"}:{}) }, body: body!==undefined?JSON.stringify(body):undefined });
  const text = await res.text(); let json=null; try{json=JSON.parse(text);}catch{}
  return { status: res.status, json, text };
}
