// Shared plumbing for the workflow UX-fix specs (WF-1..WF-4, 2026-09-19): a disposable WFH page with
// the default workflow assigned and Mihai as the space's sole approver; the ribbon frame finder; and a
// restore that puts WFH's workflow settings/definition back exactly as found and purges every key the
// page produced. Real accounts throughout (the resolvers verify the caller's entitlement).
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage } from "../../data/confluence.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";

export const SPACE = "WFH";
export const DEV = "17516615";
export const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
export const GABI = "712020:2b9d007d-db0d-47c9-b4ae-953f55501f55";
// The plain-editor bed (2026-09-20). Mihai, Gabriela and LeanZero SRL are all SITE admins on
// wolfaenpak (`administer/application`), so no space can make them non-stewards: the steward
// gate's site-admin arm answers first. The second "Mihai Perdum" account (mihai@leanzero.net)
// is the one real licensed account with no admin operation at all — a member of
// confluence-users-wolfaenpak only. Space SVPLAIN (id 344162767, created by the harness user)
// gives that group read/create/update and keeps `administer` for confluence-admins-wolfaenpak,
// site-admins and Mihai — so PLAIN is a plain editor there and nowhere a steward.
export const PLAIN = "712020:6c8dccca-a6b1-4c6f-903c-329094a1bac1";
export const PLAIN_SPACE = "SVPLAIN";

export const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
export const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
export const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
export const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
export const queryKvs = async (prefix: string): Promise<string[]> => (await getTestState("sentinel-vault", { what: "query", prefix })).keys || [];
export const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
export const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
export const norm = (s: string) => s.replace(/\s+/g, " ").trim();

export type WfBed = { pageId: string; restore: () => Promise<void> };

/** WFH: workflow on, Mihai sole approver (mode any), enforce = demote; a page assigned to "default". */
export async function setupWorkflowPage(titlePrefix: string, opts: { enforceMode?: string; approvers?: { id: string; name: string }[]; body?: any[]; space?: string } = {}): Promise<WfBed> {
  const S = opts.space || SPACE;
  const before = { settings: await getKvs(`workflow-settings-${S}`), def: await getKvs(`workflow-def-space-${S}`) };
  const approvers = opts.approvers || [{ id: MIHAI, name: "Mihai Perdum" }];
  await inv("setSpaceWorkflowSettings", {
    spaceKey: S, enabled: "1", autoAssignNew: "0", workflowId: "default", enforceMode: opts.enforceMode || "demote",
    approval: JSON.stringify({ approvers: approvers.map((a) => ({ type: "user", ...a })), mode: "any", min: 1 }),
  });
  const spaceId = await spaceIdByKey(S);
  const page = await createPage({ spaceId, title: `HARNESS ${titlePrefix} ${Date.now()}`, adf: doc(...(opts.body || [heading("Policy", 2), paragraph("This is the policy text every employee must read.")])) });
  const pageId = String(page.id);
  const asg = await inv("assignWorkflow", { pageId, spaceKey: S, workflowId: "default", actor: MIHAI, actorName: "Mihai Perdum" });
  if (!asg.result?.success) throw new Error(`assignWorkflow failed: ${JSON.stringify(asg.result)}`);
  const restore = async () => {
    if (before.settings == null) await delKvs(`workflow-settings-${S}`).catch(() => {}); else await setKvs(`workflow-settings-${S}`, before.settings);
    if (before.def == null) await delKvs(`workflow-def-space-${S}`).catch(() => {}); else await setKvs(`workflow-def-space-${S}`, before.def);
    for (const k of [`workflow-state-${pageId}`, `workflow-pending-${pageId}`, `workflow-autoassigned-${pageId}`, `workflow-label-${pageId}`, `workflow-review-notified-${pageId}`, `workflow-integrity-notified-${pageId}`, `workflow-completing-${pageId}`, `workflow-inbox-${MIHAI}-${pageId}`, `workflow-inbox-${GABI}-${pageId}`, `workflow-inbox-${PLAIN}-${pageId}`, `page-guard-${pageId}`]) await delKvs(k).catch(() => {});
    for (const st of ["draft", "in_review", "approved", "expired"]) await delKvs(`workflow-idx-${S}-${st}-${pageId}`).catch(() => {});
    for (const prefix of [`workflow-log-${pageId}-`, `workflow-approval-${pageId}-`, `read-ack-${pageId}-`, `wfreq-mine-`]) { for (const k of await queryKvs(prefix).catch(() => [] as string[])) if (prefix !== "wfreq-mine-" || k.endsWith(`-${pageId}`)) await delKvs(k).catch(() => {}); }
    await deletePage(pageId).catch(() => {});
  };
  return { pageId, restore };
}

/** The dev ribbon iframe on the current page: { frame, el } or null. */
export async function ribbonFrame(page: any, want = '[data-testid="ribbon-bar"], .ribbon-bar', tries = 30) {
  const ifr = page.locator(`iframe[src*="${DEV}"]`);
  for (let t = 0; t < tries; t++) {
    const n = await ifr.count();
    for (let i = 0; i < n; i++) {
      const cf = ifr.nth(i).contentFrame();
      if ((await cf.locator(want).count().catch(() => 0)) > 0) return { frame: cf, el: ifr.nth(i) };
    }
    await page.waitForTimeout(1500);
  }
  return null;
}

export async function loadPage(page: any, pageId: string) {
  await page.goto(`https://wolfaenpak.atlassian.net/wiki/pages/viewpage.action?pageId=${pageId}`, { waitUntil: "domcontentloaded" });
  const r = await ribbonFrame(page);
  if (r) await page.waitForTimeout(2500); // let the workflow chip settle after first paint
  return r;
}

export async function ribbonText(frame: any) { return strip(await frame.locator("body").innerHTML().catch(() => "")); }

/** Screenshot the ribbon's iframe box plus `extra` px below it (popovers render in-flow below the bar). */
export async function shotRibbon(page: any, el: any, path: string, extra = 0) {
  const box = await el.boundingBox().catch(() => null);
  if (!box) { await page.screenshot({ path }); return; }
  await page.screenshot({ path, clip: { x: Math.max(0, box.x - 4), y: Math.max(0, box.y - 4), width: Math.min(box.width + 8, 1440), height: box.height + 8 + extra } });
}

/** Put `recent-notifications` back. The hook takes the value on the query string, and a feed that grew
 *  past ~8 KB during a run answers 414 — so a big original is restored trimmed to its newest 30 events. */
export async function restoreFeed(original: any) {
  if (!original) { await delKvs("recent-notifications").catch(() => {}); return; }
  const events = Array.isArray(original.events) ? original.events : [];
  let value = original;
  if (JSON.stringify(original).length > 6000) value = { ...original, events: events.slice(-30) };
  await setKvs("recent-notifications", value).catch(() => {});
}
