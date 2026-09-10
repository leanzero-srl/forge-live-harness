// Intended policy change on the sanctioned test site. No LLM and no Jira writes.
// Leaves the three user-requested switches enabled; every other setting must survive.
import { test, expect } from '../../fixtures/forge';
import { getTarget } from '../../config/targets';
import { BASE_URL } from '../../config/env';
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver } from './chatwise-support';
import { get } from '../../data/jira.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const T = getTarget('chatwise-global');
const PATCH = { allowJiraAdminWrites: true, allowJiraAdminDestroy: true, allowDestructive: true };
test.describe.configure({ retries: 0 });
test('enable requested administrator capabilities on wolfaenpak only', async ({ page }) => {
  test.skip(process.env.CW_ENABLE_ADMIN_CAPABILITIES !== '1', 'Explicit intended policy-change opt-in required');
  test.setTimeout(180000);
  expect(new URL(BASE_URL).hostname).toBe('wolfaenpak.atlassian.net');
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  expect(new URL(page.url()).hostname).toBe('wolfaenpak.atlassian.net');
  // Positive control on the actual test project, independent of the agent.
  const project = await get('/rest/api/3/project/WFH');
  expect(project.key).toBe('WFH');
  expect(typeof project.name).toBe('string');
  expect(project.id).toBeTruthy();
  const before = await callResolver<any>(frame, GLOBAL_APP, 'getToolPolicy');
  expect(before.success).toBe(true);
  expect(before.policy && typeof before.policy === 'object').toBe(true);
  for (const key of Object.keys(PATCH)) expect(typeof before.policy[key]).toBe('boolean');
  const directory = '/tmp/cw-admin-capabilities';
  mkdirSync(directory, {recursive:true});
  const evidence: any = {measuredAt:new Date().toISOString(), host:new URL(page.url()).hostname,
    project:{key:project.key,name:project.name,id:project.id}, before:before.policy, requestedPatch:PATCH,
    limitation:'No deployed executeTool resolver exists. This spec verifies policy and independent Jira access, not administration handlers or organisation APIs.'};
  const save = () => writeFileSync(`${directory}/enable-readback.json`, JSON.stringify(evidence,null,2));
  save();
  // Send only owned keys. This exercises the policy PATCH preservation contract.
  const saved = await callResolver<any>(frame, GLOBAL_APP, 'saveToolPolicy', {policy:PATCH});
  evidence.saveSuccess = saved.success;
  save();
  expect(saved.success, 'policy save refused; no automatic retry').toBe(true);
  const after = await callResolver<any>(frame, GLOBAL_APP, 'getToolPolicy');
  evidence.after = after.policy;
  save();
  expect(after.success).toBe(true);
  expect(after.policy).toEqual({...before.policy,...PATCH});
  evidence.verified = true;
  save();
  console.log(JSON.stringify({host:evidence.host, enabled:Object.keys(PATCH), otherSettingsPreserved:true, project:project.key, inferenceCalls:0}));
});
