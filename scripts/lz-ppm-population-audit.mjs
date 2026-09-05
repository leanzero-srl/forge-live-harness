#!/usr/bin/env node
// Read-only LZPP inventory. Never use searchJql's older 2,000-row convenience cap
// as evidence of complete large-plan membership.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {get,post,BASE,stats} from '../data/jira.mjs';
export async function readLzppPopulation() {
 assert.equal(BASE,'https://wolfaenpak.atlassian.net');
 const startedAt=new Date().toISOString(),start=Date.now(),project=await get('/rest/api/3/project/LZPP');
 assert.equal(project.key,'LZPP');assert.ok(project.id);
 const rows=[],pages=[],tokens=new Set();let nextPageToken;
 do {
  const begin=Date.now(),page=await post('/rest/api/3/search/jql',{jql:'project = LZPP ORDER BY key ASC',maxResults:1000,fields:['summary','project','labels','customfield_10015','duedate','customfield_10180'],...(nextPageToken?{nextPageToken}:{})});
  assert.ok(Array.isArray(page.issues));
  for(const issue of page.issues){assert.equal(issue.fields.project.id,project.id);rows.push({id:issue.id,key:issue.key,summary:issue.fields.summary,labels:issue.fields.labels||[],start:issue.fields.customfield_10015??null,due:issue.fields.duedate??null,duration:issue.fields.customfield_10180??null});}
  pages.push({number:pages.length+1,count:page.issues.length,first:page.issues[0]?.key||null,last:page.issues.at(-1)?.key||null,elapsedMs:Date.now()-begin,returnedIsLast:page.isLast??null});
  nextPageToken=page.nextPageToken;
  if(nextPageToken){assert.ok(page.issues.length>0,'paging must advance');assert.ok(!tokens.has(nextPageToken),'continuation token must advance');tokens.add(nextPageToken);}
  else assert.equal(page.isLast,true,'complete inventory requires explicit terminal page');
  assert.ok(pages.length<=100&&rows.length<=100000,'bounded population read');
 }while(nextPageToken);
 assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);assert.equal(new Set(rows.map(r=>r.key)).size,rows.length);
 assert.ok(rows.length>2000,'existing population genuinely crosses 2,000');
 for(const row of [rows[0],rows.at(-1)]){const actual=await get(`/rest/api/3/issue/${row.key}?fields=project,summary,customfield_10015,duedate,customfield_10180`);assert.equal(actual.id,row.id);assert.equal(actual.fields.project.id,project.id);assert.equal(actual.fields.summary,row.summary);assert.equal(actual.fields.customfield_10015??null,row.start);assert.equal(actual.fields.duedate??null,row.due);assert.equal(actual.fields.customfield_10180??null,row.duration);}
 const hash=createHash('sha256').update(JSON.stringify(rows)).digest('hex');
 return {readOnly:true,startedAt,finishedAt:new Date().toISOString(),elapsedMs:Date.now()-start,project:{id:project.id,key:project.key,name:project.name},count:rows.length,pages,sha256:hash,first:rows[0],last:rows.at(-1),stats:{...stats},rows};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const output=process.argv[2];assert.ok(output,'provide an evidence JSON path');const result=await readLzppPopulation();fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2));
 console.log(JSON.stringify({...result,rows:undefined,pages:result.pages.length},null,2));
}
