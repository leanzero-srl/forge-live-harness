import fs from 'node:fs';import path from 'node:path';
import {getTestState} from '../../testhook/client.ts';import {get,request} from '../../data/jira.mjs';
const dir='evidence/lz-campaign/second-feature-live-20260905/persistence-durability/attempt-001/tests-artifacts';
const report:any={before:(await getTestState('lz-ppm',{what:'plan',planId:'plan-msq9dg8l-gz6mz1'})),cleaned:[]};
for(const name of fs.readdirSync(dir)){
 const filename=path.join(dir,name,'fixture-journal.json');if(!fs.existsSync(filename))continue;const j=JSON.parse(fs.readFileSync(filename,'utf8'));if(j.integrityPassed)continue;
 const plan=(await getTestState('lz-ppm',{what:'plan',planId:j.planId})).meta;if(plan?.name!==j.name||!j.name.startsWith('[harness-test] lz-norm-'))throw new Error('plan ownership mismatch');
 await getTestState('lz-ppm',{what:'clearDrafts',planId:j.planId});await getTestState('lz-ppm',{what:'deleteFixture',planId:j.planId});
 for(const i of [...j.issues].reverse()){const real=await get(`/rest/api/3/issue/${i.key}?fields=project,labels,summary`);if(real.fields.project.key!=='WFH'||!real.fields.labels.includes(j.marker)||!real.fields.summary.startsWith(j.name))throw new Error('issue ownership mismatch');await request('DELETE',`/rest/api/3/issue/${i.key}`);if((await request('GET',`/rest/api/3/issue/${i.key}`,{raw:true})).status!==404)throw new Error('delete not verified');}
 report.cleaned.push({planId:j.planId,keys:j.issues.map((i:any)=>i.key),deleted:true});
}
report.after=await getTestState('lz-ppm',{what:'plan',planId:'plan-msq9dg8l-gz6mz1'});if(JSON.stringify(report.before.issues)!==JSON.stringify(report.after.issues))throw new Error('source changed');report.planIds=(await getTestState('lz-ppm',{what:'plans'})).plans.map((p:any)=>p.id).sort();if(report.planIds.length!==3)throw new Error('owned fixtures remain');report.sourceUnchanged=true;fs.writeFileSync('evidence/lz-campaign/second-feature-live-20260905/manual-owned-cleanup.json',JSON.stringify(report,null,2));console.log(JSON.stringify({cleaned:report.cleaned,planIds:report.planIds,sourceUnchanged:true}));
