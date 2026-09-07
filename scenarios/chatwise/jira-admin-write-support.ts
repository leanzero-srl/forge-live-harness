// Shared plumbing for the JIRA ADMINISTRATION WRITE specs (cuts C, A, B1, B2, B3).
//
// Five specs drive the same machinery: switch the policy rows on, take a turn as
// the Jira Administrator on the global page, read the `[Consumer] toolset:` line,
// score the tool outcome, pull the undo id out of the reply, and put the policy
// back. Hand-rolling that five times is the duplication this repo has paid for
// repeatedly — the six journeys that each rolled their own `send`, of which five
// were wrong.
//
// WHAT IS DELIBERATELY *NOT* HERE: the admin PAGE's toggle chain. That is a
// claim about the card and it is asserted once, in the write probe, by clicking.
// Every other spec sets the policy through `saveToolPolicy` and reads it back
// through `getToolPolicy`, because what decides a turn is the stored row and not
// the checkbox — and a spec about workflow schemes should not go red because a
// decorative span intercepted a click.
import { expect } from "@playwright/test";
import type { Page, FrameLocator } from "@playwright/test";
import {
  GLOBAL_APP,
  QUOTA_BUBBLE,
  callResolver,
  describeLogs,
  logWindow,
  scoreToolOutcome,
} from "./chatwise-support";

/** The five rows the administration surface reads. */
export const ADMIN_POLICY_ROWS = [
  "allowJiraAdminTools",
  "allowJiraAdminWrites",
  "allowJiraAdminDestroy",
  "allowDestructive",
] as const;

/** The undo id as the ledger mints it — `rv_<base36>_<10>` and nothing else. */
export function undoIdIn(text: string): string | null {
  return (text.match(/\b(rv_[a-z0-9]+_[a-z0-9]{6,})\b/) || [])[1] || null;
}

/**
 * Did the reply COMPLAIN about drift, as opposed to mentioning the word?
 *
 * `/drift/i` matched "No drift was detected — nothing else changed", which is
 * the tool reporting the opposite. A negated word is not a complaint.
 */
export function complainsOfDrift(t: string): boolean {
  const negated = /\b(no|without|zero)\s+(drift|changes?)\b/i.test(t) || /nothing else changed/i.test(t);
  const claims =
    /\bdrift(ed)?\b/i.test(t) ||
    /changed since|no longer matches|someone else (has )?changed|has been modified since/i.test(t);
  return claims && !negated;
}

/**
 * The `[Confirmation] … blast radius changed` lines that MATTER.
 *
 * ⚠️ ONE SHAPE OF THIS LINE IS THE APP TALKING TO ITSELF. The executor redeems
 * against the ACKNOWLEDGED radius first and the plain one second, so every write
 * where no lockout or gravity turn fired logs a WARN naming exactly
 * `lockoutAcknowledged` (or `gravityAcknowledged`) and then succeeds. Treating
 * that as the defect fails every healthy write.
 *
 * Everything else is a user's yes being thrown away, which is the failure this
 * whole surface exists to prevent.
 */
export function realRadiusDrift(lines: { text: string }[]): { text: string }[] {
  const BENIGN = new Set(["lockoutAcknowledged", "gravityAcknowledged"]);
  return lines
    .filter((l) => /^\[Confirmation\].*blast radius changed/.test(l.text))
    .filter((l) => {
      const named = (l.text.match(/differs:\s*([^)]*)/) || [])[1] || "";
      const parts = named.split(/[,\s]+/).filter(Boolean);
      if (parts.length === 1 && BENIGN.has(parts[0])) return false;
      /**
       * ⚠️ A REFUSAL THAT NAMES `op` IS THE GUARD WORKING, NOT THE N1 DEFECT
       * (measured 13.13.0, and this predicate reported it as four P0s).
       *
       * The org cycle's product step found nothing to grant, so its ask minted
       * no ticket; the yes turn then redeemed against the ticket still pending
       * from the ROLE step, and the app refused with
       *   differs: act, act.accountId, act.resource, act.role, op
       * A ticket raised for `assignOrgRole` must not be spendable on
       * `grantProductAccess`, and the honest reading of that line is "you are
       * redeeming a DIFFERENT OPERATION".
       *
       * N1 is the opposite shape and only that shape: the SAME operation, with
       * argument keys the user never saw moving between the disclosing turn and
       * the redeeming one. `op` in the diff is the discriminator, and without it
       * every correctly-refused cross-operation redemption reads as a consent
       * gate eating a yes.
       */
      if (parts.includes("op")) return false;
      return true;
    });
}

/** The refusals that were CORRECT: a ticket spent on a different operation. */
export function crossOperationRefusals(lines: { text: string }[]): { text: string }[] {
  return lines.filter(
    (l) =>
      /^\[Confirmation\].*blast radius changed/.test(l.text) &&
      ((l.text.match(/differs:\s*([^)]*)/) || [])[1] || "").split(/[,\s]+/).includes("op"),
  );
}

export interface AdminTurn {
  reply: string;
  win: { at: number; text: string }[];
  toolset: string;
  /** `scoreToolOutcome` for the tool this turn was expected to use. */
  score: (tool: string) => ReturnType<typeof scoreToolOutcome>;
  undoId: string | null;
  drift: { text: string }[];
}

/**
 * A turn factory bound to one conversation.
 *
 * `issueKey` IS WHAT MAKES A TURN A PANEL TURN — the consumer decides
 * `inIssuePanel` from `job.issueKey` and `chat.routes.js` takes it off the
 * payload. Omitting it on a panel frame produces `profile=standard`, which reads
 * exactly like the write group leaking into the panel. It is a parameter here so
 * that mistake cannot be made twice.
 */
export function adminTurns(
  page: Page,
  frameOf: () => FrameLocator,
  conversationId: string,
  opts: { appKey?: string; issueKey?: string | null; personaId?: string; gapMs?: number; quotaWaitMs?: number } = {},
) {
  const app = opts.appKey || GLOBAL_APP;
  const personaId = opts.personaId || "jira-admin";
  const quotaWaitMs = opts.quotaWaitMs ?? Number(process.env.CHATWISE_QUOTA_WAIT_MS || 960_000);

  async function once(label: string, message: string): Promise<AdminTurn> {
    const t0 = Date.now();
    const frame = frameOf();
    const sent: any = await callResolver(frame, app, "chat", {
      conversationId, message, personaId, personaLocked: true,
      ...(opts.issueKey ? { issueKey: opts.issueKey } : {}),
    });
    expect(sent?.success, `${label}: enqueue failed: ${JSON.stringify(sent?.error)}`).toBeTruthy();
    let data: any = null;
    const deadline = Date.now() + 600_000;
    while (Date.now() < deadline) {
      const r: any = await callResolver(frame, app, "getJobStatus", { jobId: sent.jobId });
      data = r?.data ?? null;
      if (data && ["completed", "failed", "cancelled"].includes(data.status)) break;
      await page.waitForTimeout(3000);
    }
    expect(data?.status, `${label}: job did not complete: ${data?.error}`).toBe("completed");
    const reply = String(data.result?.response || "");
    const lines = await logWindow(
      page,
      (ls) => ls.some((l) => l.at >= t0 && /^\[Consumer\] toolset:/.test(l.text)),
      { label: `${label} consumer line` },
    );
    const win = lines.filter((l: any) => l.at >= t0);
    const texts = win.map((l: any) => l.text);
    console.log(
      `\n######## ${label}\nASK: ${message}\nBUBBLE:\n${reply.slice(0, 2000)}\nLOG:\n` +
        describeLogs(win.filter((l: any) =>
          /^\[Tools\]|^\[Consumer\] toolset|^\[JiraAdmin\]|^\[SiteToken\]|^\[OrgAdmin\]|^\[Confirmation\]|^\[Ledger\]|^\[Withdrawal\]|^\[Offer\]|^\[Revert\]/.test(l.text))),
    );
    const drift = realRadiusDrift(win as any);
    if (drift.length) console.log(`[radius] ${label}: REAL DRIFT -> ${drift.map((d) => d.text).join(" | ")}`);
    return {
      reply, win: win as any,
      toolset: win.find((l: any) => /^\[Consumer\] toolset:/.test(l.text))?.text || "",
      score: (tool: string) => scoreToolOutcome(tool, texts),
      undoId: undoIdIn(reply),
      drift,
    };
  }

  /** The same turn, retried once after the rolling model quota has cleared. */
  async function turn(label: string, message: string): Promise<AdminTurn> {
    let r = await once(label, message);
    if (QUOTA_BUBBLE.test(r.reply)) {
      console.log(`[quota] ${label} blocked; waiting ${Math.round(quotaWaitMs / 1000)}s, one retry`);
      await page.waitForTimeout(quotaWaitMs);
      r = await once(`${label}-retry`, message);
    }
    return r;
  }
  return { turn };
}

/** Read one flag's value out of a `[Consumer] toolset:` line. */
export function gateIn(line: string, flag: string): string {
  return (line.match(new RegExp(`${flag}=(true|false(?:\\([^)]*\\))?)`)) || [])[1] || "(absent)";
}

/**
 * Set the administration policy rows and PROVE the store agrees.
 *
 * Through the resolver, not the card: what decides a turn is the stored row.
 * Returns the policy as it was, for `finally`.
 */
export async function setAdminPolicy(
  frame: FrameLocator,
  patch: Partial<Record<(typeof ADMIN_POLICY_ROWS)[number], boolean>>,
): Promise<any> {
  const before: any = await callResolver(frame, GLOBAL_APP, "getToolPolicy", {});
  const was = before?.policy || before;
  await callResolver(frame, GLOBAL_APP, "saveToolPolicy", { policy: { ...was, ...patch } });
  const after: any = await callResolver(frame, GLOBAL_APP, "getToolPolicy", {});
  const now = after?.policy || after;
  for (const [k, v] of Object.entries(patch)) {
    expect(
      now?.[k] === true,
      `the policy row ${k} did not store as ${v} — it reads ${now?.[k]}. A row the admin page ` +
        `writes and the consumer does not read is a lever that is believed and does nothing.`,
    ).toBe(v === true);
  }
  console.log(
    `[policy] ${ADMIN_POLICY_ROWS.map((k) => `${k}=${now?.[k]}`).join(" ")}`,
  );
  return was;
}

/** Put the policy back exactly as it was, and say so when it will not go. */
export async function restoreAdminPolicy(frame: FrameLocator, was: any): Promise<void> {
  if (!was) return;
  await callResolver(frame, GLOBAL_APP, "saveToolPolicy", { policy: was });
  const after: any = await callResolver(frame, GLOBAL_APP, "getToolPolicy", {});
  const now = after?.policy || after;
  for (const k of ADMIN_POLICY_ROWS) {
    if ((now?.[k] === true) !== (was?.[k] === true)) {
      console.warn(`[restore] ${k} did NOT go back to ${was?.[k]} — it reads ${now?.[k]}`);
    }
  }
  console.log(`[restore] policy: ${ADMIN_POLICY_ROWS.map((k) => `${k}=${now?.[k]}`).join(" ")}`);
}

/**
 * The two-turn shape every write on this surface has, asserted once.
 *
 * `ask` must change NOTHING and must ask; `yes` must land and must STATE its
 * undo id. Returns both turns so a caller can make its own claims about the
 * words. The REST check is the caller's — only it knows what "landed" means.
 */
export async function askThenYes(
  turns: { turn: (l: string, m: string) => Promise<AdminTurn> },
  label: string,
  ask: string,
  yes = "Yes, do it.",
  gapMs = Number(process.env.CHATWISE_TURN_GAP_MS || 300_000),
  page?: Page,
  /**
   * ⚠️ MEASURED BETWEEN THE TWO TURNS, and it exists because the alternative
   * cannot work. "The asking turn changed NOTHING" is the more important half
   * of this contract, and it is only true in the window between the ask and the
   * yes — a caller checking after the yes is asserting the opposite of what it
   * means. `jira-admin-field-writes` carried exactly that check after the yes,
   * where it could only ever have been wrong, and it was written `.toBeNull`
   * with no call, so it never ran and nobody found out.
   */
  between?: () => Promise<void>,
): Promise<{ ask: AdminTurn; yes: AdminTurn }> {
  const a = await turns.turn(`${label}-ask`, ask);
  const asked = /confirm|say yes|shall I|would you like|go ahead|proceed|do you want/i.test(a.reply);
  expect.soft(asked, `${label}: the asking turn did not ask:\n${a.reply.slice(0, 800)}`).toBe(true);
  if (between) await between();
  if (page) await page.waitForTimeout(gapMs);
  const y = await turns.turn(`${label}-yes`, yes);
  expect.soft(
    y.drift.map((d) => d.text),
    `${label}: the user's yes was refused because the confirmation radius changed between the ` +
      `disclosing turn and the redeeming one. An argument the user never saw must not be able to ` +
      `invalidate their consent.`,
  ).toEqual([]);
  return { ask: a, yes: y };
}
