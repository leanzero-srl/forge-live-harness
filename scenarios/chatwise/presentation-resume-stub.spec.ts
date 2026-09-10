import { test, expect } from '@playwright/test';
import { buildStub, darkVariant, Surface } from './_stub/build';
let pages: Record<Surface,string>;
test.beforeAll(()=>{pages=buildStub();});
for(const surface of ['globalPage','issuePanel'] as Surface[]) for(const dark of [false,true]){
 test(`${surface} ${dark?'dark':'light'} saved presentation resume action`,async({page})=>{
  await page.goto(dark?darkVariant(pages[surface]):pages[surface]);
  await page.evaluate(()=>{
   const chat=new (window as any).CW.ChatInterface();
   (window as any).resumeCalls=0;
   chat.setPresentationResumeHandler(async(draft:any)=>{(window as any).resumeCalls++;if(draft.jobId!=='job_123_abc')throw new Error('wrong saved job');return {success:true};});
   chat.setStreaming(true, "Finishing the current reply");
   chat.addMessageBatch([{id:'saved',role:'assistant',content:'The presentation paused. Its source notes and outline remain saved.',truncated:true,presentationResume:{jobId:'job_123_abc',completedSlides:5,requestedSlides:30}}]);
   (window as any).chat=chat;
  });
  const button=page.getByRole('button',{name:'Resume presentation',exact:true});
  await expect(button).toBeVisible();await expect(page.locator('.presentation-resume')).toContainText('5 of 30 slides saved');
  await page.evaluate(()=>{(window as any).chat.renderMessages();});
  await expect(button).toHaveCount(1);
  await expect(button).toBeDisabled();
  // Native click on the actual disabled control must not submit a resume.
  await button.evaluate((element:HTMLButtonElement)=>element.click());
  expect(await page.evaluate(()=>(window as any).resumeCalls)).toBe(0);
  await page.evaluate(()=>{(window as any).chat.setStreaming(false);});
  await expect(button).toBeEnabled();
  // Existing controls track a later operation as well as their creation state.
  await page.evaluate(()=>{(window as any).chat.setStreaming(true,'Another operation');});
  await expect(button).toBeDisabled();
  await page.evaluate(()=>{(window as any).chat.setStreaming(false);});
  await expect(button).toBeEnabled();
  const box=await button.boundingBox();expect(box?.width).toBeGreaterThan(100);
  await page.evaluate(async()=>{await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
  await page.screenshot({path:`/tmp/cw-resume-${surface}-${dark?'dark':'light'}.png`,fullPage:true});
  await button.click();await expect(button).toHaveCount(0);expect(await page.evaluate(()=>(window as any).resumeCalls)).toBe(1);
  await page.evaluate(()=>{(window as any).chat.renderMessages();});await expect(button).toHaveCount(0);
 });
}
