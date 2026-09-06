import assert from 'node:assert/strict';
/** Leave through the real in-app route while the document survives, then close its surface. */
export async function departOwnedPlan({planId,drain,findMounted,confirmNonPlan,armLeave,clickBack,confirmUnmounted,blank,record=(_stage,_value)=>{},now=Date.now}){
 await drain();const mounted=await findMounted();let watch;
 try{
  if(mounted){
   const armedAtMs=now();watch=armLeave();record('owned-departure-before-back',{planId,armedAtMs});
   await clickBack(mounted);const value=await watch.promise;
   record('owned-departure-leave-observed',{planId,requestId:value.requestId,armedAtMs,requestedAtMs:value.requestedAtMs,dispatchedAtMs:value.dispatchedAtMs,completedAtMs:value.completedAtMs});
   assert.equal(value.key,'presenceLeave');assert.equal(value.planId,planId);assert.equal(value.state,'finished');assert.equal(value.httpStatus,200);assert.equal(value.outerSuccess,true);
   assert.ok(value.errors==null||Array.isArray(value.errors)&&value.errors.length===0);assert.deepEqual(value.body,{success:true});
   assert.ok(Number.isSafeInteger(value.requestedAtMs)&&value.requestedAtMs>=armedAtMs);assert.ok(Number.isSafeInteger(value.dispatchedAtMs)&&value.dispatchedAtMs>=value.requestedAtMs);assert.ok(Number.isSafeInteger(value.completedAtMs)&&value.completedAtMs>=value.dispatchedAtMs);
   await confirmUnmounted(mounted);await drain();record('owned-departure-all-leaves',watch.observations.map(v=>v.requestId));assert.equal(watch.observations.length,1,'Exactly one leave must follow the owned in-app departure');record('owned-departure-unmounted',{planId,requestId:value.requestId});
  }else await confirmNonPlan();
  await blank();await drain();
  if(watch){record('owned-departure-postblank-leaves',watch.observations.map(v=>v.requestId));assert.equal(watch.observations.length,1,'No additional leave may follow the verified unmount');}
  record('owned-departure-blank',{planId,mounted:!!mounted});
 }finally{watch?.dispose();}
}
/** Each waiter belongs to one click. It never accepts an already recorded receipt. */
export function armPresenceLeave(observers,{timeoutMs=600000}={}){
 let timer,done=false,resolve,reject;const observations=[];
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});promise.catch(()=>{});
 const listener=value=>{if(value.key!=='presenceLeave')return;observations.push(value);if(done)return;done=true;clearTimeout(timer);resolve(value);};
 observers.add(listener);timer=setTimeout(()=>{if(done)return;done=true;observers.delete(listener);reject(new Error('Owned UI presence leave was not observed within the bounded departure window'));},timeoutMs);
 return {promise,observations,dispose(){clearTimeout(timer);observers.delete(listener);if(!done){done=true;reject(new Error('Owned UI departure observation closed before a terminal leave'));}}};
}
