import fs from 'node:fs';
import {test,expect} from '../../fixtures/forge';
import {getTestState} from '../../testhook/client';
import {openPlans,LZPT_PLAN} from './forecast-fixture';
import {actualResponse,currentUserResolver} from './campaign-ui';
import {createCapacityPreferences} from './capacity-preferences.mjs';
import {settledScreenshot} from './settled-screenshot.mjs';

test.describe.configure({retries:0,timeout:180000});
test('same-account simultaneous Capacity saves admit one winner and reject the stale writer, then restore exact preferences',async({page},info)=>{
 const journal:any={startedAt:new Date().toISOString(),limitation:'Two concurrent real resolver requests from the same authenticated user; this does not prove a second identity or force server scheduling.',steps:[]};
 const retain=()=>fs.writeFileSync(info.outputPath('capacity-concurrent.json'),JSON.stringify(journal,null,2));retain();
 const rpc=currentUserResolver(page,c=>c?.functionKey==='getCapacitySettings');
 const preferences=createCapacityPreferences({invoke:rpc.invoke,onState:state=>{journal.preferences=state;retain();}});
 let bodyError:any;
 try{
  const source=await getTestState('lz-ppm',{what:'plan',planId:LZPT_PLAN});expect(source.meta.id).toBe(LZPT_PLAN);expect(source.issues).toHaveLength(45);
  let frame=await openPlans(page);await expect(frame.locator('body')).toContainText(/REV\s+V4\.58\.579/i);
  let pending=actualResponse(page,'getCapacitySettings');await frame.getByRole('button',{name:'Capacity',exact:true}).click();preferences.admit(await pending);
  const original=preferences.state.original;const candidates=[{...structuredClone(original),selectedPlanIds:[],issueChoices:{}},{...structuredClone(original),selectedPlanIds:[LZPT_PLAN],issueChoices:{}}];
  expect(candidates[0]).not.toEqual(candidates[1]);
  journal.candidates=candidates;retain();const expectedVersion=await preferences.beginWrite({kind:'same-account concurrent control'});
  // Both actual HTTP requests are dispatched together, with exactly the same
  // observed version. No route stubbing, delayed backend or synthetic response.
  const outcomes=await Promise.allSettled(candidates.map(settings=>rpc.invoke('saveCapacitySettings',{settings,expectedVersion})));
  journal.outcomes=outcomes.map((outcome,index)=>({index,status:outcome.status,...(outcome.status==='fulfilled'?{response:outcome.value}:{error:String(outcome.reason)})}));retain();
  expect(outcomes.every(outcome=>outcome.status==='fulfilled'),'Any unknown transport outcome prevents restoration').toBe(true);
  const responses=outcomes.map(outcome=>(outcome as PromiseFulfilledResult<any>).value),winners=responses.map((response,index)=>({response,index})).filter(item=>item.response.success===true),losers=responses.filter(response=>response.success===false);
  expect(winners).toHaveLength(1);expect(losers).toHaveLength(1);
  expect(['Another capacity settings save is in progress. Retry shortly.','Capacity settings changed in another view. Reload before saving.']).toContain(losers[0].error);
  const winner=winners[0];expect(winner.response.settings).toEqual(candidates[winner.index]);expect(winner.response.version).toBe(expectedVersion+1);preferences.acknowledge(winner.response);
  for(let n=0;n<2;n++){const read=await rpc.invoke('getCapacitySettings');expect(read.success).toBe(true);expect(read.settings).toEqual(winner.response.settings);expect(read.version).toBe(winner.response.version);journal.steps.push({name:'fresh-winner-read',read:n+1,response:read});retain();}
  frame=await openPlans(page);pending=actualResponse(page,'getCapacitySettings');await frame.getByRole('button',{name:'Capacity',exact:true}).click();const reopened=await pending;expect(reopened.settings).toEqual(winner.response.settings);expect(reopened.version).toBe(winner.response.version);
  const cap=frame.locator('[data-testid="capacity-view"]');await expect(cap.getByRole('status')).toHaveCount(0,{timeout:120000});
  const registry=(await getTestState('lz-ppm',{what:'plans'})).plans;
  for(const plan of registry)await expect(cap.getByRole('checkbox',{name:`Include ${plan.name}`,exact:true})).toHaveAttribute('aria-checked',winner.response.settings.selectedPlanIds.includes(plan.id)?'true':'false');
  await settledScreenshot(cap,{path:info.outputPath('capacity-concurrent-winner-visible.png')});journal.reopened=reopened;journal.singleWinnerVerified=true;retain();
 }catch(error){bodyError=error;journal.bodyError=String(error);retain();}
 finally{
  const errors:any[]=bodyError?[bodyError]:[];
  try{const restored=await preferences.restore();expect(restored.initialized).toBe(true);expect(restored.restored).toBe(true);journal.exactOriginalRestored=true;retain();}
  catch(error){errors.push(error);journal.recoveryRequired={error:String(error),state:preferences.state,noNewFixtureResources:true};retain();}
  rpc.stop();if(errors.length)throw new AggregateError(errors,'Concurrent Capacity save control and/or exact preference recovery failed');
 }
});
