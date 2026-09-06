import assert from 'node:assert/strict';
/** One HTTP request, bounded complete body. No retry, redirects or synthesized response. */
export async function boundedRead(url,{headers={},method='GET',body,fetchImpl=fetch,limit=8388608,timeout=60000}={}){
 const response=await fetchImpl(url,{method,headers,body,redirect:'error',signal:AbortSignal.timeout(timeout)});const reader=response.body.getReader(),chunks=[];let size=0;
 for(;;){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>limit){await reader.cancel();throw new Error('Read exceeded its measured-fixture bounded body allowance');}chunks.push(Buffer.from(item.value));}
 const raw=Buffer.concat(chunks).toString();let value=null;try{value=JSON.parse(raw);}catch{}
 return {httpStatus:response.status,traceId:response.headers.get('atl-traceid'),raw,responseBytes:size,body:value};
}
