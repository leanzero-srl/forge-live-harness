import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {prepareSponsorReport,reportSummary,sponsorReportHtml} from '../../tests/seventeenth-forecast-resume/old-producer-frozen.mjs';
import {retained} from './seventeenth-report-recovery-contract.mjs';import {hash} from './seventeenth-source-oracle.mjs';
export function pinnedForecast(){
 const bytes=fs.readFileSync(new URL('../../tests/seventeenth-forecast-resume/expected.json',import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),'6b5dbd572e2718728729a143e7b21d36ca3776cae581f5f42b3f86b125894549');
 assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../../tests/seventeenth-forecast-resume/old-producer-frozen.mjs',import.meta.url))).digest('hex'),'5b2eec2cf8257fac1d03da9fa41a23b5a501994400c93914c5c82db8e1f6c307');return JSON.parse(bytes);
}
export function expectedRows(captured){return captured.issues.map(i=>({key:i.key,summary:i.summary,startDate:i.startDate??null,dueDate:i.dueDate??null,duration:i.duration??null,buffer:i.buffer??null,statusCategory:i.statusCategory??'unknown',parentKey:i.parentKey??null}));}
export function verifyPublished(summary,{oracle,forecast,initialJob,resumeStartedMs,now=Date.now()}){
 const rows=expectedRows(oracle.captured);assert.equal(hash(rows),forecast.timelineHash);assert.deepEqual(oracle.source,forecast.sourceHashes);assert.deepEqual(summary.forecast,forecast.forecast);
 const iso=(value)=>{assert.equal(new Date(value).toISOString(),value);return Date.parse(value);};
 assert.ok(iso(summary.takenAt)>=Date.parse('2026-09-06T08:15:31.200Z')&&iso(summary.takenAt)<=Date.parse(initialJob.createdAt));
 assert.deepEqual(Object.keys(summary.consistency).sort(),['basisHash','method','observedAt','verifiedAfterAnalysisAt']);assert.equal(summary.consistency.method,'two-matching-reads');assert.equal(summary.consistency.basisHash,oracle.source.basisHash);
 assert.ok(iso(summary.consistency.observedAt)>=Date.parse(initialJob.createdAt)&&iso(summary.consistency.observedAt)<=Date.parse('2026-09-06T08:17:18.774Z'));assert.ok(iso(summary.consistency.verifiedAfterAnalysisAt)>=resumeStartedMs&&iso(summary.consistency.verifiedAfterAnalysisAt)<=now);
 const input={id:retained.reportId,takenAt:summary.takenAt,createdBy:'712020:937bc860-eec2-4294-a65d-8e0fe7c45086',name:oracle.captured.name,planName:oracle.context.meta.name,sourceVersion:oracle.captured.sourceVersion,calendar:oracle.captured.calendar,uncertainty:'medium',workingChangeCount:0,targets:[],forecast:forecast.forecast,issues:rows,baseline:null,consistency:summary.consistency,capacity:{state:'not-included',scope:'captured-plan',reason:'Capacity was not included at capture. No availability is assumed.'},sections:{timeline:rows,targets:[],changes:[]}};
 const prepared=prepareSponsorReport(retained.planId,input),expected=reportSummary({...prepared.current.descriptor,issues:rows},null);assert.deepEqual(summary,expected,'Every retained summary field and full content hash must match the old complete producer');assert.equal(summary.pages.timeline,106);assert.deepEqual(summary.document.timeline.hashes,forecast.pageHashes);return {rows,summary:expected};
}
export function verifyReportPage(part,summary,number,rows){assert.deepEqual(part,{reportId:summary.id,hash:summary.hash,section:'timeline',page:number,pageCount:106,total:5300,pageHash:summary.document.timeline.hashes[number],rows:rows.slice(number*50,(number+1)*50)});assert.equal(hash(part.rows),part.pageHash);return part;}
export function expectedHtml(summary,pages){return sponsorReportHtml(summary,pages);}
