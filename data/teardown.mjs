// Per-run artifact registry + cleanup, so deep scenarios leave the testbed clean.
// Scenarios register what they create; the global teardown deletes it.
import { deleteIssue } from "./jira-build.mjs";
import { deletePage } from "./confluence.mjs";

const registry = []; // { kind: 'issue'|'page', id }

export function track(kind, id) { registry.push({ kind, id }); return id; }
export function trackIssue(key) { return track("issue", key); }
export function trackPage(id) { return track("page", id); }

export async function cleanup() {
  const errs = [];
  for (const { kind, id } of registry.reverse()) {
    try {
      if (kind === "issue") await deleteIssue(id);
      else if (kind === "page") await deletePage(id);
    } catch (e) { errs.push(`${kind} ${id}: ${e.message}`); }
  }
  registry.length = 0;
  if (errs.length) console.warn("teardown issues:\n" + errs.join("\n"));
}
