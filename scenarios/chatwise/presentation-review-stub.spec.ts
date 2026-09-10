import { test, expect } from '@playwright/test';
import { buildStub, darkVariant, Surface } from './_stub/build';
let pages: Record<Surface,string>;
test.beforeAll(()=>{pages=buildStub();});
for(const surface of ['globalPage','issuePanel'] as Surface[]) for(const dark of [false,true]){
 test(`${surface} ${dark?'dark':'light'} completed presentation review action`,async({page})=>{
  await page.goto(dark?darkVariant(pages[surface]):pages[surface]);
  await page.evaluate(()=>{
   const chat=new (window as any).CW.ChatInterface();
   (window as any).reviewCalls=0;
   chat.setPresentationReviewHandler(async(draft:any)=>{(window as any).reviewCalls++;if(draft.jobId!=='job_123_abc')throw new Error('wrong source job');return {success:true};});
   chat.setStreaming(true, "Finishing the current reply");
   chat.addMessageBatch([{id:'original',role:'assistant',content:'The original presentation is ready.',decks:[{handle:'saved-file',filename:'original.pptx',slides:30}],presentationReview:{jobId:'job_123_abc'}}]);
   (window as any).chat=chat;
  });
  const button=page.getByRole('button',{name:'Review presentation',exact:true});
  await expect(button).toBeVisible();await expect(button).toBeDisabled();
  await button.evaluate((el:HTMLButtonElement)=>el.click());
  expect(await page.evaluate(()=>(window as any).reviewCalls)).toBe(0);
  await page.evaluate(()=>{(window as any).chat.renderMessages();});
  await expect(button).toHaveCount(1);await expect(button).toBeDisabled();
  await page.evaluate(()=>{(window as any).chat.setStreaming(false);});
  await expect(button).toBeEnabled();
  await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
  await page.screenshot({path:`/tmp/cw-review-${surface}-${dark?'dark':'light'}.png`,fullPage:true});
  await button.click();expect(await page.evaluate(()=>(window as any).reviewCalls)).toBe(1);
  await expect(page.getByRole('button',{name:'Review started',exact:true})).toBeDisabled();
  await expect(page.locator('.deck-card-name')).toHaveText('original.pptx');
  await page.evaluate(()=>{(window as any).chat.renderMessages();});
  await expect(button).toHaveCount(0);await expect(page.locator('.deck-card-name')).toHaveText('original.pptx');
 });
}
