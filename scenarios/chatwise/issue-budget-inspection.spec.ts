import {test,expect} from '../../fixtures/forge';
import {getTarget} from '../../config/targets';
import {writeFileSync,mkdirSync} from 'node:fs';
import {GLOBAL_APP,openGlobalPage,waitForChatApp,callResolver} from './chatwise-support';
test.describe.configure({retries:0});
test('read retained issue budget inputs only',async({page})=>{
 test.skip(process.env.CW_BUDGET_INSPECT!=='1');test.setTimeout(360000);
 const contextOnly=process.env.CW_BUDGET_CONTEXT==='1';
 const folder=contextOnly?'/tmp/cw-issue-planning-budget-context':'/tmp/cw-issue-planning-budget-176';mkdirSync(folder,{recursive:true});
 const frame=await openGlobalPage(page,getTarget('chatwise-global'));await waitForChatApp(page,frame,GLOBAL_APP);
 await expect(frame.locator('body')).toContainText(process.env.CW_EXPECT_VERSION||'v6.176.0');
 const jobId='job_1789229526917_m8vah055a';const before:any=await callResolver(frame,GLOBAL_APP,'getJobStatus',{jobId});
 expect(before.success).toBe(true);expect(before.data.status).toBe('completed');expect(before.data.result.finishedAt).toBe('2026-09-12T18:51:26.263Z');expect(before.data.result.usage.total_tokens).toBe(199469);
 writeFileSync(folder+'/before.json',JSON.stringify(before,null,2),{flag:'wx'});
 for(let batchIndex=0;batchIndex<(contextOnly?1:12);batchIndex++){
 const response:any=await callResolver(frame,GLOBAL_APP,'getIssueTaskPlan',{jobId,batchIndex,...(contextOnly?{includePlanningContext:true}:{})});
 writeFileSync(folder+`/batch-${batchIndex}.json`,JSON.stringify(response,null,2),{flag:'wx'});
 expect(response.success,response.error).toBe(true);expect(response.data.body.issues).toHaveLength(5);
 if(contextOnly){expect(typeof response.data.planningContext?.brief).toBe('string');expect(response.data.planningContext.brief.length).toBe(2868);expect(response.data.planningContextHash).toMatch(/^[a-f0-9]{64}$/);}
 }
 const after=await callResolver(frame,GLOBAL_APP,'getJobStatus',{jobId});expect(after).toEqual(before);writeFileSync(folder+'/after.json',JSON.stringify(after,null,2),{flag:'wx'});
});
