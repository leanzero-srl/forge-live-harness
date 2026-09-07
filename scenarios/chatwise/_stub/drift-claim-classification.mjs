const complains = (t) => {
  const negated =
    /\b(no|without|zero)\s+(drift|changes?)\b/i.test(t) ||
    /\bdrift\b[^.\n]{0,30}\b(none|no)\b/i.test(t) ||
    /\b(none|nothing)\b[^.\n]{0,20}\bdetected\b/i.test(t) ||
    /\bnothing\b[\w\s]{0,25}\b(changed|touched|altered|moved)\b/i.test(t) ||
    /\b(cannot|can't|could not|couldn't|unable to) (tell|say|confirm|determine|know)\b/i.test(t) ||
    /\bno snapshot\b|\bnever (got|took|recorded) a snapshot\b|\bcomparison point[\w\s]{0,20}(now|undo time)\b/i.test(t);
  const claims = /\bdrift(ed)?\b/i.test(t) || /\bchanged\b[\w\s]{0,20}\bsince\b/i.test(t) || /no longer matches|someone else (has )?changed|has been modified since/i.test(t);
  const accuses =
    /\bhas (been )?changed\b[\w\s]{0,20}\bsince\b/i.test(t) ||
    /\bdrifted\b/i.test(t) ||
    /no longer matches/i.test(t) ||
    /someone else (has )?changed/i.test(t) ||
    /has been modified since/i.test(t);
  return accuses || (claims && !negated);
};
const CASES = [
  [false,"13.13.0 membership","No drift was found — nothing else touched this membership in between, so it's back exactly as it was."],
  [false,"13.17.0 notif","**Drift:** none detected; nothing else had changed since the assignment was made"],
  [false,"plain","No drift was detected."],
  [false,"org phrasing","No drift was found — nothing else changed to this group or account in the meantime."],
  [false,"13.17.0 site-user undo","**Drift check:** nothing had changed on the account since it was created, so nothing was restored over."],
  [false,"13.16.0 site-user undo","**No drift reported:** nothing had changed on the account since it was created."],
  [false,"13.19.0 accepted-async caveat","One caveat on drift: because the original assignment was finished by Jira in the background, there was no snapshot taken at the moment it completed. The comparison point was only established just now, at undo time — so I cannot tell you whether anyone else touched the project's security scheme in between."],
  [false,"13.17.0 accepted-async caveat","because Jira accepted the original assignment and completed it asynchronously, ChatWise never got a snapshot of the project immediately after that change. No drift was reported, but that absence is weaker evidence than usual here."],
  [true ,"cannot tell AND a real accusation","I cannot confirm the full history, but the account has been changed since ChatWise created it and its email no longer matches."],
  [true ,"13.11.0 real drift","That membership has actually changed since I made this update — the group's membership record has drifted from what I last set."],
  [true ,"13.14.0 site-user","The account has been changed since ChatWise created it: its email address no longer matches what ChatWise recorded."],
  [true ,"generic","Somebody else has changed this since ChatWise touched it."],
  [false,"no mention at all","Reverted. The project is back on its previous scheme."],
];
let bad=0;
for (const [want,name,t] of CASES){const got=complains(t);const ok=got===want;console.log(`${ok?"ok  ":"FAIL"} ${String(got).padEnd(5)} (want ${String(want).padEnd(5)}) ${name}`);if(!ok)bad++;}
console.log(bad?`\n${bad} FAILURE(S)`:"\nthe drift predicate discriminates");
