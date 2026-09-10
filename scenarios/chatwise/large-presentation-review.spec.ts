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
  await frame.locator(`.conversation-item[data-conversation-id="${entry.conversationId}"]`).click();
  await awaitSwapSettled(frame);
  if(!prior){
    await readAppState(frame,GLOBAL_APP,`(app.services.jobMonitoring.monitorJob(${JSON.stringify(original.jobId)},{stateKey:app.sendingStateKey}),true)`);
    const button=frame.getByRole('button',{name:'Review presentation',exact:true}).last();
    await expect(button).toBeVisible({timeout:60000});
    await expect.poll(()=>readAppState(frame,GLOBAL_APP,'app.components.chat.isStreaming'),{timeout:60000}).toBe(false);
    await expect(button).toBeEnabled();
    entry.state='submitting';entry.requestedAt=new Date().toISOString();save();
    await button.click();
    await expect.poll(async()=>{
      const id=await readAppState(frame,GLOBAL_APP,'app.currentJobId');
      if(id&&id!==original.jobId){entry.jobId=id;save();return true;}return false;
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
    if(['completed','failed','cancelled'].includes(snapshot?.status)){entry.result=snapshot;save();break;}
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
