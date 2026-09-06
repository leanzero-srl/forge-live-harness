// Convert an observed browser request to an APIRequestContext JSON replay.
// Keep end-to-end current-user credentials unchanged. Browser HTTP/2 pseudo
// headers and HTTP/1 hop/framing headers belong to the original connection.
/** @param {Record<string,string>} observed @returns {Record<string,string>} */
export function replayHeaders(observed) {
 const removed=new Set(['host','content-length','content-encoding','connection',
  'keep-alive','proxy-connection','proxy-authenticate','proxy-authorization',
  'te','trailer','transfer-encoding','upgrade']);
 // Connection may nominate additional hop-only fields (case insensitive).
 for(const [name,value]of Object.entries(observed)) {
  if(name.toLowerCase()==='connection')for(const token of value.split(','))removed.add(token.trim().toLowerCase());
 }
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
