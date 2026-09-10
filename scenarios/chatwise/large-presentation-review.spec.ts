// Review the actual saved large deck through its public UI. No source upload or hand-authored patches.
import { test, expect } from '../../fixtures/forge';
import { getTarget } from '../../config/targets';
import { BASE_URL } from '../../config/env';
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver, awaitSwapSettled, readAppState } from './chatwise-support';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

test.describe.configure({ retries: 0 });
test('review saved large presentation and download its verified revision', async ({ page }) => {
  test.skip(process.env.CW_LARGE_REVIEW !== '1', 'Explicit paid review acceptance required');
  test.setTimeout(1800000);
  expect(new URL(BASE_URL).hostname).toBe('wolfaenpak.atlassian.net');
  const folder='/tmp/cw-large-context-paid';
  const original=JSON.parse(readFileSync(`${folder}/result.json`,'utf8'));
  expect(original.jobId).toBe('job_1789069156385_xbqa4j602');
  expect(original.result.result.finishedAt).toBe('2026-09-10T20:53:44.647Z');
  expect(original.browserDownload.bytes).toBe(157912);
  const journal=`${folder}/review-result.json`;
  const prior=existsSync(journal)?JSON.parse(readFileSync(journal,'utf8')):null;
  const entry:any=prior||{originalJobId:original.jobId,conversationId:original.conversationId,originalArtifact:original.artifact};
  const save=()=>writeFileSync(journal,JSON.stringify(entry,null,2));
  const frame=await openGlobalPage(page,getTarget('chatwise-global'));
  await waitForChatApp(page,frame,GLOBAL_APP);
  await expect(frame.locator('body')).toContainText(process.env.CW_EXPECT_VERSION||'v6.149.0');
  if(process.env.CW_LARGE_REVIEW_CANCEL==='1'){
    expect(entry.jobId).toBe('job_1789069156385_review955c64c3faacfda0');
    entry.cancellation={requestedAt:new Date().toISOString(),response:await callResolver<any>(frame,GLOBAL_APP,'cancelJob',{jobId:entry.jobId})};save();
    const stopped=await callResolver<any>(frame,GLOBAL_APP,'getJobStatus',{jobId:entry.jobId});
    entry.cancellation.readback=stopped;save();expect(stopped.data.status).toBe('cancelled');return;
  }
  await frame.locator(`.conversation-item[data-conversation-id="${entry.conversationId}"]`).click();
  await awaitSwapSettled(frame);
  if(process.env.CW_LARGE_REVIEW_RESUME==='1'){
    const budgetCut=process.env.CW_LARGE_REVIEW_BUDGET==='1';
    const outputCut=process.env.CW_LARGE_REVIEW_OUTPUT==='1';
    expect(prior,'Resume requires the existing paid review receipt').toBeTruthy();
    expect(process.env.CW_EXPECT_VERSION).toBe(outputCut?'v6.153.0':budgetCut?'v6.152.0':'v6.150.0');
    expect(entry.jobId).toBe(budgetCut||outputCut?'job_1789069156385_reviewc23ca3b6ee714d07':'job_1789069156385_review955c64c3faacfda0');
    expect(entry.resumeAttempts||[],'Never repeat a paid resume automatically').toHaveLength(outputCut?2:budgetCut?1:0);
    expect(entry.result?.result?.finishedAt).toBe(outputCut?'2026-09-10T21:52:44.133Z':budgetCut?'2026-09-10T21:44:30.838Z':'2026-09-10T21:19:53.138Z');
    expect(entry.result?.result?.usage?.total_tokens).toBe(outputCut?39003:budgetCut?0:50213);
    if(budgetCut)expect(entry.result.result.response).toContain('estimated 213786 tokens');
    if(outputCut)expect(entry.result.result.response).toContain('register response exhausted');
    expect(entry.artifact).toBeFalsy();
    const saved=await callResolver<any>(frame,GLOBAL_APP,'getJobStatus',{jobId:entry.jobId});
    expect(saved.data.status).toBe('completed');
    expect(saved.data.result.finishedAt).toBe(entry.result.result.finishedAt);
    expect(saved.data.result.presentationResume?.jobId).toBe(entry.jobId);
    await readAppState(frame,GLOBAL_APP,`(app.services.jobMonitoring.monitorJob(${JSON.stringify(entry.jobId)},{stateKey:app.sendingStateKey}),true)`);
    const resume=frame.locator('.presentation-resume-btn').last();
    await expect(resume).toBeVisible({timeout:60000});
    await expect.poll(()=>readAppState(frame,GLOBAL_APP,'app.components.chat.isStreaming'),{timeout:60000}).toBe(false);
    await expect(resume).toBeEnabled();
    const resumeMessageId=await resume.evaluate(el=>el.closest<HTMLElement>('[data-message-id]')?.dataset.messageId);
    expect(resumeMessageId).toBeTruthy();
    entry.resumeFrom=saved.data.result.finishedAt;
    entry.resumeAttempts=[...(entry.resumeAttempts||[]),{result:entry.result,requestedAt:new Date().toISOString(),resumeFrom:entry.resumeFrom}];
    delete entry.result;delete entry.lastSnapshot;entry.state='resuming';save();
    await resume.click();
    await expect(frame.locator(`[data-message-id="${resumeMessageId}"] .presentation-resume-btn`)).toHaveCount(0,{timeout:60000});
    entry.resumeAttempts.at(-1).dispatchAcceptedAt=new Date().toISOString();save();
  }
  const recoverCancelled=process.env.CW_LARGE_REVIEW_RECOVER_CANCELLED==='1';
  if(recoverCancelled){
    expect(process.env.CW_EXPECT_VERSION).toBe('v6.151.0');
    expect(entry.jobId).toBe('job_1789069156385_review955c64c3faacfda0');
    expect(entry.cancellation?.readback?.data?.status).toBe('cancelled');
    expect(entry.recoveryRequestedAt,'Never dispatch a second recovery automatically').toBeFalsy();
    const current=await callResolver<any>(frame,GLOBAL_APP,'getJobStatus',{jobId:entry.jobId});
    expect(current.data.status).toBe('cancelled');
    writeFileSync(`${folder}/review-cancelled-v6150.json`,JSON.stringify(entry,null,2));
  }
  if(!prior||recoverCancelled){
    await readAppState(frame,GLOBAL_APP,`(app.services.jobMonitoring.monitorJob(${JSON.stringify(original.jobId)},{stateKey:app.sendingStateKey}),true)`);
    const button=frame.getByRole('button',{name:'Review presentation',exact:true}).last();
    await expect(button).toBeVisible({timeout:60000});
    await expect.poll(()=>readAppState(frame,GLOBAL_APP,'app.components.chat.isStreaming'),{timeout:60000}).toBe(false);
    await expect(button).toBeEnabled();
    const previousJobId=entry.jobId;
    if(recoverCancelled){entry.recoveryRequestedAt=new Date().toISOString();entry.previousJobId=previousJobId;delete entry.result;delete entry.lastSnapshot;delete entry.resumeFrom;}
    entry.state='submitting';entry.requestedAt=new Date().toISOString();save();
    await button.click();
    await expect.poll(async()=>{
      const id=await readAppState(frame,GLOBAL_APP,'app.currentJobId');
      if(id&&id!==original.jobId&&id!==previousJobId){entry.jobId=id;save();return true;}return false;
    },{timeout:60000}).toBe(true);
    entry.dispatchAcceptedAt=new Date().toISOString();entry.state='reviewing';save();
  }
  expect(entry.jobId,'An uncertain request must be inspected, never resent').toBeTruthy();
  let lastProgress='';const deadline=Date.now()+1500000;
  while(Date.now()<deadline){
    const response=await callResolver<any>(frame,GLOBAL_APP,'getJobStatus',{jobId:entry.jobId});
    const snapshot=response.data;entry.lastSnapshot=snapshot;save();
    const label=snapshot?.result?.progressNote||snapshot?.status;
    if(label&&label!==lastProgress){console.log('REVIEW_PROGRESS',label);lastProgress=label;}
    if(existsSync(`${folder}/STOP-REVIEW.txt`)||(/^Reading source section/.test(label||'')&&['processing','retrying'].includes(snapshot?.status))){
      entry.automaticStop={reason:existsSync(`${folder}/STOP-REVIEW.txt`)?'operator stop':'Review unexpectedly entered source preparation',requestedAt:new Date().toISOString(),response:await callResolver<any>(frame,GLOBAL_APP,'cancelJob',{jobId:entry.jobId})};
      entry.automaticStop.readback=await callResolver<any>(frame,GLOBAL_APP,'getJobStatus',{jobId:entry.jobId});save();
      throw new Error(entry.automaticStop.reason);
    }
    if(['completed','failed','cancelled'].includes(snapshot?.status)&&
      !(entry.resumeFrom&&snapshot?.result?.finishedAt===entry.resumeFrom)){entry.result=snapshot;save();break;}
    await page.waitForTimeout(4000);
  }
  const result=entry.result?.result;
  expect(entry.result?.status).toBe('completed');
  expect(result?.truncated).not.toBe(true);
  expect(result?.decks).toHaveLength(1);
  const deck=result.decks[0];expect(deck.slides).toBe(30);expect(deck.handle).not.toBe(original.artifact.handle);
  const content=await callResolver<any>(frame,GLOBAL_APP,'getDeckContent',{handle:deck.handle,conversationId:entry.conversationId});
  const bytes=Buffer.from(content.base64,'base64');
  expect(bytes.subarray(0,2).toString()).toBe('PK');expect(bytes.length).toBe(deck.sizeBytes);
  entry.artifact={...deck,path:`${folder}/reviewed-${deck.filename}`};writeFileSync(entry.artifact.path,bytes);save();
  await readAppState(frame,GLOBAL_APP,`(app.services.jobMonitoring.monitorJob(${JSON.stringify(entry.jobId)},{stateKey:app.sendingStateKey}),true)`);
  await expect.poll(()=>readAppState(frame,GLOBAL_APP,'app.components.chat.isStreaming'),{timeout:60000}).toBe(false);
  await frame.locator(`.conversation-item[data-conversation-id="${entry.conversationId}"]`).click();await awaitSwapSettled(frame);
  const originalCard=frame.locator(`.deck-card[data-deck-id="${original.artifact.handle}"]`);
  await expect(originalCard).toBeVisible();
  const card=frame.locator(`.deck-card[data-deck-id="${deck.handle}"]`);await expect(card).toBeVisible({timeout:60000});
  const download=page.waitForEvent('download',{timeout:60000});await card.getByRole('button',{name:'Download',exact:true}).click();
  const file=await download;await file.saveAs(`${folder}/reviewed-browser-download.pptx`);
  expect(readFileSync(`${folder}/reviewed-browser-download.pptx`).equals(bytes)).toBe(true);
  entry.browserDownload={bytes:bytes.length,verifiedAt:new Date().toISOString()};entry.state='downloaded';save();
  await page.screenshot({path:`${folder}/reviewed-final.png`,fullPage:true});
});
