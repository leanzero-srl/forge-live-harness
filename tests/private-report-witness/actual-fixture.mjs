import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {register} from 'node:module';
import {randomUUID} from 'node:crypto';
export const app=process.env.LZ_PRIVATE_APP_PATH||'/Users/mihaiperdum/Projects/lz-ppm-forge';
register(pathToFileURL(app+'/test/parity/loader.mjs'));
const from=path=>import(pathToFileURL(app+'/'+path).href);
const [{moduleWithBoundaries},snapshots,models,scenario,mode,assets,fields,milestones,{snapshotCaptureData}]=await Promise.all(['test/helpers/module-boundaries.mjs','src/services/plan-snapshot-store.mjs','src/services/simulation-model.mjs','src/services/scenario-variant.mjs','src/services/simulation-plan-mode.mjs','src/services/assets-fields.mjs','src/services/plan-fields.mjs','src/services/plan-milestones.mjs','src/services/plan-snapshot-data.mjs'].map(from));
export async function actualPrivateFixture(){
 const old=JSON.parse(fs.readFileSync('evidence/lz-campaign/seventeenth-packed-prepare-20260906/artifacts/scenarios-lz-ppm-campaign--f4cfb-efore-packed-layout-upgrade-chromium/packed-prepare.json','utf8'));
 const source=structuredClone(old.originalPlan),calendar=old.calendar;source.meta.name='[harness-test] private local source';const account='712020:937bc860-eec2-4294-a65d-8e0fe7c45086';
 const values=new Map(),io={get:async key=>structuredClone(values.get(key)),set:async(key,value)=>values.set(key,structuredClone(value)),delete:async key=>values.delete(key),query:async()=>({results:[]})};const historyStore=snapshots.createSnapshotStore(io);
 // Actual snapshot capture data + store and actual fork/model/generation modules; only storage/permission transport is in memory.
 const captured=snapshotCaptureData(source.meta,source.issues,{name:'Source snapshot',kind:'scenario',uncertainty:'medium',changes:[]},calendar);
 captured.issues=captured.issues.map(({predecessorLags,...row})=>row);
 const snapshotInput={...captured,id:randomUUID(),createdBy:account,takenAt:new Date().toISOString(),consistency:{method:'two-matching-reads',basisHash:snapshots.snapshotHash({meta:source.meta,issues:source.issues,calendar,deps:{}}),observedAt:new Date().toISOString()}};
 await historyStore.create(source.meta.id,snapshotInput);const storedSnapshot=await historyStore.get(source.meta.id,snapshotInput.id);
 const snapshotHandlers=new Map(),snapshotResolvers=await moduleWithBoundaries(pathToFileURL(app+'/src/resolvers/snapshot-resolvers.js'),{'../services/permissions':{requireView:async(id,owner)=>({ok:id===source.meta.id&&owner===account,meta:source.meta})},'../services/plan-history':{historyStore},'../services/assets-fields.mjs':assets});
 snapshotResolvers.registerSnapshotResolvers({define:(key,handler)=>snapshotHandlers.set(key,handler)});const snapshotReply=await snapshotHandlers.get('getSnapshot')({payload:{planId:source.meta.id,snapshotId:snapshotInput.id},context:{accountId:account}}),snapshot=snapshotReply.snapshot;
 const keys={planMeta:id=>`p:${id}:meta`,planSchedule:id=>`p:${id}:sched`,planDeps:id=>`p:${id}:deps`};values.set(keys.planMeta(source.meta.id),source.meta);
 const kvs={...io,query(){const q={where(){return q;},limit(){return q;},cursor(){return q;},getMany:async()=>({results:[]})};return q;}};
 const store={getPlanMeta:id=>kvs.get(keys.planMeta(id)),addPlanListEntry:async()=>({ok:true})};
 const factory=await moduleWithBoundaries(pathToFileURL(app+'/src/services/plan-factory.js'),{'./kvs-store':store,'./assets-fields.mjs':assets,'./plan-fields.mjs':fields,'./plan-milestones.mjs':milestones});
 const generations=await moduleWithBoundaries(pathToFileURL(app+'/src/services/simulation-generations.js'),{'@forge/kvs':{kvs,WhereConditions:{beginsWith:x=>x}},'./plan-snapshot-store.mjs':snapshots});
 const operation={commit:async({set=[],remove=[]})=>{for(const[k,v]of set)await io.set(k,v);for(const k of remove)await io.delete(k);}};
 const allow=async(id,owner)=>({ok:owner===account,meta:await store.getPlanMeta(id)});
 const runtime=await moduleWithBoundaries(pathToFileURL(app+'/src/services/simulation-plans.js'),{'node:crypto':{randomUUID},'@forge/kvs':{kvs},'./kvs-store':store,'./kvs-keys':{keys},'./permissions':{requireView:allow,requireEdit:allow,requireDelete:allow},'./plan-factory':factory,'./plan-history':{historyStore,withHistoryOperation:async(id,work)=>work(operation)},'./simulation-generations':generations,'./simulation-model.mjs':models,'./scenario-variant.mjs':scenario,'./simulation-plan-mode.mjs':mode,'./assets-fields.mjs':assets});
 const name='[harness-test] local private model',ack=await runtime.forkSimulationPlan({planId:source.meta.id,snapshotId:snapshot.id,name},account),planRead={success:true,plan:await store.getPlanMeta(ack.plan.id)},modelRead=await runtime.getSimulationModel({planId:ack.plan.id},account);
 const presenceHandlers=new Map(),presenceResolvers=await moduleWithBoundaries(pathToFileURL(app+'/src/resolvers/presence-resolvers.js'),{'@forge/kvs':{kvs},'../services/kvs-keys':{keys:{planPresence:id=>`p:${id}:presence`}},'../services/jira-client':{getCurrentUser:async()=>({displayName:'Local owner'})},'../services/realtime/publisher':{emitPlanEvent:async()=>{}}});presenceResolvers.registerPresenceResolvers({define:(key,handler)=>presenceHandlers.set(key,handler)});
 const presenceCall=(key,payload,principal=account)=>presenceHandlers.get(key)({payload,context:{accountId:principal}});
 return{source,calendar,snapshot,storedSnapshot,presenceCall,name,ack,planRead,modelRead,values,runtime,account};
}
