/** Read-only app-document witness. Host same-document navigation is diagnostic only. */
export function createReportDocumentIdentity({page,appId,envId,record=(_stage,_value)=>{},timeoutMs=120000}){
 let epoch=0,disposed=false;const bindings=new Set(),tasks=new Set(),errors=[];
 const isAppUrl=url=>{try{const u=new URL(url),parts=u.pathname.split('/');return u.protocol==='https:'&&u.hostname.endsWith('.cdn.prod.atlassian-dev.net')&&parts[1]===appId&&parts[2]===envId&&parts[4]==='ppm-ui';}catch{return false;}};
 const matches=frame=>isAppUrl(frame.url());
 const emit=(stage,value)=>{try{record(stage,{epoch,...value});}catch{errors.push(new Error('Document witness evidence could not be retained'));}};
 const invalidate=reason=>{epoch++;emit('report-document-boundary',{reason});};
 const request=req=>{if(!req.isNavigationRequest())return;let frame;try{frame=req.frame();}catch{return;}if(frame===page.mainFrame()||matches(frame)||isAppUrl(req.url()))invalidate(frame===page.mainFrame()?'main-document-request':'app-document-request');};
 const detached=frame=>{if(matches(frame)||[...bindings].some(b=>b.frame===frame))invalidate('app-frame-detached');};
 const navigated=frame=>{if(frame===page.mainFrame()||matches(frame))emit('report-document-navigation-observed',{scope:frame===page.mainFrame()?'host':'app',invalidated:false});};
 page.on('request',request);page.on('framedetached',detached);page.on('framenavigated',navigated);
 const bounded=async operation=>{let timer;operation.catch(()=>{});try{return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Document operation timeout')),timeoutMs);})]);}finally{clearTimeout(timer);}};
 const release=async binding=>{binding.released=true;bindings.delete(binding);if(binding.handle){const handle=binding.handle;binding.handle=null;try{await bounded(handle.dispose());}catch{errors.push(new Error('Document witness handle disposal failed'));}}};
 const capture=requestId=>{
  if(disposed)throw new Error('Report document witness disposed');
  const frames=page.frames().filter(matches),binding={requestId,epoch,frame:frames.length===1?frames[0]:null,handle:null,released:false,valid:false};bindings.add(binding);
  // Both commands are issued against the synchronously selected frame, before
  // awaiting. Navigation requests/detachment invalidate a queued old acquisition.
  const operation=(async()=>{
   if(!binding.frame){await release(binding);emit('report-document-capture',{requestId,uniqueAppFrame:false});return binding;}
   let timer;const read=(async()=>{
    const handle=await binding.frame.evaluateHandle(()=>document);
    if(binding.released){await handle.dispose();return false;}binding.handle=handle;
    const element=await binding.frame.frameElement();let tag;
    try{tag=await element.getAttribute('data-testid');}finally{await element.dispose();}
    return tag==='hosted-resources-iframe';
   })();read.catch(()=>{});
   try{const exact=await Promise.race([read,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Document witness timeout')),timeoutMs);})]);binding.valid=exact===true&&!binding.released&&binding.epoch===epoch&&page.frames().includes(binding.frame)&&matches(binding.frame);}
   catch{binding.valid=false;}finally{clearTimeout(timer);}
   if(!binding.valid)await release(binding);
   emit('report-document-capture',{requestId,uniqueAppFrame:true,requestEpoch:binding.epoch,valid:binding.valid});return binding;
  })();tasks.add(operation);operation.finally(()=>tasks.delete(operation)).catch(()=>{});binding.pending=operation;return binding;
 };
 const current=async binding=>{
  await binding.pending;if(errors.length)throw new AggregateError(errors,'Document witness failed');if(disposed||binding.released||!binding.valid||binding.epoch!==epoch||!page.frames().includes(binding.frame)||!matches(binding.frame))return false;
  try{return await bounded(binding.handle.evaluate(doc=>doc===document))&&binding.epoch===epoch&&!binding.released;}catch{binding.valid=false;await release(binding);emit('report-document-current-refused',{requestId:binding.requestId,requestEpoch:binding.epoch});return false;}
 };
 const settle=async()=>{await Promise.all([...tasks]);if(errors.length)throw new AggregateError(errors,'Document witness failed');};
 return{capture,current,release,settle,matches,get epoch(){return epoch;},async dispose(){disposed=true;page.off('request',request);page.off('framedetached',detached);page.off('framenavigated',navigated);for(const binding of [...bindings])await release(binding);await settle();}};
}
