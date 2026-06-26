// Jira test-data builders on top of data/jira.mjs (deterministic setup for live tests).
import { get, post, request, doTransition, getTransitions } from "./jira.mjs";

export async function findProject(key) {
  try { return await get(`/rest/api/3/project/${key}`); } catch { return null; }
}

export async function createIssue({ projectKey, issueType = "Task", summary, fields = {} }) {
  const body = { fields: { project: { key: projectKey }, issuetype: { name: issueType }, summary, ...fields } };
  return post("/rest/api/3/issue", body);
}

export async function setFields(key, fields) {
  await request("PUT", `/rest/api/3/issue/${key}`, { body: { fields }, raw: true });
}

/**
 * Set the four scheduling fields using the app's EFFECTIVE field-id mapping
 * (from the app's _testState hook — live wolfaenpak IDs differ from code defaults).
 * fieldIds: { startDate, dueDate, duration, buffer } (dueDate is usually native "duedate").
 */
export async function setDates(key, { start, due, duration, buffer }, fieldIds) {
  const f = {};
  if (start !== undefined) f[fieldIds.startDate] = start;
  if (due !== undefined) f[fieldIds.dueDate] = due; // "duedate" native or a customfield
  if (duration !== undefined) f[fieldIds.duration] = duration;
  if (buffer !== undefined) f[fieldIds.buffer] = { value: buffer }; // select option
  await setFields(key, f);
}

/**
 * Make A a predecessor of B (A.successors includes B, B.predecessors includes A)
 * in lz-ppm's model. Empirically, lz-ppm derives predecessors from the OUTWARD
 * "Blocks" direction, so to get A→B we create the link with A on the inward side.
 */
export async function linkBlocks(predKey, succKey) {
  return post("/rest/api/3/issueLink", {
    type: { name: "Blocks" },
    inwardIssue: { key: predKey },
    outwardIssue: { key: succKey },
  });
}

export async function transitionByName(key, statusName, fields) {
  const t = await getTransitions(key);
  const match = (t.transitions || []).find((x) => x.to?.name?.toLowerCase() === statusName.toLowerCase() || x.name?.toLowerCase() === statusName.toLowerCase());
  if (!match) throw new Error(`no transition to "${statusName}" on ${key}; have: ${(t.transitions || []).map((x) => x.name).join(", ")}`);
  return doTransition(key, match.id, fields);
}

export async function deleteIssue(key) {
  return request("DELETE", `/rest/api/3/issue/${key}?deleteSubtasks=true`, { raw: true });
}

export { doTransition, getTransitions };
