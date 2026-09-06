import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {request} from 'playwright';
import {replayHeaders} from './replay-headers.mjs';
test('real APIRequestContext rejects browser HTTP2 pseudo headers and accepts same-user JSON after transport conversion',async()=>{
 const received=[];const server=http.createServer((req,res)=>{let body='';req.on('data',d=>body+=d);req.on('end',()=>{received.push({headers:req.headers,body});res.setHeader('content-type','application/json');res.end(JSON.stringify({accepted:true}));});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const client=await request.newContext();
 const url=`http://127.0.0.1:${server.address().port}/actual-transport-control`;
 const observed={':authority':'example.invalid',':method':'POST',':path':'/old',':scheme':'https',Host:'example.invalid','Content-Length':'98765','content-encoding':'gzip','Content-Type':'text/plain',authorization:'Bearer non-secret-fixture',cookie:'session=non-secret-fixture','x-trace-id':'unchanged-fixture'};
 try{
  await assert.rejects(client.post(url,{headers:observed,data:'{}'}),/Header name must be a valid HTTP token/);assert.equal(received.length,0);
  const headers=replayHeaders(observed);assert.equal(headers.authorization,observed.authorization);assert.equal(headers.cookie,observed.cookie);assert.equal(headers['x-trace-id'],observed['x-trace-id']);
  const data={functionKey:'positive-control',payload:{preserved:'value'}};const response=await client.post(url,{headers,data:JSON.stringify(data)});assert.equal(response.status(),200);assert.deepEqual(await response.json(),{accepted:true});assert.equal(received.length,1);assert.deepEqual(JSON.parse(received[0].body),data);assert.equal(received[0].headers.authorization,observed.authorization);assert.equal(received[0].headers.cookie,observed.cookie);assert.equal(received[0].headers['content-type'],'application/json');assert.equal(received[0].headers['content-encoding'],undefined);assert.equal(observed[':authority'],'example.invalid');
 }finally{await client.dispose();await new Promise(resolve=>server.close(resolve));}
});
