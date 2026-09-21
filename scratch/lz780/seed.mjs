import { createIssue, setDates, linkBlocks, transitionByName } from "../../data/jira-build.mjs";
import { get, searchJql } from "../../data/jira.mjs";
import { hook, sleep } from "./rest.mjs";
import fs from "fs";

const PROJECT = "WFH";
const tag = "LZ780";
const fc = (await hook("what=fieldConfig")).fields;
console.log("FIELDS", JSON.stringify(fc));

const mk = async (type, summary, fields = {}) =>
  (await createIssue({ projectKey: PROJECT, issueType: type, summary: `[harness-test] ${tag} ${summary}`, fields })).key;

const epic = await mk("Epic", "Rollout programme");
const A = await mk("Work package", "A Foundation",        { parent: { key: epic } });
const B = await mk("Work package", "B Build",             { parent: { key: epic } });
const C = await mk("Work package", "C Cutover",           { parent: { key: epic } });
const D = await mk("Work package", "D Signoff (done)",    { parent: { key: epic } });
const Q = await mk("Work package", "Q Legacy prep (done)",{ parent: { key: epic } });
const P = await mk("Work package", "P Past follow-up",    { parent: { key: epic } });
const U = await mk("Work package", "U Vendor contract renewal", { parent: { key: epic } });
const R = await mk("Work package", "R Comms pack",        { parent: { key: epic } });

await setDates(epic, { start: "2026-09-21", due: "2026-10-23", duration: 25, buffer: "No" }, fc);
await setDates(A, { start: "2026-09-21", due: "2026-09-25", duration: 5, buffer: "No" }, fc);
await setDates(B, { start: "2026-10-01", due: "2026-10-07", duration: 5, buffer: "No" }, fc);
await setDates(C, { start: "2026-10-08", due: "2026-10-14", duration: 5, buffer: "No" }, fc);
await setDates(D, { start: "2026-09-21", due: "2026-09-25", duration: 5, buffer: "No" }, fc);
await setDates(Q, { start: "2026-08-24", due: "2026-08-28", duration: 5, buffer: "No" }, fc);
await setDates(P, { start: "2026-10-19", due: "2026-10-23", duration: 5, buffer: "No" }, fc);
await setDates(R, { start: "2026-10-19", due: "2026-10-23", duration: 5, buffer: "No" }, fc);
// U: deliberately NO dates at all.

await linkBlocks(A, B);
await linkBlocks(B, C);
await linkBlocks(A, D);
await linkBlocks(Q, P);

await transitionByName(D, "Done");
await transitionByName(Q, "Done");

const all = [epic, A, B, C, D, Q, P, U, R];
const jql = `key in (${all.join(",")})`;
for (let i = 0; i < 60; i++) {
  const found = await searchJql(jql, ["summary"], 60);
  const ci = await get(`/rest/api/3/issue/${C}?fields=issuelinks`);
  if (found.length === all.length && (ci.fields.issuelinks || []).length) break;
  await sleep(3000);
}
fs.writeFileSync(new URL("./bed.json", import.meta.url), JSON.stringify({ tag, epic, A, B, C, D, Q, P, U, R, all, jql }, null, 2));
console.log("SEEDED", all.length, JSON.stringify({ epic, A, B, C, D, Q, P, U, R }));
