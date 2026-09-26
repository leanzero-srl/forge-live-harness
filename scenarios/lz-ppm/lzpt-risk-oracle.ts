// Jira oracle for the LZPT schedule-risk journeys (B-63, dev 7.19.0). Computed from Jira itself, never
// from the app: leaves (issues nothing in the project names as parent), open overdue leaves (not done,
// dated, due strictly before today UTC — the Dashboard's Overdue tile), at-risk (due within 0..5 days)
// and the longest "Blocks" chain behind each leaf, which bounds what a NON-overdue leaf can score.
//
// THE RULE UNDER TEST (B-4, plan-metrics.js computeRiskScores, deployed 7.19.0): an open leaf past its
// date scores RISK_RED (60) + min(20, calendar days late) + depth*3 + slip*4, so it is ALWAYS red; a
// non-overdue open leaf scores depth*3 + (at risk ? 15 : 0) + slip*4 + buffer depletion. LZPT seeds no
// baseline and no buffers (slip/depletion 0), so a non-overdue leaf is amber only if depth*3 + 15 >= 30.
export type LzptOracle = {
  leaves: number; done: number; overdue: number; atRisk: number; openLeaves: number;
  overdueKeys: string[]; maxDepthNonOverdue: number; ampleAmber: number;
};

export async function lzptOracle(page: any): Promise<LzptOracle> {
  return page.evaluate(async () => {
    const res = await fetch("/rest/api/3/search/jql", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" }, credentials: "include", body: JSON.stringify({ jql: "project = LZPT", maxResults: 200, fields: ["status", "duedate", "parent", "issuelinks"] }) });
    const d = await res.json();
    const issues: any[] = d.issues || [];
    if (d.isLast === false) throw new Error("LZPT grew past one page — widen the oracle");
    const keys = new Set(issues.map((i) => i.key));
    const parentSet = new Set(issues.map((i) => i.fields.parent?.key).filter(Boolean));
    const preds = new Map<string, string[]>();
    for (const i of issues) {
      const p: string[] = [];
      for (const l of i.fields.issuelinks || []) if (l.type?.name === "Blocks" && l.inwardIssue && keys.has(l.inwardIssue.key)) p.push(l.inwardIssue.key);
      preds.set(i.key, p);
    }
    const memo = new Map<string, number>();
    const depth = (k: string, path: Set<string>): number => {
      if (memo.has(k)) return memo.get(k)!;
      let best = 0;
      for (const p of preds.get(k) || []) best = Math.max(best, path.has(p) ? 1 : 1 + depth(p, new Set([...path, p])));
      memo.set(k, best); return best;
    };
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    let leaves = 0, done = 0, overdue = 0, atRisk = 0, openLeaves = 0, maxDepthNonOverdue = 0, ampleAmber = 0;
    const overdueKeys: string[] = [];
    for (const i of issues) {
      if (parentSet.has(i.key)) continue;
      leaves += 1;
      if (i.fields.status?.statusCategory?.key === "done") { done += 1; continue; }
      openLeaves += 1;
      const due = i.fields.duedate;
      let dleft: number | null = null;
      if (due) { const p = due.split("-").map(Number); dleft = Math.round((Date.UTC(p[0], p[1] - 1, p[2]) - today) / 86400000); }
      if (dleft != null && dleft < 0) { overdue += 1; overdueKeys.push(i.key); continue; }
      const risky = dleft != null && dleft <= 5;
      if (risky) atRisk += 1;
      const dep = depth(i.key, new Set([i.key]));
      maxDepthNonOverdue = Math.max(maxDepthNonOverdue, dep);
      if (dep * 3 + (risky ? 15 : 0) >= 30) ampleAmber += 1;
    }
    return { leaves, done, overdue, atRisk, openLeaves, overdueKeys: overdueKeys.sort(), maxDepthNonOverdue, ampleAmber };
  });
}

/** Open LZPT from the Plans page and switch to the Dashboard. */
export async function openLzptDashboard(page: any, frame: any, plan = "LZPT Scenarios") {
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 90_000 }).catch(() => {});
  for (let i = 0; i < 8; i++) {
    if (await frame.locator('[data-testid="view-tab-dashboard"]').count()) break;
    await frame.locator('[data-testid="plan-card-name"]').filter({ hasText: plan }).first().click().catch(() => {});
    await page.waitForTimeout(3000);
  }
  await frame.locator('[data-testid="view-tab-dashboard"]').first().click();
  await page.waitForTimeout(3500);
}
