// TESTER PROBE — ASSETS, six tools, live against wolfaenpak's real CMDB.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver } from "./chatwise-support";
// eslint-disable-next-line
import * as fs from "node:fs";

const QUOTA_RE = /used up their token allowance|token allowance for the moment/i;
const OUT = "scratch/tester6/assets.json";

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
async function ask(frame: any, page: any, c: string, m: string, tries = 12) {
  for (let i = 0; i < tries; i++) {
    const r = await askOnce(frame, page, c, m);
    if (!QUOTA_RE.test(r)) return r;
    console.log(`   [quota] blocked, waiting 150s (attempt ${i + 1})`);
    await page.waitForTimeout(150_000);
  }
  return "__QUOTA_NEVER_CLEARED__";
}

const STEPS: { id: string; prompt: string }[] = [
  {
    id: "1-schemas",
    prompt:
      "Use the Assets tools. List every Assets object schema on this site. For EACH schema give me: " +
      "schemaId, name, key, objectCount, objectTypeCount, and then every object type inside it with its id and name. " +
      "Report exactly what the tool returned — if a field is missing say so.",
  },
  {
    id: "2-object",
    prompt:
      "Show me Assets object IGOV-109 in full. List EVERY attribute by name with its value, plus the object's " +
      "numeric id, key, label, object type name, created and updated timestamps. Nothing summarised.",
  },
  {
    id: "3-aql",
    prompt:
      'Run this AQL against Assets exactly: objectType = "Classification Level". ' +
      "List every object it returns with its numeric id, key and label, and tell me the total the tool reported.",
  },
  {
    id: "4-create",
    prompt:
      'Create ONE Assets object of object type id 77 ("Confluence Space") with these attributes exactly: ' +
      'Name = "[harness] tester probe space", Space Key = "HRNSTEST", Data Owner = "Harness Bot", ' +
      'Classification = "INTERNAL". Then tell me the new object\'s numeric id and key, and read back every ' +
      "attribute it now has.",
  },
  {
    id: "5-update",
    prompt:
      'Update the Assets object you just created: set Data Owner to "Harness Bot Two" and Classification to ' +
      '"PUBLIC". Then read it back and list every attribute with its value.',
  },
];

test("assets — six tools end to end", async ({ page }) => {
  test.setTimeout(7_200_000);
  const T = getTarget("chatwise-global");
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);

  const convId = `conv_assets_${Date.now()}`;
  const out: any = {};
  try {
    await callResolver(frame, GLOBAL_APP, "createConversation", {
      conversationId: convId, title: "[harness] assets", personaId: "jira-scrubber",
    });
    for (const s of STEPS) {
      console.log(`\n================ ASSETS ${s.id} ================\n> ${s.prompt}`);
      const r = await ask(frame, page, convId, s.prompt);
      console.log(r);
      out[s.id] = { prompt: s.prompt, reply: r };
      fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
    }
  } finally {
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
    await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId: convId }).catch(() => {});
  }
  expect(Object.keys(out).length).toBeGreaterThan(0);
});
