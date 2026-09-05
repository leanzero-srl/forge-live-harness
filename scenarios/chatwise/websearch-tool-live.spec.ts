// LIVE: WEB SEARCH, END TO END — the one capability this app spent its
// "Runs on Atlassian" badge on, driven the whole way through.
//
// WHAT THIS SETTLES THAT NOTHING ELSE CAN
// ---------------------------------------
// `websearch-settings-card.spec.ts` proves the ADMIN CARD stores a key and
// flips a switch. `test/webSearchTool.test.mjs` proves the CLIENT builds a
// request nobody's identifiers reach. Neither one can answer the question the
// app's own header calls unproven:
//
//     `kvs.getSecret` IN THE QUEUE-CONSUMER CONTEXT IS THE ONE UNPROVEN HOP.
//     (src/shared/tools/handlers/websearch/searchKey.js, and the skill's
//      changelog says the same in as many words.)
//
// The consumer runs in a DIFFERENT invocation context from a resolver — it is
// a queue consumer, not a `resolver.define` behind an authenticated web
// trigger — and `readSearchKey()` fails CLOSED, so a refusal there is
// indistinguishable from "nobody configured a key" at every surface a person
// can see: the tool is simply not offered and the model answers from memory.
// A green settings card and a chatty reply would both look exactly the same.
//
// So this spec asserts the outcome that can ONLY happen if the secret was
// readable inside the consumer: a real request left Atlassian, real pages came
// back, and the model cited one. Plus the log line, verbatim, so the failure
// mode has a name rather than a silence.
//
// THE OTHER HALF IS THE REFUSAL. `leakyIdentifier()` refuses a query naming an
// issue key BEFORE any request is built. That is a code guarantee, not a model
// judgement, and the only way to prove it live is to ask for exactly that and
// then COUNT the provider requests in the window — a reply with no link would
// also be produced by a model that searched, got nothing useful, and stayed
// quiet about it.
//
// THE KEY NEVER APPEARS ANYWHERE. Not in a log line, not in an assertion
// message, not in a screenshot, not in this file. It is read from a file whose
// path comes from the environment, held in a local, and typed into a password
// field. If the file is absent the spec SKIPS — a harness that silently passes
// without the credential would be proving nothing under a green tick.
//
// COST. Two model turns on the cheapest tier and ONE provider credit (the
// refusal turn spends none, which is the point of it). `testWebSearchKey` is
// never called: it spends a credit to learn what the search turn proves better.
import { test, expect } from "../../fixtures/forge";
import type { Page, FrameLocator, Locator } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import {
  GLOBAL_APP,
  callResolver,
  openGlobalPage,
  skipIfQuotaBlocked,
  waitForChatApp,
} from "./chatwise-support";

const T = getTarget("chatwise-admin");
const CHAT = getTarget("chatwise-global");
const execFileP = promisify(execFile);

/** Where the operator left the provider key. Never printed, never committed. */
const KEY_FILE =
  process.env.CHATWISE_SEARCH_KEY_FILE ||
  path.join(
    "/private/tmp/claude-501/-Users-mihaiperdum-Projects-ChatWise",
    "6fbc7d3d-08a3-41d3-9673-62eea36d3527/scratchpad/.serper_key",
  );
/** The app repo, because `forge logs` is only meaningful from inside it. */
const APP_REPO = process.env.CHATWISE_REPO || path.join(os.homedir(), "Projects/ChatWise");

type Root = Page | FrameLocator;
const PROBE_TAB = "Beta access";

/** ROLE ONLY — getByText("Settings") collides with Jira's own chrome. */
function tabLocator(root: Root, name: string): Locator {
  return root.getByRole("tab", { name, exact: true }).first();
}

async function resolveAdminRoot(page: Page, timeout = 40_000): Promise<Root> {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await tabLocator(page, PROBE_TAB).isVisible({ timeout: 500 }).catch(() => false)) return page;
    const frames = await page.locator("iframe").count().catch(() => 0);
    for (let i = 0; i < frames; i++) {
      const fl = page.locator("iframe").nth(i).contentFrame();
      if (await tabLocator(fl, PROBE_TAB).isVisible({ timeout: 500 }).catch(() => false)) return fl;
    }
    if (Date.now() > deadline) throw new Error("admin page never rendered its tabs");
    await page.waitForTimeout(500);
  }
}

interface LogLine {
  at: number;
  text: string;
}

/**
 * The backend's own log window, parsed to `{at, text}`.
 *
 * `forge logs` CAPS OUTPUT AT ~30 LINES REGARDLESS OF `--since`, silently, so
 * `-n 2000` is not a tuning choice — without it a grep reports "not found" for
 * a line that is in the log, which is how a stall went undiagnosed across two
 * live runs. It also LAGS: the caller polls.
 */
async function readLogs(sinceMinutes = 20): Promise<LogLine[]> {
  const { stdout } = await execFileP(
    "npx",
    ["forge", "logs", "--environment", "development", "--since", `${sinceMinutes}m`, "-n", "2000"],
    { cwd: APP_REPO, timeout: 180_000, maxBuffer: 32 * 1024 * 1024 },
  ).catch((e) => ({ stdout: String((e as { stdout?: string })?.stdout || "") }));
  const out: LogLine[] = [];
  for (const raw of String(stdout).split("\n")) {
    const m = raw.match(/^(?:INFO|WARN|ERROR|DEBUG)\s+(\S+Z)\s+\S+\s+(.*)$/);
    if (!m) continue;
    const at = Date.parse(m[1]);
    if (Number.isFinite(at)) out.push({ at, text: m[2] });
  }
  return out;
}

/** Poll the log window until `pred` is satisfied, or give up and return what we saw. */
async function logsUntil(
  page: Page,
  pred: (lines: LogLine[]) => boolean,
  timeoutMs = 600_000,
): Promise<LogLine[]> {
  // THE LAG IS MINUTES, NOT SECONDS. Measured 5 Sep 2026 on this tenant: a line
  // written at 17:33:05 was still absent from `forge logs --since 20m` at
  // 17:35:50 and present by 17:39. A 150-second poll therefore reported "the
  // backend logged nothing", which is indistinguishable from "no request was
  // ever made" — the exact false P0 this spec exists to avoid producing.
  const deadline = Date.now() + timeoutMs;
  let lines: LogLine[] = [];
  for (;;) {
    lines = await readLogs();
    if (pred(lines)) return lines;
    if (Date.now() > deadline) {
      console.warn(
        `[websearch] the log window never showed the expected line within ` +
          `${Math.round(timeoutMs / 1000)}s (${lines.length} parsed line(s) in the window).`,
      );
      return lines;
    }
    await page.waitForTimeout(20_000);
  }
}

/** A second page with a chat surface — the only place resolvers can be called. */
async function openOdometer(page: Page) {
  const p = await page.context().newPage();
  const frame = await openGlobalPage(p, CHAT);
  await waitForChatApp(p, frame, GLOBAL_APP, 120_000);
  return { p, frame };
}

/** Send one turn through the app's own chat route and wait for the job row. */
async function runTurn(
  page: Page,
  frame: FrameLocator,
  conversationId: string,
  message: string,
  timeoutMs = 420_000,
): Promise<any> {
  await callResolver(frame, GLOBAL_APP, "createConversation", {
    conversationId,
    title: "[harness-test] web search",
    personaId: "coffee-break-ai",
  });
  const sent = await callResolver<any>(frame, GLOBAL_APP, "chat", {
    conversationId,
    message,
    personaId: "coffee-break-ai",
    personaLocked: true,
  });
  expect(sent?.success, `enqueue failed: ${JSON.stringify(sent?.error)}`).toBeTruthy();
  const deadline = Date.now() + timeoutMs;
  let data: any = null;
  while (Date.now() < deadline) {
    const r = await callResolver<any>(frame, GLOBAL_APP, "getJobStatus", { jobId: sent.jobId });
    data = r?.data ?? null;
    if (data && ["completed", "failed", "cancelled"].includes(data.status)) break;
    await page.waitForTimeout(3000);
  }
  return data;
}

test.describe.configure({ timeout: 1_500_000 });

test("a web search really leaves Atlassian and comes back cited — and a query naming an issue key never leaves at all", async ({
  page,
}) => {
  test.setTimeout(1_500_000);
  test.skip(!T.envId || !CHAT.envId, "env ids unresolved — run `npm run discover`.");
  test.skip(
    !fs.existsSync(KEY_FILE),
    `no provider key at ${KEY_FILE} — this spec cannot prove an egress without one, and a ` +
      `green tick without it would be a lie. Set CHATWISE_SEARCH_KEY_FILE.`,
  );

  // Held in a local for the length of one `fill()`. Never logged, never asserted on.
  const SEARCH_KEY = fs.readFileSync(KEY_FILE, "utf8").trim();
  expect(SEARCH_KEY.length, "the key file is empty").toBeGreaterThan(8);

  const stamp = Date.now();
  const searchConv = `conv_harness_websearch_${stamp}`;
  const refuseConv = `conv_harness_websearch_refuse_${stamp}`;
  let odo: { p: Page; frame: FrameLocator } | null = null;
  let keySaved = false;

  try {
    odo = await openOdometer(page);

    // ---- PRECONDITION: this site has no key, so ours is safe to remove -----
    const before: any = await callResolver(odo.frame, GLOBAL_APP, "getWebSearchStatus");
    expect(before?.success, `getWebSearchStatus failed: ${JSON.stringify(before)}`).toBe(true);
    test.skip(
      before.configured === true,
      "a web-search key is ALREADY configured on this site. A stored key cannot be read back, " +
        "so this spec could not restore it. Refusing to destroy a real credential.",
    );
    const policyBefore: any = await callResolver(odo.frame, GLOBAL_APP, "getToolPolicy");
    expect(policyBefore?.policy, "getToolPolicy returned no policy").toBeTruthy();

    // ---- ARM IT THE WAY AN ADMINISTRATOR DOES -----------------------------
    await assertLoggedIn(page);
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    const root = await resolveAdminRoot(page);
    await tabLocator(root, "Settings").click();
    await expect(root.getByRole("heading", { name: "Web search", exact: true })).toBeVisible({
      timeout: 20_000,
    });

    // ANCHOR ON THE BARE NAME. Forge drops the `forge-app-<hash>-` id prefix
    // after the first re-render, so `[id$="-allowWebSearch"]` matches the first
    // paint and silently stops matching afterwards.
    await root.locator('input[id$="webSearchKey"]').first().fill(SEARCH_KEY);
    await root.getByRole("button", { name: /save key/i }).click();
    keySaved = true;
    await expect(
      root.getByText("Key saved", { exact: true }),
      "no acknowledgement that the key was stored",
    ).toBeVisible({ timeout: 30_000 });

    const toggle = root.locator('input[type="checkbox"][id$="allowWebSearch"]').first();
    await expect(toggle).toBeEnabled({ timeout: 20_000 });
    await toggle.click({ force: true }); // Atlaskit hides the input under a styled track
    await expect(
      root.getByText("Web search on", { exact: true }),
      "the card did not move to the on state",
    ).toBeVisible({ timeout: 20_000 });

    // GROUND TRUTH IS THE RESOLVER, not the card's optimistic state.
    const armed: any = await callResolver(odo.frame, GLOBAL_APP, "getWebSearchStatus");
    expect(armed?.configured, "the key did not reach app storage").toBe(true);
    const polOn: any = await callResolver(odo.frame, GLOBAL_APP, "getToolPolicy");
    expect(polOn?.policy?.allowWebSearch, "the switch did not reach KVS").toBe(true);
    // The card writes the whole policy row; a blind write there re-opens levers
    // this site had shut.
    expect(polOn.policy.allowDestructive, "flipping web search changed the DELETION lever").toBe(
      policyBefore.policy.allowDestructive,
    );

    /* =================================================================== */
    /* TURN 1 — the search itself                                          */
    /* =================================================================== */
    // A question with NO identifier shape in it (no WORD-123, no UUID, no
    // *.atlassian.net), because `leakyIdentifier()` would refuse it in code and
    // the run would prove the opposite of what it set out to.
    const t1 = Date.now();
    const searchData = await runTurn(
      page,
      odo.frame,
      searchConv,
      "According to Atlassian's public developer documentation, what does the Forge CLI command " +
        "`forge eligibility` report? Search the public web for it and cite the page you used " +
        "with its URL.",
    );
    expect(searchData?.status, `search turn did not complete: ${searchData?.error}`).toBe("completed");
    const reply = String(searchData.result?.response || "");
    console.log(
      `[websearch] model=${searchData.result?.model} iterations=${searchData.result?.iterations} ` +
        `redactions=${JSON.stringify(searchData.result?.redactions)} ` +
        `usage=${JSON.stringify(searchData.result?.usage)}`,
    );
    console.log(`[websearch] reply:\n${reply.slice(0, 1500)}`);
    skipIfQuotaBlocked(reply, "websearch-tool-live/search");

    // THE TOOL LOOP RAN. One iteration means the model answered from memory and
    // never called anything.
    expect(
      Number(searchData.result?.iterations || 0),
      "the turn took a single model call, so NO tool was executed — the model answered from " +
        "memory. Either webSearch was not offered (the gate) or it was not chosen.",
    ).toBeGreaterThanOrEqual(2);

    // A CITED PAGE. The tool's whole output is links; a reply with none has
    // either not searched or thrown the result away.
    expect(
      reply,
      "the reply contains no http(s) URL at all, so nothing from the search was cited back",
    ).toMatch(/https?:\/\/\S+/);

    // `redactions` IS THE FIELD ADDED SO A LIVE TURN CAN BE CHECKED. It travels
    // job row -> message row -> getJobStatus through an explicit ALLOW-LIST, and
    // a field that is not named there is dropped in SILENCE. `null` here means
    // the consumer never wrote it, which is that defect.
    expect(
      Number.isFinite(searchData.result?.redactions),
      `getJobStatus carries redactions=${JSON.stringify(searchData.result?.redactions)}. It must ` +
        `be a number (0 is fine) — null means the vocabulary scan's count never reached the row, ` +
        `and the only way anyone can tell the corrector fired on a real tenant is gone.`,
    ).toBe(true);

    /* =================================================================== */
    /* TURN 2 — the structural refusal                                     */
    /* =================================================================== */
    const t2 = Date.now();
    const refuseData = await runTurn(
      page,
      odo.frame,
      refuseConv,
      "Search the web for what WFH-1 is about.",
    );
    expect(refuseData?.status, `refusal turn did not complete: ${refuseData?.error}`).toBe("completed");
    const refusal = String(refuseData.result?.response || "");
    console.log(
      `[websearch] refusal model=${refuseData.result?.model} ` +
        `iterations=${refuseData.result?.iterations} ` +
        `redactions=${JSON.stringify(refuseData.result?.redactions)}`,
    );
    console.log(`[websearch] refusal reply:\n${refusal.slice(0, 1500)}`);
    skipIfQuotaBlocked(refusal, "websearch-tool-live/refusal");

    // No page from the open web can be cited, because none was fetched. A link
    // to this Jira site is the model doing its job and is not a search result.
    const foreignLinks = (refusal.match(/https?:\/\/\S+/g) || []).filter(
      (u) => !/atlassian\.net|atlassian\.com/i.test(u),
    );
    expect(
      foreignLinks,
      `the refusal turn cited ${foreignLinks.length} external URL(s): ${foreignLinks.join(" ")}. ` +
        `A query naming an issue key must never reach the provider, so there is nothing out ` +
        `there to cite.`,
    ).toEqual([]);

    /* =================================================================== */
    /* THE LOGS — the consumer's own account of both turns                 */
    /* =================================================================== */
    const lines = await logsUntil(page, (ls) =>
      ls.some((l) => l.at >= t1 && /\[WebSearch\] attempt \d+/.test(l.text)),
    );
    const window1 = lines.filter((l) => l.at >= t1 && l.at < t2);
    const window2 = lines.filter((l) => l.at >= t2);
    const say = (ls: LogLine[]) =>
      ls.map((l) => `${new Date(l.at).toISOString()} ${l.text}`).join("\n") || "(nothing)";
    console.log(
      `[websearch] SEARCH-TURN log window:\n${say(
        window1.filter((l) => /\[WebSearch\]|\[Tools\] webSearch|\[Consumer\] web search|\[searchGuard\]/.test(l.text)),
      )}`,
    );
    console.log(
      `[websearch] REFUSAL-TURN log window:\n${say(
        window2.filter((l) => /\[WebSearch\]|\[Tools\] webSearch|\[Consumer\] web search|\[searchGuard\]/.test(l.text)),
      )}`,
    );

    // THE UNPROVEN HOP, SETTLED IN THE POSITIVE DIRECTION.
    // `[Consumer] toolset:` prints `allowWebSearch=<gate>`, and that gate is
    //     policy.allowWebSearch === true && (await hasSearchKey())
    // evaluated INSIDE the queue consumer. `hasSearchKey()` calls
    // `kvs.getSecret` there and fails CLOSED. So `allowWebSearch=true` on this
    // line is a direct statement that the consumer context read the stored
    // secret — the hop searchKey.js's header records as unproven.
    const gateLines = window1.filter((l) => /^\[Consumer\] toolset:/.test(l.text));
    expect(
      gateLines.map((l) => l.text),
      `no \`[Consumer] toolset:\` line in the search turn's window — the consumer never ran, so ` +
        `nothing here says anything about the secret.`,
    ).not.toEqual([]);
    expect(
      gateLines.some((l) => /allowWebSearch=true/.test(l.text)),
      `the consumer's own gate line says web search is OFF while the admin switch is ON and a ` +
        `key is stored. That means \`hasSearchKey()\` was false INSIDE the queue consumer — ` +
        `kvs.getSecret in that context. Lines were:\n${say(gateLines)}`,
    ).toBe(true);

    // THE UNPROVEN HOP, NAMED. `readSearchKey()` prints this exact line when
    // `kvs.getSecret` throws, and it fails closed — so without the log line the
    // symptom is indistinguishable from an unconfigured install.
    const refused = lines.filter((l) => l.at >= t1 && /kvs\.getSecret REFUSED/.test(l.text));
    expect(
      refused.map((l) => l.text),
      "the consumer could not read the stored key: `kvs.getSecret` REFUSED inside the queue " +
        "consumer. That is the hop searchKey.js records as unproven, and it fails CLOSED, so " +
        "every surface would show 'web search is simply not offered'.",
    ).toEqual([]);

    // THE REQUEST ACTUALLY LEFT. serperClient logs one line per attempt.
    const attempts1 = window1.filter((l) => /\[WebSearch\] attempt \d+/.test(l.text));
    expect(
      attempts1.length,
      "no `[WebSearch] attempt` line in the search turn's window, so no request was ever made " +
        "to the provider — whatever the reply said, it did not come from the web.",
    ).toBeGreaterThanOrEqual(1);
    expect(
      attempts1.some((l) => /status=ok/.test(l.text)),
      `the provider never answered ok. Attempts were:\n${say(attempts1)}`,
    ).toBe(true);
    expect(
      window1.some((l) => /^\[Tools\] webSearch/.test(l.text)),
      "the executor never logged `[Tools] webSearch`, so the tool the model named was not this one",
    ).toBe(true);

    // AND ZERO REQUESTS ON THE REFUSAL TURN. This is the assertion the reply
    // text cannot make: a model that searched and stayed quiet looks identical.
    const attempts2 = window2.filter((l) => /\[WebSearch\] attempt \d+/.test(l.text));
    expect(
      attempts2.map((l) => l.text),
      `${attempts2.length} provider request(s) were made on a turn whose query named an issue ` +
        `key. leakyIdentifier() must refuse BEFORE the client is reached, so this count is 0 ` +
        `or the guarantee is not one.`,
    ).toEqual([]);
    // WHICH MECHANISM held the line is recorded, not asserted — there are two
    // and either is correct. `leakyIdentifier()` refuses in CODE before a
    // request is built; the tool's own description ("Never about this Jira site
    // or its issues — it cannot see them") can make the model not reach for it
    // at all. What must NEVER happen is the request, and that is the assertion
    // above. What must never happen SILENTLY is a call that got through both:
    // so if the executor ran webSearch on this turn, the code refusal has to be
    // in the window.
    const calledOnRefusalTurn = window2.some((l) => /^\[Tools\] webSearch/.test(l.text));
    const structurallyRefused = window2.some((l) =>
      /\[WebSearch\] refused: the query names/.test(l.text),
    );
    console.log(
      `[websearch] refusal turn: webSearch called=${calledOnRefusalTurn} ` +
        `leakyIdentifier refused=${structurallyRefused}`,
    );
    if (calledOnRefusalTurn) {
      expect(
        structurallyRefused,
        `the model DID call webSearch on a query naming an issue key and leakyIdentifier() did ` +
          `not refuse it. Lines in the refusal window:\n${say(window2)}`,
      ).toBe(true);
    }
  } finally {
    // RESTORE, from scratch if the body died. Never leave a key or an egress
    // switch on a shared tenant.
    try {
      const o = odo ?? (await openOdometer(page));
      await callResolver(o.frame, GLOBAL_APP, "deleteConversation", { conversationId: searchConv }).catch(() => {});
      await callResolver(o.frame, GLOBAL_APP, "deleteConversation", { conversationId: refuseConv }).catch(() => {});
      const pol: any = await callResolver(o.frame, GLOBAL_APP, "getToolPolicy").catch(() => null);
      if (pol?.policy?.allowWebSearch === true) {
        await callResolver(o.frame, GLOBAL_APP, "saveToolPolicy", {
          policy: { ...pol.policy, allowWebSearch: false },
        }).catch(() => {});
      }
      if (keySaved) await callResolver(o.frame, GLOBAL_APP, "deleteWebSearchKey").catch(() => {});
      const final: any = await callResolver(o.frame, GLOBAL_APP, "getWebSearchStatus").catch(() => null);
      const finalPol: any = await callResolver(o.frame, GLOBAL_APP, "getToolPolicy").catch(() => null);
      console.log(
        `[restore] websearch configured=${final?.configured} allowWebSearch=${finalPol?.policy?.allowWebSearch}`,
      );
      if (final?.configured === true || finalPol?.policy?.allowWebSearch === true) {
        console.warn("[restore] WEB SEARCH WAS LEFT ON OR KEYED on a shared tenant — remove it by hand.");
      }
      await o.p.close().catch(() => {});
    } catch (e) {
      console.warn(`[restore] could not verify the restore: ${(e as Error)?.message}`);
    }
  }
});
