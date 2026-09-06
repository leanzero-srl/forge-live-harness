import assert from 'node:assert/strict';

export class CapacitySettingsRecoveryRequired extends Error {
 constructor(message,state,cause){super(message,{cause});this.name='CapacitySettingsRecoveryRequired';this.code='LZ_CAPACITY_SETTINGS_RECOVERY_REQUIRED';this.settingsState=structuredClone(state);}
}
const copy=value=>structuredClone(value);
const checked=response=>{assert.equal(response?.success,true,response?.error||'Capacity settings response did not succeed');assert.ok(response.settings&&typeof response.settings==='object');assert.ok(Number.isSafeInteger(response.version)&&response.version>=0);return response;};
const outcome=promise=>promise.then(value=>({value}),error=>({error}));
const unwrap=result=>{if('error' in result)throw result.error;return result.value;};

/** One ownership rule for every capacity preference writer in live journeys.
 * Observe functions return REAL responses; no response/result is fabricated.
 * Unknown outcomes remain pending and cannot authorize restore or fixture delete.
 * @param {{invoke:(name:string,payload?:any)=>Promise<any>,onState?:(state:any)=>void,observe?:(name:string)=>Promise<any>}} options
 */
export function createCapacityPreferences({invoke,onState=(_state)=>{},observe=undefined}) {
 const state={initialized:false,original:null,lastOwned:null,version:null,pending:null,restored:false,history:[]};
 const persist=()=>onState(copy(state));
 const record=(name,details={})=>{state.history.push({name,time:new Date().toISOString(),...copy(details)});persist();};
 const recovery=(message,cause)=>{record('recovery-required',{message});return new CapacitySettingsRecoveryRequired(message,state,cause);};
 const admit=response=>{assert.equal(state.initialized,false,'Settings admission is once per journey');const r=checked(response);state.initialized=true;state.original=copy(r.settings);state.lastOwned=copy(r.settings);state.version=r.version;record('admitted');};
 const current=async()=>{
  assert.equal(state.initialized,true,'Actual original settings must be admitted before writes');
  if(state.pending)throw recovery('A Capacity settings write has an unknown or pending outcome; do not overwrite or delete its fixtures');
  const r=checked(await invoke('getCapacitySettings'));
  try{assert.deepEqual(r.settings,state.lastOwned);}catch(error){record('unrecognized-current',{settings:r.settings,version:r.version});throw recovery('Current Capacity preferences differ from the last acknowledged owned settings',error);}
  return r;
 };
 const beginWrite=async(intent={kind:'UI'})=>{const r=await current();state.pending={...copy(intent),expectedVersion:r.version};state.restored=false;record('write-intent');return r.version;};
 const acknowledge=response=>{
  assert.ok(state.pending,'An acknowledgement must correspond to a recorded write intent');
  if(response?.success!==true){record('write-not-acknowledged',{error:response?.error||'Missing successful acknowledgement'});throw new Error(response?.error||'Capacity settings write not acknowledged');}
  const r=checked(response);assert.equal(r.version,state.pending.expectedVersion+1,'Acknowledgement version must match this exact pending write');state.lastOwned=copy(r.settings);state.version=r.version;state.pending=null;record('write-acknowledged');return r;
 };
 const write=async settings=>{
  const expectedVersion=await beginWrite({kind:'direct',settings:copy(settings)});
  // A transport rejection deliberately leaves the recorded intent unresolved.
  const response=await invoke('saveCapacitySettings',{settings,expectedVersion});return acknowledge(response);
 };
 const calculate=async(action,{allowReportFailure=false}={})=>{
  assert.equal(typeof observe,'function','UI writes need an actual response observer');await beginWrite({kind:'UI'});
  // Acknowledge immediately, independently of the subsequent report result.
  const saved=outcome(observe('saveCapacitySettings').then(acknowledge));
  const reported=outcome(observe('getCapacityReport'));
  await action();unwrap(await saved);const report=unwrap(await reported);
  if(!allowReportFailure)assert.equal(report?.success,true,report?.error||'Capacity report did not succeed');return report;
 };
 const restore=async()=>{
  if(!state.initialized){record('no-settings-admitted-no-write');return {initialized:false,restored:false};}
  try{
   const r=await current();state.pending={kind:'restore',settings:copy(state.original),expectedVersion:r.version};record('restore-intent');
   const saved=acknowledge(await invoke('saveCapacitySettings',{settings:state.original,expectedVersion:r.version}));assert.deepEqual(saved.settings,state.original);
   for(let i=0;i<2;i++){const read=checked(await invoke('getCapacitySettings'));assert.deepEqual(read.settings,state.original);record('restore-readback',{read:i+1,version:read.version});}
   state.restored=true;record('restored');return {initialized:true,restored:true};
  }catch(error){if(error instanceof CapacitySettingsRecoveryRequired)throw error;throw recovery('Capacity preferences could not be proven restored; retain the exact owned fixtures',error);}
 };
 return {admit,beginWrite,acknowledge,write,calculate,restore,get state(){return copy(state);}};
}
