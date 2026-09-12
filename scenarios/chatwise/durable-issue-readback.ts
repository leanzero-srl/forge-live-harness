import { expect } from '../../fixtures/forge';
import { request } from '../../data/jira.mjs';
export async function verifyDurableIssueReadback(entry: any, issueResult: any, save: () => void) {
  const issues: any[] = [];
  const pageTokens = new Set<string>();
  let nextPageToken: string | undefined;
  do {
    const result: any = await request('POST', '/rest/api/3/search/jql', { body: {
      jql: `project = ${entry.projectKey} ORDER BY key ASC`, maxResults: 100, fields: ['*all'], ...(nextPageToken ? { nextPageToken } : {}),
    } });
    expect(Array.isArray(result.issues)).toBe(true);
    issues.push(...result.issues);
    if (result.isLast !== true) {
      expect(typeof result.nextPageToken, 'An incomplete search page needs a continuation token').toBe('string');
      expect(result.nextPageToken.length).toBeGreaterThan(0);
      expect(pageTokens.has(result.nextPageToken), 'Search pagination repeated a token').toBe(false);
      pageTokens.add(result.nextPageToken);
    }
    nextPageToken = result.isLast === true ? undefined : result.nextPageToken;
    expect(pageTokens.size).toBeLessThan(10);
  } while (nextPageToken);
  entry.issues = issues; entry.verifiedAt = new Date().toISOString(); save();
  expect(issues).toHaveLength(100);
  expect(new Set(issues.map(issue => issue.key)).size).toBe(100);
  expect(new Set(issues.map(issue => issue.fields.summary.trim().toLowerCase())).size).toBe(100);
  const plain = (node: any): string => node?.text || (node?.content || []).map(plain).join('\n');
  const typeIds = [...new Set(issues.map(issue => issue.fields.issuetype.id))];
  const types = new Map<string, any>();
  for (const typeId of typeIds) types.set(typeId, await request('GET', `/rest/api/3/issuetype/${typeId}`));
  const createFields = new Map<string, any[]>();
  for (const typeId of typeIds) {
    const fields: any[] = []; let offset = 0; let complete = false;
    for (let pageIndex = 0; pageIndex < 20; pageIndex++) {
      const metadata: any = await request('GET', `/rest/api/3/issue/createmeta/${entry.projectKey}/issuetypes/${typeId}?startAt=${offset}&maxResults=100`);
      const values = metadata.fields || metadata.values;
      expect(Array.isArray(values)).toBe(true); fields.push(...values); offset += values.length;
      if (metadata.isLast === true || (Number.isFinite(metadata.total) && offset >= metadata.total)) { complete = true; break; }
      expect(values.length, 'Create metadata pagination must advance').toBeGreaterThan(0);
    }
    expect(complete, 'Every create field must be inspected').toBe(true); createFields.set(typeId, fields);
  }
  entry.createMetadata = Object.fromEntries(createFields);
  expect(new Set(issues.map(issue => plain(issue.fields.description).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim())).size).toBe(100);
  entry.qualityReview = issues.map(issue => ({ key: issue.key, summary: issue.fields.summary, description: plain(issue.fields.description), populatedCustomFields: Object.entries(issue.fields).filter(([key, value]) => key.startsWith('customfield_') && value !== null && value !== undefined && (!Array.isArray(value) || value.length > 0)).map(([key, value]) => ({ key, value })) }));
  save();
  for (const issue of issues) {
    expect(issue.fields.project.key).toBe(entry.projectKey);
    expect(issue.fields.issuetype.subtask).toBe(false);
    expect(types.get(issue.fields.issuetype.id)?.hierarchyLevel).toBe(0);
    expect(issue.fields.summary.length).toBeGreaterThan(12);
    expect(plain(issue.fields.description).length, issue.key).toBeGreaterThan(300);
    expect(plain(issue.fields.description).split(/\n/).filter(line => line.trim()).length, `${issue.key}: context, work and acceptance must be readable`).toBeGreaterThanOrEqual(3);
    expect(issueResult.response).toContain(issue.key);
    for (const field of createFields.get(issue.fields.issuetype.id) || []) {
      if (!field.fieldId?.startsWith('customfield_') || (field.operations?.length && !field.operations.includes('set'))) continue;
      const value = issue.fields[field.fieldId];
      const populated = value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0);
      if (!populated) expect(issueResult.response, `${issue.key}: omitted create-screen field ${field.fieldId} must be disclosed`).toContain(field.fieldId);
    }
  }
  return issues;
}
