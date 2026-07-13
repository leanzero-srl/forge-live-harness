// DEPENDENCY-DENSE bed for edge-windowing perf. Adds "Blocks" links among the existing LZPP
// issues (from _seed-perf) so the Gantt draws thousands of dependency arrows: a CHAIN of
// adjacent-row edges (key[i] blocks key[i+1] — short, the majority, most cullable when
// off-screen) PLUS some LONG-range edges (key[i] blocks key[i+SPAN] — cross the viewport,
// must stay rendered). Guarded by PERFDEPS=1. Concurrent + hardened fetch (timeout + retry).
//   PERFDEPS=1 CHAIN=2000 LONG=200 npx playwright test scenarios/lz-ppm/_seed-perf-deps.spec.ts
import { test, expect } from "../../fixtures/forge";

const KEY = "LZPP";
const CHAIN = Number(process.env.CHAIN || 2000);   // adjacent i -> i+1 edges
const LONG = Number(process.env.LONG || 200);      // long-range edges
const LONG_SPAN = Number(process.env.LONG_SPAN || 400);
test.describe.configure({ retries: 0, timeout: 1_800_000 });

test("SEED dependency links on LZPP (chain + long-range)", async ({ page }) => {
  test.skip(process.env.PERFDEPS !== "1", "guarded: set PERFDEPS=1 to create links");
  await page.goto("https://wolfaenpak.atlassian.net/jira", { waitUntil: "domcontentloaded" });

  const jira = async (method: string, path: string, body?: any) =>
    page.evaluate(async (args: any[]) => {
      const [m, p, b] = args as [string, string, any];
      const once = async () => {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 45000);
        try {
          const res = await fetch(p, { method: m, headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" }, credentials: "include", body: b ? JSON.stringify(b) : undefined, signal: ctrl.signal });
          let data: any = null; const t = await res.text(); try { data = t ? JSON.parse(t) : null; } catch { data = t; }
          return { status: res.status, ok: res.ok, data };
        } finally { clearTimeout(to); }
      };
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      let last: any = { status: 0, ok: false, data: null };
      for (let attempt = 0; attempt < 4; attempt++) {
        try { last = await once(); if (last.ok || (last.status >= 400 && last.status < 500 && last.status !== 429)) return last; }
        catch (e) { last = { status: 0, ok: false, data: String(e) }; }
        await sleep(1000 * Math.pow(2, attempt));
      }
      return last;
    }, [method, path, body]);

  // 1. Fetch issue keys in created order (the plan's display order = ORDER BY created ASC).
  const need = Math.max(CHAIN + 1, LONG + LONG_SPAN + 1);
  const keys: string[] = [];
  let token: string | null = null;
  for (let guard = 0; guard < 200 && keys.length < need; guard++) {
    const body: any = { jql: `project = ${KEY} ORDER BY created ASC`, maxResults: 100, fields: ["summary"] };
    if (token) body.nextPageToken = token;
    const res: any = await jira("POST", "/rest/api/3/search/jql", body);
    const issues = res.data?.issues || [];
    for (const it of issues) keys.push(it.key);
    token = res.data?.nextPageToken || null;
    if (!token || issues.length === 0) break;
  }
  console.log(`FETCHED_KEYS ${keys.length} (need ${need})`);
  expect(keys.length, "fetched enough LZPP keys").toBeGreaterThan(Math.min(CHAIN, 100));

  // 2. Build the link work-list: chain + long-range.
  const link = (a: string, b: string) => ({ a, b });
  const work: { a: string; b: string }[] = [];
  for (let i = 0; i + 1 < Math.min(CHAIN, keys.length - 1); i++) work.push(link(keys[i], keys[i + 1]));
  for (let n = 0; n < LONG; n++) {
    const i = Math.floor((n / LONG) * (keys.length - LONG_SPAN - 1));
    if (keys[i] && keys[i + LONG_SPAN]) work.push(link(keys[i], keys[i + LONG_SPAN]));
  }
  console.log(`LINK_WORK ${work.length} (chain + long)`);

  // 3. Create the links concurrently (batches). "A Blocks B" => A.outward, B.inward.
  const CONC = 8;
  let created = 0, failed = 0;
  for (let base = 0; base < work.length; base += CONC) {
    const batch = work.slice(base, base + CONC);
    const results = await Promise.all(batch.map((w) =>
      jira("POST", "/rest/api/3/issueLink", { type: { name: "Blocks" }, outwardIssue: { key: w.a }, inwardIssue: { key: w.b } })
    ));
    for (const r of results) { if (r.ok || r.status === 201) created++; else failed++; }
    if (base % (CONC * 25) === 0) console.log(`... links ${base + batch.length}/${work.length} (created ${created}, failed ${failed})`);
  }
  console.log(`PERF_DEPS_DONE created=${created} failed=${failed} total=${work.length}`);
  expect(created, "created a meaningful number of links").toBeGreaterThan(0);
});
