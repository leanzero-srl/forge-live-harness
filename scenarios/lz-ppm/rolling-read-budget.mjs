import assert from 'node:assert/strict';
const cancelled=()=>new Error('Read-budget wait was cancelled; no operation was sent');
const wait=(promise,signal)=>{if(signal.aborted)return Promise.reject(cancelled());return new Promise((resolve,reject)=>{const abort=()=>reject(cancelled());signal.addEventListener('abort',abort,{once:true});Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});};
const timer=(ms,signal)=>new Promise((resolve,reject)=>{if(signal.aborted)return reject(cancelled());const abort=()=>{clearTimeout(id);reject(cancelled());};const id=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);signal.addEventListener('abort',abort,{once:true});});
/** Entire reservation remains charged while active and for61s AFTER terminal response. */
export function createRollingReadBudget({capacity=3000,windowMs=61000,now=()=>performance.now(),sleep=timer,onEvent=(_event)=>{}}={}){
 assert.ok(Number.isSafeInteger(capacity)&&capacity>0);assert.ok(Number.isSafeInteger(windowMs)&&windowMs>0);
 let entries=[],tail=Promise.resolve(),sequence=0,closed=false,lastTime=-Infinity,notify;let changed=new Promise(r=>notify=r);const controller=new AbortController();
 const pulse=()=>{const wake=notify;changed=new Promise(r=>notify=r);wake();};
 const time=()=>{const value=now();if(!Number.isFinite(value)||value<0||value<lastTime){closed=true;controller.abort();pulse();throw new Error('Monotonic read-budget clock became invalid; no further operation permitted');}lastTime=value;return value;};
 async function reserve(label,cost){
  assert.ok(typeof label==='string'&&label);assert.ok(Number.isSafeInteger(cost)&&cost>0&&cost<=capacity,'Read cost must have a bounded reservation');if(closed)throw cancelled();const previous=tail;let release;tail=new Promise(r=>release=r);
  try{await wait(previous,controller.signal);const waitingAt=time();for(;;){if(closed)throw cancelled();const at=time();entries=entries.filter(e=>e.returnedMs===null||at<e.returnedMs+windowMs);const used=entries.reduce((n,e)=>n+e.cost,0);
   if(used+cost<=capacity){const entry={id:++sequence,label,cost,startedMs:at,returnedMs:null,waitedMs:at-waitingAt};entries.push(entry);return entry;}
   const expiry=Math.min(...entries.filter(e=>e.returnedMs!==null).map(e=>e.returnedMs+windowMs));await onEvent({stage:'budget-wait',label,cost,at,used,capacity,waitMs:Number.isFinite(expiry)?Math.max(1,expiry-at):null});
   await wait(Number.isFinite(expiry)?sleep(Math.max(1,expiry-at),controller.signal):changed,controller.signal);
  }}finally{release();}
 }
 return {async run(label,cost,operation){const entry=await reserve(label,cost);let value,bodyError,failed=false;const receiptErrors=[];
  try{await onEvent({stage:'budget-start',...entry,capacity,windowMs,wallTime:new Date().toISOString()});if(closed)throw cancelled();value=await operation();}catch(error){failed=true;bodyError=error;}
  try{entry.returnedMs=time();}catch(error){receiptErrors.push(error);}pulse();
  try{await onEvent({stage:'budget-return',...entry,failed,error:failed?String(bodyError):null,wallTime:new Date().toISOString()});}catch(error){receiptErrors.push(error);}
  if(receiptErrors.length)throw new AggregateError([...(failed?[bodyError]:[]),...receiptErrors],'Read operation or budget receipt failed');if(failed)throw bodyError;return value;
 },close(){closed=true;controller.abort();pulse();},snapshot(){const at=time();return {capacity,windowMs,now:at,entries:structuredClone(entries.filter(e=>e.returnedMs===null||at<e.returnedMs+windowMs))};}};
}
