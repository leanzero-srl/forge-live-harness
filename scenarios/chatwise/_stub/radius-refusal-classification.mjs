const BENIGN = new Set(["lockoutAcknowledged","gravityAcknowledged"]);
const named = (t) => ((t.match(/differs:\s*([^)]*)/)||[])[1]||"").split(/[,\s]+/).filter(Boolean);
const real = (t) => {
  if (!/^\[Confirmation\].*blast radius changed/.test(t)) return false;
  const p = named(t);
  if (p.length===1 && BENIGN.has(p[0])) return false;
  if (p.includes("op")) return false;
  return true;
};
const CASES = [
  [false,"the self-probe","[Confirmation] applyOrgChange: blast radius changed since approval — refusing (differs: lockoutAcknowledged)"],
  [false,"the gravity probe","[Confirmation] applyOrgChange: blast radius changed since approval — refusing (differs: gravityAcknowledged)"],
  [false,"13.13.0 cross-operation","[Confirmation] applyOrgChange: blast radius changed since approval — refusing (differs: act, act.accountId, act.resource, act.role, op)"],
  [false,"cross-op + probe","[Confirmation] applyOrgChange: blast radius changed since approval — refusing (differs: act, act.accountId, act.resource, act.role, lockoutAcknowledged, op)"],
  [true ,"N1 verbatim (13.7.0)","[Confirmation] applyOrgChange: blast radius changed since approval — refusing (differs: accountIds)"],
  [true ,"N1, nested body","[Confirmation] applyOrgChange: blast radius changed since approval — refusing (differs: act.attributes)"],
  [true ,"two hidden args","[Confirmation] applyJiraConfigChange: blast radius changed since approval — refusing (differs: act.params.searchUrl, act.params.description)"],
  [true ,"probe PLUS a real one","[Confirmation] applyOrgChange: blast radius changed since approval — refusing (differs: accountIds, lockoutAcknowledged)"],
  [false,"not a radius line at all","[Confirmation] applyOrgChange: no pending ticket for this conversation"],
];
let bad=0;
for (const [want,name,t] of CASES){ const got=real(t); const ok=got===want;
  console.log(`${ok?"ok  ":"FAIL"} ${String(got).padEnd(5)} (want ${String(want).padEnd(5)}) ${name}`); if(!ok)bad++; }
console.log(bad?`\n${bad} FAILURE(S)`:"\nthe radius predicate discriminates: op => the guard worked, no op => a yes was eaten");
