import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {getTestState} from '../../../testhook/client';import {get,stats} from '../../../data/jira.mjs';
const directory=path.resolve('evidence/lz-campaign/retained-uat-reuse-20260906'),output=path.join(directory,'final-readonly.json');
const processReceipt=JSON.parse(fs.readFileSync(path.join(directory,'process.json'),'utf8'));if(processReceipt.status!=='terminal')throw Error('Terminal required');
const receipt:any={schema:'retained-uat-final-readonly-v1',startedAt:new Date().toISOString(),rootAuthorization:'c6eb6488c3179aa219ddf6d4d156c330117b7147',reads:[],complete:false};fs.writeFileSync(output,JSON.stringify(receipt,null,2),{flag:'wx'});
const persist=()=>fs.writeFileSync(output,JSON.stringify(receipt,null,2));
const read=async(name:string,work:()=>Promise<any>)=>{const item:any={name,startedAt:new Date().toISOString()};receipt.reads.push(item);persist();try{item.body=await work();item.completedAt=new Date().toISOString();persist();}catch(error){item.failed=true;item.errorSha256=createHash('sha256').update(String(error)).digest('hex');persist();throw error;}};
async function main(){
 await read('current REST principal',async()=>{const me=await get('/rest/api/3/myself');return {accountId:me.accountId,displayName:me.displayName,active:me.active};});
 await read('current registry',()=>getTestState('lz-ppm',{what:'plans'}));
 for(const planId of ['plan-msq9dg8l-gz6mz1','plan-test-mtq7hsun-koj1jf','plan-test-mtq7hwv8-sk47wf'])await read(planId,()=>getTestState('lz-ppm',{what:'plan',planId}));
 const fields='project,summary,labels,issuetype,parent,issuelinks,status,assignee,timeestimate,customfield_10015,duedate,customfield_10180,customfield_10181,customfield_11148,customfield_11149';
 for(const key of ['WFH-2997','WFH-2998','WFH-2999','WFH-3000'])await read(key,()=>get(`/rest/api/3/issue/${key}?fields=${fields}`));
 receipt.complete=true;receipt.finishedAt=new Date().toISOString();receipt.jiraStats={...stats};persist();console.log(JSON.stringify({complete:true,reads:receipt.reads.length,jiraStats:receipt.jiraStats}));
}
main().catch(()=>{receipt.finishedAt=new Date().toISOString();receipt.jiraStats={...stats};persist();console.error('Read-only terminal audit failed; receipt preserved');process.exitCode=1;});
