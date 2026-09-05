// Convert an observed browser request to an APIRequestContext JSON replay.
// Keep current-user credentials unchanged; HTTP/2 pseudo headers belong to the
// browser transport and cannot be supplied as ordinary HTTP header names.
/** @param {Record<string,string>} observed @returns {Record<string,string>} */
export function replayHeaders(observed) {
 const removed=new Set(['host','content-length','content-encoding']);
 /** @type {Record<string,string>} */
 const headers={};
 for(const [name,value]of Object.entries(observed)) {
  const lower=name.toLowerCase();
  if(name.startsWith(':')||removed.has(lower)||lower==='content-type')continue;
  headers[name]=value;
 }
 headers['content-type']='application/json';
 return headers;
}
