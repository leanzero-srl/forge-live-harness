// CogniRunner rule-exercise LAB helpers: set a persisted field, read the live execution logs
// (via the restored test-hook), and wait for a rule's verdict log. Composes with
// cogni-workflow.mjs (attach) + jira.mjs (doTransition). Deep BACKEND test: push a rule → set
// issue state → transition → assert the LOG verdict matches the rule's intended behaviour.
import { request } from "./jira.mjs";

const HOOK = process.env.COGNI_TESTHOOK_URL;
const SECRET = process.env.HARNESS_SECRET;

export async function setField(key, fields) {
  return request("PUT", `/rest/api/3/issue/${key}`, { body: { fields } });
}

export async function execLogs() {
  const r = await fetch(`${HOOK}?what=execlogs`, { headers: { Authorization: `Bearer ${SECRET}` } });
  if (!r.ok) throw new Error(`execlogs ${r.status}`);
  const d = await r.json();
  return d.logs || [];
}

// Poll for the most-recent log entry (after sinceMs) matching pred. Absorbs write latency.
export async function waitForLog(pred, sinceMs, { tries = 10, gapMs = 2000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const logs = await execLogs();
    const hit = logs
      .filter((l) => !sinceMs || Date.parse(l.timestamp) >= sinceMs - 1500)
      .find(pred);
    if (hit) return hit;
    await new Promise((s) => setTimeout(s, gapMs));
  }
  return null;
}
