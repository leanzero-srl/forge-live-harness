const complains = (t) => {
  const negated =
    /\b(no|without|zero)\s+(drift|changes?)\b/i.test(t) ||
    /\bdrift\b[^.\n]{0,30}\b(none|no)\b/i.test(t) ||
    /\b(none|nothing)\b[^.\n]{0,20}\bdetected\b/i.test(t) ||
    /nothing else\b[\w\s]{0,20}\bchanged\b/i.test(t) ||
    /nothing else\b[\w\s]{0,20}\btouched\b/i.test(t);
  const claims = /\bdrift(ed)?\b/i.test(t) || /\bchanged\b[\w\s]{0,20}\bsince\b/i.test(t) || /no longer matches|someone else (has )?changed|has been modified since/i.test(t);
  return claims && !negated;
};
const CASES = [
  [false,"13.13.0 membership","No drift was found — nothing else touched this membership in between, so it's back exactly as it was."],
  [false,"13.17.0 notif","**Drift:** none detected; nothing else had changed since the assignment was made"],
  [false,"plain","No drift was detected."],
  [false,"org phrasing","No drift was found — nothing else changed to this group or account in the meantime."],
  [true ,"13.11.0 real drift","That membership has actually changed since I made this update — the group's membership record has drifted from what I last set."],
  [true ,"13.14.0 site-user","The account has been changed since ChatWise created it: its email address no longer matches what ChatWise recorded."],
  [true ,"generic","Somebody else has changed this since ChatWise touched it."],
  [false,"no mention at all","Reverted. The project is back on its previous scheme."],
];
let bad=0;
for (const [want,name,t] of CASES){const got=complains(t);const ok=got===want;console.log(`${ok?"ok  ":"FAIL"} ${String(got).padEnd(5)} (want ${String(want).padEnd(5)}) ${name}`);if(!ok)bad++;}
console.log(bad?`\n${bad} FAILURE(S)`:"\nthe drift predicate discriminates");
