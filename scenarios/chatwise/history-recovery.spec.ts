import { test, expect } from '../../fixtures/forge';
import { getTarget } from '../../config/targets';
import { BASE_URL } from '../../config/env';
import { GLOBAL_APP, openGlobalPage, waitForChatApp, readAppState } from './chatwise-support';
import { writeFileSync } from 'node:fs';

test('saved history loads and recovers visibly from a failed read without inference', async ({page}) => {
  test.skip(process.env.CW_HISTORY_CHECK!=='1','Explicit read-only history check');
  test.setTimeout(180000);
  expect(new URL(BASE_URL).hostname).toBe('wolfaenpak.atlassian.net');
  const start=Date.now();
  const frame=await openGlobalPage(page,getTarget('chatwise-global'));
  await waitForChatApp(page,frame,GLOBAL_APP);
  await expect(frame.locator('body')).toContainText(process.env.CW_EXPECT_VERSION!);
  const usableMs=Date.now()-start;
  await expect(frame.locator('.conversation-item').first()).toBeVisible({timeout:60000});
  const historyMs=Date.now()-start;
  const count=await frame.locator('.conversation-item').count();
  expect(count).toBeGreaterThan(0);
  if(process.env.CW_HISTORY_BASELINE!=='1') {
    await readAppState(frame,GLOBAL_APP,`(async()=>{const manager=app.components.conversationManager; const api=manager.api; const original=api.call; api.call=function(name,...args){if(name==='getUserConversations')return Promise.resolve({success:false,error:'Injected read failure'});return original.call(this,name,...args);}; try{return await manager.loadConversations();}finally{api.call=original;}})()`);
    await expect(frame.getByText('Chat history could not be loaded.',{exact:true})).toBeVisible();
    expect(await frame.locator('.conversation-item').count()).toBe(count);
    await frame.getByRole('button',{name:'Retry chat history',exact:true}).click();
    await expect(frame.getByText('Loading chat history…',{exact:true})).toBeVisible();
    await expect(frame.getByText('Chat history could not be loaded.',{exact:true})).toHaveCount(0);
    await expect.poll(()=>readAppState(frame,GLOBAL_APP,'app.components.conversationList.historyState'),{timeout:60000}).toBe('loaded');
    expect(await frame.locator('.conversation-item').count()).toBe(count);
    await expect(frame.getByRole('button',{name:'Retry chat history',exact:true})).toHaveCount(0);
  }
  const receipt={version:process.env.CW_EXPECT_VERSION,usableMs,historyMs,count,at:new Date().toISOString(),recoveryChecked:process.env.CW_HISTORY_BASELINE!=='1'};
  writeFileSync(`/tmp/cw-history-${process.env.CW_EXPECT_VERSION}.json`,JSON.stringify(receipt,null,2));
  console.log('HISTORY_READ_ONLY',JSON.stringify(receipt));
});
