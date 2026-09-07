const says = (t) =>
  /stored (site )?admin|administrator who stored|administrator token/i.test(t) ||
  /administrator whose (site )?(token|credential)/i.test(t) ||
  /\b(token|credential)s? (that is |that's |)stored\b/i.test(t) ||
  /audit log will (name|show)/i.test(t) ||
  /not as you\b/i.test(t);
const CASES = [
  [true ,"13.18.0","This runs as **the administrator whose site token is stored in ChatWise**, not as you. Your own permissions aren't used, and the **audit log will name that administrator** as the person who created the account."],
  [true ,"13.14.0","The action runs under the site's stored admin credentials, not your personal account, and the audit log will show that administrator as the one who made the change, not you."],
  [true ,"13.17.0 undo","This ran as the administrator whose credentials are stored in this installation, not as you — the audit log will name that administrator."],
  [false,"silent (13.16.0 shape)","A new Atlassian account would be created for that address, with no product access. Atlassian emails that address an invitation. It is reversible for 30 days, but the reversal deletes the account."],
  [false,"unrelated","There are 11 project categories on this site."],
];
let bad=0;
for (const [w,n,t] of CASES){const g=says(t);const ok=g===w;console.log(`${ok?"ok  ":"FAIL"} ${String(g).padEnd(5)} (want ${String(w).padEnd(5)}) ${n}`);if(!ok)bad++;}
console.log(bad?`\n${bad} FAILURE(S)`:"\nthe authority predicate discriminates");
