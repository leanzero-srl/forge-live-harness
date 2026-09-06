#!/usr/bin/env node
// Owned, retained Assets fixture for the LZ campaign. Shared field/schema/object
// configuration is read only. Explicit cleanup refuses to touch an unowned issue.
import fs from 'node:fs';
import path from 'node:path';
import { get, post, put, request, BASE } from '../data/jira.mjs';

const verb = process.argv[2] || 'status';
const output = path.resolve('evidence/lz-campaign/assets-fixture.json');
const marker = 'lz-campaign-assets-202609';
const fieldId = 'customfield_11081';
const workspaceId = 'be9cca2f-5f41-446f-8f5c-76cda0be8417';
const objectId = '71';
const safe = value => Array.isArray(value) ? value.map(safe) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).filter(([k]) => !/token|secret|authorization|cookie|avatar/i.test(k)).map(([k,v]) => [k, safe(v)])) : value;
const save = state => { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(safe(state), null, 2) + '\n'); };
if (BASE !== 'https://wolfaenpak.atlassian.net') throw new Error('Fixture is scoped to wolfaenpak only');
if (!['seed', 'status', 'cleanup'].includes(verb)) throw new Error('Use seed | status | cleanup');
let state = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : null;
async function owned(key, expanded = false) {
  const expand = expanded ? `&expand=names,schema,${fieldId}.cmdb.label,${fieldId}.cmdb.objectKey,${fieldId}.cmdb.attributes` : '';
  const issue = await get(`/rest/api/3/issue/${key}?fields=summary,labels,project,${fieldId}${expand}`);
  if (issue.fields.project.key !== 'JT' || !issue.fields.labels?.includes(marker) || !issue.fields.summary.includes('[harness-test]')) throw new Error(`Ownership mismatch on ${key}`);
  return issue;
}
if (verb === 'cleanup') {
  if (!state?.key || state.deletedAt) throw new Error('No active owned fixture recorded');
  await owned(state.key);
  await request('DELETE', `/rest/api/3/issue/${state.key}`);
  const verify = await request('GET', `/rest/api/3/issue/${state.key}`, { raw: true });
  if (verify.status !== 404) throw new Error(`Delete not verified: ${verify.status}`);
  save({ ...state, deletedAt: new Date().toISOString(), deleteVerifiedStatus: verify.status });
  console.log(JSON.stringify({ key: state.key, deleted: true }));
  process.exit(0);
}
if (verb === 'status') {
  if (!state?.key || state.deletedAt) { console.log(JSON.stringify({ status: 'not_seeded', state })); process.exit(0); }
  const issue = await owned(state.key);
  console.log(JSON.stringify({ status: 'retained', key: issue.key, assets: issue.fields[fieldId], stateFile: output }, null, 2));
  process.exit(0);
}
// Positive controls on this actual project/type and object, before any creation.
const control = await get(`/rest/api/3/issue/JT-16?fields=project,issuetype,${fieldId}`);
const types = await get('/rest/api/3/issue/createmeta/JT/issuetypes');
if (control.fields.project.key !== 'JT' || !Object.hasOwn(control.fields, fieldId)
  || !types.issueTypes?.some(t => t.id === control.fields.issuetype.id)) throw new Error('JT positive create/field control failed');
const asset = await get(`https://api.atlassian.com/jsm/assets/workspace/${workspaceId}/v1/object/${objectId}`);
if (String(asset.id) !== objectId || !asset.label) throw new Error('The referenced Assets object is not readable');
if (state?.key && !state.deletedAt) {
  await owned(state.key);
} else {
  const fields = { project: { key: 'JT' }, issuetype: { id: control.fields.issuetype.id }, summary: '[harness-test] LZ campaign Assets source', labels: [marker] };
  const created = await post('/rest/api/3/issue', { fields });
  state = { key: created.key, id: created.id, marker, fieldId, workspaceId, objectId, createdAt: new Date().toISOString(), purpose: 'Retained campaign fixture until UAT; only this issue is owned, shared Assets config is not.' };
  save(state); // survive a later population/read failure without losing ownership
}
const reference = { workspaceId, id: `${workspaceId}:${objectId}`, objectId };
await put(`/rest/api/3/issue/${state.key}`, { fields: { [fieldId]: [reference] } });
const first = await owned(state.key);
const second = await owned(state.key, true);
for (const issue of [first, second]) {
  const values = issue.fields[fieldId];
  if (!Array.isArray(values) || values.length !== 1 || values[0].objectId !== objectId || values[0].workspaceId !== workspaceId) throw new Error(`Assets reference not stored on ${state.key}`);
}
state = safe({ ...state, verifiedAt: new Date().toISOString(), object: { id: asset.id, objectKey: asset.objectKey, label: asset.label, attributes: asset.attributes }, rawRead: first.fields[fieldId], expandedRead: second.fields[fieldId] });
save(state);
console.log(JSON.stringify({ key: state.key, fieldId, rawRead: state.rawRead, expandedRead: state.expandedRead, object: { key: asset.objectKey, label: asset.label }, stateFile: output }, null, 2));
