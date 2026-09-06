import fs from 'node:fs';import {createHash} from 'node:crypto';
import {retained} from './seventeenth-report-recovery-contract.mjs';
import assert from 'node:assert/strict';
import {UI_READS} from './seventeenth-forecast-resume-contract.mjs';
// Frozen actual5300 fixture accounting: app b5fef6e7. Units are conservative model reservations, not billed telemetry.
export const READ_COST=Object.freeze({advance:768,status:64,probe:1024,source:640,snapshot:512,summary:128,page:16,other:64});
export function resolverReadCost(key){
 if(key==='advanceSponsorReportCapture')return READ_COST.advance;
 assert.ok(UI_READS.includes(key)||['presenceBeat','presenceLeave'].includes(key),'Unknown resolver has no read budget/authority');
 if(key==='getSponsorReportCapture')return READ_COST.status;if(key==='getSnapshot')return READ_COST.snapshot;if(key==='getSponsorReport')return READ_COST.summary;if(key==='getSponsorReportPage')return READ_COST.page;
 if(['getPlan','getAllIssues','getIssues','getPlanSchedule','getPlanAssets','getCapacityReport'].includes(key))return READ_COST.source;
 return READ_COST.other;
}
export function hookReadCost(query){assert.ok(['plans','plan','reportCaptureState'].includes(query.what),'Unapproved hook');return query.what==='reportCaptureState'?READ_COST.probe:query.what==='plan'?READ_COST.source:READ_COST.other;}

const reservationBytes=fs.readFileSync(new URL('../../tests/seventeenth-paced-resume/advance-reservations.json',import.meta.url));
assert.equal(createHash('sha256').update(reservationBytes).digest('hex'),'22727779a2d546cba0a2d3e5158cb4d5df9bf9acaaff24b709309eb1d23d4faf');
const reservations=JSON.parse(reservationBytes);assert.equal(reservations.actualJournalSha256,'333e483b880dae0c81e9369e461c612c8dd99d8daa4e9ee6f4fb9e702b5a02f7');
export function advanceReadCost(job){for(const key of ['jobId','reportId','requestId'])assert.equal(job[key==='jobId'?'id':key],retained[key]);assert.equal(job.state,'active');assert.deepEqual(job.forecastRuns,{completed:40,total:40});return Object.hasOwn(reservations.byPriorAcknowledgedStage,job.stageLabel)?reservations.byPriorAcknowledgedStage[job.stageLabel]:reservations.fallbackUnits;}
