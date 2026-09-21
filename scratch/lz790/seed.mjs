// TESTER (lz790 lane): seed a dedicated WFH bed for the 7.9.0 retest.
// 5-link chain A->B->C->D->E (finish-driving), 3 off-path dated leaves, 1 undated isolated leaf.
import { createIssue, setDates, linkBlocks } from "../../data/jira-build.mjs";
import { get } from "../../data/jira.mjs";

const F = { startDate: "customfield_10015", dueDate: "duedate", duration: "customfield_10180", buffer: "customfield_10181" };
const TAG = "LZ790";
const rows = [
  ["A", "2026-10-05", "2026-10-09"],
  ["B", "2026-10-12", "2026-10-16"],
  ["C", "2026-10-19", "2026-10-23"],
  ["D", "2026-10-26", "2026-10-30"],
  ["E", "2026-11-02", "2026-11-06"],
  ["X", "2026-10-05", "2026-10-07"],
  ["Y", "2026-10-06", "2026-10-08"],
  ["Z", "2026-10-07", "2026-10-09"],
  ["U", null, null],
];
const made = {};
for (const [label, start, due] of rows) {
  const r = await createIssue({ projectKey: "WFH", issueType: "Work package", summary: `${TAG} ${label} [harness-test]` });
  made[label] = r.key;
  if (start) await setDates(r.key, { start, due }, F);
  console.log("created", label, r.key, start || "(undated)");
}
for (const [p, s] of [["A","B"],["B","C"],["C","D"],["D","E"]]) {
  await linkBlocks(made[p], made[s]);
  console.log("linked", p, "->", s);
}
console.log("MAP=" + JSON.stringify(made));
