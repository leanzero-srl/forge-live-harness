import assert from 'node:assert/strict';
/** Exact measured shared fixture admission; it is never owned for mutation by this journey. */
export function admitPackedFixture(value,expected){
 assert.equal(expected?.id,'25020');assert.equal(expected?.key,'WFH-2820');assert.equal(expected.fields.project.id,'10001');assert.equal(expected.fields.project.key,'WFH');assert.equal(expected.fields.issuetype.id,'10004');assert.equal(expected.fields.summary,'[harness-test] LZ Assets owned 20260905 WFH positive control');assert.deepEqual(expected.fields.description,{type:'doc',version:1,content:[{type:'paragraph',content:[{type:'text',text:'lz-assets-owned-20260905-wfh'}]}]});assert.equal(expected.fields.customfield_10015,'2026-10-05');assert.equal(expected.fields.duedate,'2026-10-09');assert.equal(expected.fields.customfield_10180,5);assert.deepEqual(value,expected);return value;
}
