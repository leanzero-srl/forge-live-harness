// TESTER PROBE — the ERROR-BODY P0: Jira's own sentence must reach the user.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver } from "./chatwise-support";
// eslint-disable-next-line
import { get, post, del } from "../../data/jira.mjs";
// eslint-disable-next-line
import * as fs from "node:fs";

const QUOTA_RE = /used up their token allowance|token allowance for the moment/i;
const OUT = "scratch/tester6/errorbody.json";

async function askOnce(frame: any, page: any, conversationId: string, message: string) {
  const sent = await callResolver<any>(frame, GLOBAL_APP, "chat", {
    conversationId, message, personaId: "jira-scrubber", personaLocked: true,
  });
  if (!sent?.success) return `__ENQUEUE_FAILED__ ${JSON.stringify(sent?.error)}`;
  let data: any = null;
  const deadline = Date.now() + 480_000;
  while (Date.now() < deadline) {
    const r = await callResolver<any>(frame, GLOBAL_APP, "getJobStatus", { jobId: sent.jobId });
    data = r?.data ?? null;
    if (data && ["completed", "failed", "cancelled"].includes(data.status)) break;
    await page.waitForTimeout(3000);
  }
  if (data?.status !== "completed") return `__JOB_${data?.status}__ ${data?.error || ""}`;
  return String(data.result?.response || "");
}
async function ask(frame: any, page: any, c: string, m: string, tries = 10) {
  for (let i = 0; i < tries; i++) {
    const r = await askOnce(frame, page, c, m);
    if (!QUOTA_RE.test(r)) return r;
    console.log(`   [quota] blocked, waiting 150s (attempt ${i + 1})`);
    await page.waitForTimeout(150_000);
  }
  return "__QUOTA_NEVER_CLEARED__";
}

async function mk(typeId: string, summary: string, parent?: string) {
  const f: any = { project: { key: "WFH" }, issuetype: { id: typeId }, summary, labels: ["harness-test"] };
  if (parent) f.parent = { key: parent };
  const i: any = await post("/rest/api/3/issue", { fields: f });
  return String(i.key);
}
async function projectOf(key: string) {
  const r: any = await get(`/rest/api/3/issue/${key}?fields=project`).catch(() => null);
  return r?.fields?.project?.key ?? null;
}

const RAW_JSON = [/\{"/, /errorMessages"/, /i18nKey/, /\[object Object\]/];

test("error body reaches the user", async ({ page }) => {
  test.setTimeout(7_200_000);
  const T = getTarget("chatwise-global");
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  const out: any = {};

  // ---- D. the issue-panel path, straight at the resolver the panel uses ----
  for (const key of ["WFH-999999", "LZPP-1"]) {
    const r: any = await callResolver(frame, GLOBAL_APP, "getIssueDetails", { issueKey: key });
    out[`panel_${key}`] = r;
    console.log(`\n### getIssueDetails(${key}) =>`, JSON.stringify(r));
  }

  // ---- A. bogus target issue type -----------------------------------------
  {
    const convId = `conv_eb_a_${Date.now()}`;
    const k = await mk("10004", `[harness-test] errbody typeid ${Date.now()}`);
    try {
      await callResolver(frame, GLOBAL_APP, "createConversation", { conversationId: convId, title: "[harness] errbody A", personaId: "jira-scrubber" });
      const a1 = `Move ${k} into the CGL1 project using targetIssueTypeId 10004 exactly. Call moveIssues with targetProjectKey CGL1 and targetIssueTypeId 10004. Do not look the type up, do not substitute another id, and if it fails just tell me exactly what Jira said — do not retry.`;
      const t1 = await ask(frame, page, convId, a1);
      console.log(`\n### A T1\n${t1}\n--- project: ${await projectOf(k)}`);
      const t2 = await ask(frame, page, convId, "yes");
      const p = await projectOf(k);
      console.log(`\n### A T2 ("yes")\n${t2}\n--- project: ${p}`);
      out.caseA = { key: k, sent: a1, t1, t2, project: p };
    } finally {
      await del(`/rest/api/3/issue/${k}?deleteSubtasks=true`).catch(() => {});
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId: convId }).catch(() => {});
    }
  }

  // ---- B. sub-task without its parent -------------------------------------
  {
    const convId = `conv_eb_b_${Date.now()}`;
    const parent = await mk("10004", `[harness-test] errbody parent ${Date.now()}`);
    const sub = await mk("10006", `[harness-test] errbody sub ${Date.now()}`, parent);
    try {
      await callResolver(frame, GLOBAL_APP, "createConversation", { conversationId: convId, title: "[harness] errbody B", personaId: "jira-scrubber" });
      const b1 = `Move ONLY the sub-task ${sub} into the CGL1 project as a Sub-task (targetIssueTypeId 10016). Do NOT move its parent ${parent} and do not pass a targetParentKey. Call moveIssues with exactly issueKeys [${sub}], targetProjectKey CGL1, targetIssueTypeId 10016. If it fails, tell me exactly what Jira said and what my options are — do not retry.`;
      const t1 = await ask(frame, page, convId, b1);
      console.log(`\n### B T1\n${t1}\n--- sub project: ${await projectOf(sub)}`);
      const t2 = await ask(frame, page, convId, "yes");
      const p = await projectOf(sub);
      console.log(`\n### B T2 ("yes")\n${t2}\n--- sub project: ${p}`);
      out.caseB = { parent, sub, sent: b1, t1, t2, project: p };
    } finally {
      await del(`/rest/api/3/issue/${parent}?deleteSubtasks=true`).catch(() => {});
      await del(`/rest/api/3/issue/${sub}?deleteSubtasks=true`).catch(() => {});
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId: convId }).catch(() => {});
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  // C. no raw JSON in any captured bubble
  const bubbles = [out.caseA?.t1, out.caseA?.t2, out.caseB?.t1, out.caseB?.t2].filter(Boolean) as string[];
  for (const b of bubbles) for (const re of RAW_JSON) {
    expect(re.test(b), `RAW JSON ${re} leaked into a bubble:\n${b.slice(0, 600)}`).toBe(false);
  }
});
