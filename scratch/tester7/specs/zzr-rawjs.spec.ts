// TESTER PROBE — can handleException's RAW JS TEXT reach a user bubble?
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver } from "./chatwise-support";

const QUOTA_RE = /used up their token allowance|token allowance for the moment/i;
const RAW_JS = /is not a function|is not iterable|Cannot read propert|Unexpected token|is not defined|intermediate value/i;

async function askOnce(frame: any, page: any, conversationId: string, message: string) {
  const sent = await callResolver<any>(frame, GLOBAL_APP, "chat", { conversationId, message, personaId: "jira-scrubber", personaLocked: true });
  if (!sent?.success) return `__ENQUEUE_FAILED__ ${JSON.stringify(sent?.error)}`;
  let data: any = null;
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    const r = await callResolver<any>(frame, GLOBAL_APP, "getJobStatus", { jobId: sent.jobId });
    data = r?.data ?? null;
    if (data && ["completed", "failed", "cancelled"].includes(data.status)) break;
    await page.waitForTimeout(3000);
  }
  if (data?.status !== "completed") return `__JOB_${data?.status}__ ${data?.error || ""}`;
  return String(data.result?.response || "");
}
async function ask(frame: any, page: any, c: string, m: string, tries = 6) {
  for (let i = 0; i < tries; i++) {
    const r = await askOnce(frame, page, c, m);
    if (!QUOTA_RE.test(r)) return r;
    console.log(`   [quota] waiting 150s`); await page.waitForTimeout(150_000);
  }
  return "__QUOTA_NEVER_CLEARED__";
}

const PROBES = [
  { label: "moveIssues string key", prompt: "Move issue WFH-2197 into project CGL1. Important: the move tool accepts issueKeys as a PLAIN STRING when there is only one issue, so pass it as the string \"WFH-2197\", not as a list. Call it now." },
  { label: "moveIssues number keys", prompt: "Move the issues with numeric ids 2197 and 2057 into project CGL1. Pass issueKeys as the number 2197 directly. Go." },
  { label: "custom fields twice", prompt: "List all custom fields, then list them again scoped to project WFH, then tell me the difference." },
  { label: "link types", prompt: "List every issue link type on this site with its inward and outward names." },
];

test("raw JS exception text in a user bubble", async ({ page }) => {
  test.setTimeout(3_600_000);
  const T = getTarget("chatwise-global");
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  console.log("### VERSION:", ((await frame.locator("#version-indicator").textContent()) || "").trim());
  const convs: string[] = [];
  const hits: string[] = [];
  try {
    for (const p of PROBES) {
      const c = `conv_rawjs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      convs.push(c);
      await callResolver(frame, GLOBAL_APP, "createConversation", { conversationId: c, title: `[harness] ${p.label}`, personaId: "jira-scrubber" });
      const t = await ask(frame, page, c, p.prompt);
      console.log(`\n===== ${p.label} =====\n${t.slice(0, 2500)}`);
      const m = t.match(RAW_JS);
      console.log(`>>> RAW JS IN BUBBLE: ${m ? JSON.stringify(m[0]) : "no"}`);
      console.log(`>>> "context budget" leaked: ${/context budget/i.test(t)}`);
      if (m) hits.push(`${p.label}: ${m[0]}`);
      if (/context budget/i.test(t)) hits.push(`${p.label}: context budget elision object`);
    }
  } finally {
    for (const c of convs) await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId: c }).catch(() => {});
  }
  console.log("\n### HITS:", JSON.stringify(hits));
  expect(hits.join(" | "), "internal machinery text reached a user bubble").toBe("");
});
