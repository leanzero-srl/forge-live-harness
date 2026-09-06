import {withReportDeparture,setReportDepartureOwner,stopReportUi} from './report-departure';
import {captureReport,cleanupOwnedReportCaptures} from './report-capture';
import {createCapacityPreferences} from './capacity-preferences.mjs';
import {settledScreenshot} from './settled-screenshot.mjs';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {test,expect} from '../../fixtures/forge';
import {get,put} from '../../data/jira.mjs';
import {withOwnedSchedule,table,editDuration,save} from './normalization-owned-fixture';
import {openPlans,LZPT_PLAN} from './forecast-fixture';
import {currentUserResolver,actualResponse,planning,chooseDate} from './campaign-ui';
test.describe.configure({retries:0,timeout:900000});
const add=(date:string,n:number)=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
function monday(){const now=new Date();return add(now.toISOString().slice(0,10),(8-now.getUTCDay())%7||7);}

test('report analytics: actual capture retains exact seeded quantiles, scoped probabilities and 20h versus 12h overload despite later schedule, effort and profile changes',async({page},info)=>{
 await withReportDeparture(page,info,async()=>{
 const M=monday(),due=add(M,4),leave=add(M,3),late=add(M,11),p50=add(M,7),p90=add(M,8);
 await withOwnedSchedule(page,info,[{label:'numeric report 20h',duration:5,start:M,due,release:true}],async(f)=>{
  const key=f.keys[0],me=await get('/rest/api/3/myself'),originalDates=await f.read(key);
  await put(`/rest/api/3/issue/${key}`,{fields:{assignee:{accountId:me.accountId},timetracking:{originalEstimate:'20h',remainingEstimate:'20h'}}});
  const effort=await get(`/rest/api/3/issue/${key}?fields=timeestimate,assignee`);expect(effort.fields.timeestimate).toBe(72000);expect(effort.fields.assignee.accountId).toBe(me.accountId);
  const rpc=currentUserResolver(page,c=>c?.functionKey==='getCapacitySettings');let originalSettings:any,restored=false,bodyError:any;
  const journal:any={key,M,due,leave,p50,p90,expectedDemand:20,expectedCapacity:12,lifecycle:[]};const retain=()=>fs.writeFileSync(info.outputPath('numeric-report-journal.json'),JSON.stringify(journal,null,2));retain();
  const preferences=createCapacityPreferences({invoke:rpc.invoke,onState:(state:any)=>{journal.preferences=state;retain();}});
  const stage=(name:string,detail:any={})=>{journal.lifecycle.push({name,time:new Date().toISOString(),...detail});retain();};
  const crashed=()=>stage('app-page-crash'),closed=()=>stage('app-page-closed'),contextClosed=()=>stage('browser-context-closed');
  page.on('crash',crashed);page.on('close',closed);page.context().on('close',contextClosed);
  try{
   let frame=await openPlans(page),pending=actualResponse(page,'getCapacitySettings');await frame.getByRole('button',{name:'Capacity',exact:true}).click();const savedSettings=await pending;originalSettings=savedSettings.settings;preferences.admit(savedSettings);journal.originalSettings=originalSettings;retain();await expect(frame.locator('[data-testid="capacity-view"]').getByRole('status')).toHaveCount(0,{timeout:120000});
   // Deliberately select the unrelated standing plan in the personal portfolio.
   // Opt-in report must still use only the captured owned plan and relevant user.
   const profile={hoursPerDay:8,partTimePct:50,reservePct:25,workingDays:[1,2,3,4,5],leaveDates:[leave]};
   let prefs=await preferences.write({selectedPlanIds:[LZPT_PLAN],profiles:{[me.accountId]:profile},issueChoices:{}});expect(prefs.success).toBe(true);expect((await rpc.invoke('getCapacitySettings')).settings.profiles[me.accountId]).toEqual(profile);
   frame=await table(page,f.name);let work=await planning(frame);await work.getByRole('button',{name:'Targets',exact:true}).click();const targets=frame.locator('[data-testid="targets-editor"]');
   for(const [name,date] of [['Scoped earliest',M],['Scoped later',late]]){
    await targets.getByRole('button',{name:'Add target',exact:true}).click();const form=targets.locator('form');await form.getByLabel('Target name',{exact:true}).fill(name);await chooseDate(frame,form,'Target date',date);await form.getByRole('combobox').click();await frame.getByRole('option',{name:`Release · ${f.name}`,exact:true}).click();await form.getByRole('button',{name:'Save target',exact:true}).click();await expect(form).toHaveCount(0);
   }
   await work.getByRole('button',{name:'Sponsor reports',exact:true}).click();let report=work.locator('[data-testid="sponsor-reports"]');await report.getByLabel('Report name',{exact:true}).fill('Numeric commitment and overload');
   await report.locator('form').getByRole('combobox').click();await report.getByRole('option',{name:'High −20% / +60%',exact:true}).click();await report.getByRole('checkbox',{name:'Include captured plan capacity',exact:true}).click();await expect(report).toContainText('become part of this shared report');await chooseDate(frame,report,'Report capacity starts',M);await chooseDate(frame,report,'Report capacity ends',add(M,6));
   const summary=await captureReport(page,report,f.planId,info,{onRecovery:f.retainForRecovery});journal.summary=summary;retain();
   // Independent fixed model oracle: triangular[4,5,8] rounded working duration;
   // seed42/300 draws places P50/P80 at6 days and P90 at7 days. Inclusive Monday
   // schedule therefore lands next Monday/Tuesday. Earliest target is below any
   // possible finish, later Friday above all samples. 4 available days×8×.5×.75=12.
   expect(summary.forecast).toMatchObject({state:'available',runs:300,seed:42,uncertainty:'high',p50,p80:p50,p90});expect(summary.forecast.modelVersion).toBeTruthy();expect(summary.forecast.inputHash).toMatch(/^[a-f0-9]{64}$/);
   expect(summary.capacity).toMatchObject({state:'available',scope:'captured-plan',startDate:M,endDate:add(M,6),sourceVersion:summary.sourceVersion,coverage:{selectedPlans:1,uniqueIssues:1,missingEffort:0,unavailableIssueCount:0},totals:{knownEffortHours:20,allocatedHours:20,outsideWindowHours:0,unallocatedHours:0}});
   expect(summary.counts).toMatchObject({timeline:1,targets:2,capacity:1,availability:1});
   await expect(report.locator('[data-testid="report-forecast"]')).toContainText(`P50 ${p50} · P80 ${p50} · P90 ${p90}`);await expect(report.locator('[data-testid="report-capacity"]')).toContainText('allocated 20h');
   const targetPage=await rpc.invoke('getSponsorReportPage',{planId:f.planId,reportId:summary.id,section:'targets',page:0});expect(targetPage.success).toBe(true);expect(targetPage.page.rows).toHaveLength(2);
   for(const target of targetPage.page.rows){expect(target).toMatchObject({scopeType:'release',scopeId:String(f.version.id),memberCount:1,forecastState:'available',p50,p80:p50,p90,probability:target.name==='Scoped earliest'?0:1});}
   const capPage=await rpc.invoke('getSponsorReportPage',{planId:f.planId,reportId:summary.id,section:'capacity',page:0});expect(capPage.success).toBe(true);expect(capPage.page.rows).toHaveLength(1);expect(capPage.page.rows[0]).toMatchObject({personId:me.accountId,week:M,demandHours:20,capacityHours:12,status:'overloaded',unknownEffortCount:0});
   const availability=await rpc.invoke('getSponsorReportPage',{planId:f.planId,reportId:summary.id,section:'availability',page:0});expect(availability.success).toBe(true);expect(availability.page.rows[0].profile).toEqual(profile);journal.targetRows=targetPage.page.rows;journal.capacityRows=capPage.page.rows;journal.availabilityRows=availability.page.rows;retain();
   const section=async(name:string)=>{await report.locator('label').filter({hasText:'Preview section'}).getByRole('combobox').click();await report.getByRole('option',{name,exact:true}).click();};
   await section('Targets (2)');const preview=report.getByRole('table',{name:'Report preview'});await expect(preview.locator('tbody tr')).toHaveCount(2);await expect(preview.locator('tbody tr').filter({hasText:'Scoped earliest'})).toContainText('By target: 0%');await expect(preview.locator('tbody tr').filter({hasText:'Scoped later'})).toContainText('By target: 100%');await settledScreenshot(report,{path:info.outputPath('numeric-report-target-probabilities.png')});
   await section('Capacity (1)');await expect(preview.locator('tbody tr')).toHaveCount(1);await expect(preview.locator('tbody tr')).toContainText('overloaded');await expect(preview.locator('tbody tr td').last()).toHaveText('20h / 12h');await settledScreenshot(report,{path:info.outputPath('numeric-report-captured-overload.png')});
   const download=async(suffix:string)=>{
    stage('download-wait-started',{suffix});const event=page.waitForEvent('download',{timeout:120000});event.catch(()=>{});
    await report.getByRole('button',{name:'Download complete HTML report',exact:true}).click();stage('download-button-clicked',{suffix});
    const file=await event;stage('download-event-observed',{suffix,filename:file.suggestedFilename()});expect(file.suggestedFilename()).toBe(`sponsor-report-${summary.id}.html`);
    const path=info.outputPath(`numeric-report-${suffix}.html`);await file.saveAs(path);stage('download-saved',{suffix,bytes:fs.statSync(path).size});return path;
   };
   const first=await download('original');stage('report-document-page-opening');const doc=await page.context().newPage(),external:string[]=[];stage('report-document-page-opened');doc.on('request',(r:any)=>{if(/^https?:/.test(r.url()))external.push(r.url());});
   let documentError:any;
   try{
    stage('report-document-navigation-started');await doc.goto(pathToFileURL(first).href);stage('report-document-navigation-completed');await expect(doc.locator('script,iframe,img,link')).toHaveCount(0);expect(external).toEqual([]);await expect(doc.locator('tr[data-issue-key]')).toHaveCount(1);await expect(doc.locator(`tr[data-issue-key="${key}"]`)).toContainText(M);await expect(doc.locator(`tr[data-issue-key="${key}"]`)).toContainText(due);
    await expect(doc.locator('body')).toContainText(`P50 ${p50} · P80 ${p50} · P90 ${p90}`);await expect(doc.locator('tr[data-target-key]')).toHaveCount(2);for(const[name,probability]of[['Scoped earliest','0%'],['Scoped later','100%']]){const row=doc.locator('tr[data-target-key]').filter({hasText:name});await expect(row.locator('td').nth(3)).toHaveText(`${p50} / ${p50} / ${p90}`);await expect(row.locator('td').nth(4)).toHaveText(probability);}
    const cap=doc.locator('tr[data-capacity-key]');await expect(cap).toHaveCount(1);await expect(cap.locator('td').nth(2)).toHaveText('20');await expect(cap.locator('td').nth(3)).toHaveText('12');await expect(cap.locator('td').nth(5)).toHaveText('overloaded');await expect(doc.locator('body')).toContainText(leave);await expect(doc.locator('body')).not.toContainText('LZPT-');await settledScreenshot(doc,{subject:cap,path:info.outputPath('numeric-report-complete-html.png'),fullPage:true});stage('report-pdf-started');await doc.pdf({path:info.outputPath('numeric-report.pdf'),printBackground:true,preferCSSPageSize:true});stage('report-pdf-saved');
   }catch(error){documentError=error;stage('report-document-error',{message:String((error as any)?.message||error)});throw error;}finally{stage('report-document-close-started');try{await doc.close();stage('report-document-close-completed');}catch(error){stage('report-document-close-error',{message:String((error as any)?.message||error)});throw new AggregateError([...(documentError?[documentError]:[]),error],'Report document body/close failures');}}
   frame=await table(page,f.name);await editDuration(frame,key,'9');await save(frame);expect(await f.read(key)).toEqual(originalDates);
   await put(`/rest/api/3/issue/${key}`,{fields:{timetracking:{originalEstimate:'40h',remainingEstimate:'40h'}}});expect((await get(`/rest/api/3/issue/${key}?fields=timeestimate`)).fields.timeestimate).toBe(144000);
   expect((await preferences.write({selectedPlanIds:[LZPT_PLAN],profiles:{[me.accountId]:{...profile,hoursPerDay:1,leaveDates:[]}},issueChoices:{}})).success).toBe(true);
   frame=await table(page,f.name);work=await planning(frame);await work.getByRole('button',{name:'Sponsor reports',exact:true}).click();report=work.locator('[data-testid="sponsor-reports"]');await report.getByRole('navigation',{name:'Retained sponsor reports'}).getByRole('button').filter({hasText:'Numeric commitment and overload'}).click();await expect(report.locator('[data-testid="report-forecast"]')).toContainText(`P50 ${p50} · P80 ${p50} · P90 ${p90}`);
   expect((await rpc.invoke('getSponsorReport',{planId:f.planId,reportId:summary.id})).report).toEqual(summary);expect((await rpc.invoke('getSponsorReportPage',{planId:f.planId,reportId:summary.id,section:'capacity',page:0})).page.rows).toEqual(capPage.page.rows);
   const second=await download('after-live-changes');expect(fs.readFileSync(second,'utf8')).toBe(fs.readFileSync(first,'utf8'));journal.immutableAfterScheduleEffortProfileChanges=true;retain();
   await report.getByRole('button',{name:'Delete report',exact:true}).click();await frame.getByRole('dialog',{name:'Delete sponsor report',exact:true}).getByRole('button',{name:'Delete report',exact:true}).click();await expect(report.getByRole('navigation',{name:'Retained sponsor reports'}).getByRole('button')).toHaveCount(0);
  }catch(error){bodyError=error;journal.bodyError={name:(error as any)?.name,message:String((error as any)?.message||error)};retain();throw error;}finally{
   const cleanupErrors:any[]=[];
   try{await cleanupOwnedReportCaptures(page,f.planId,info,{onRecovery:f.retainForRecovery});}catch(error){cleanupErrors.push(error);journal.reportCleanupError=String(error);retain();}
   try{const state=await preferences.restore();restored=!state.initialized||state.restored;}
   catch(error){f.retainForRecovery(error);cleanupErrors.push(error);journal.settingsCleanupError={name:(error as any)?.name,message:String((error as any)?.message||error)};retain();}
   finally{rpc.stop();journal.originalPrivateSettingsRestored=restored;retain();page.off('crash',crashed);page.off('close',closed);page.context().off('close',contextClosed);}
   if(cleanupErrors.length)throw new AggregateError([...(bodyError?[bodyError]:[]),...cleanupErrors],'Numeric report body and independent cleanup failures');
  }
 });
 });
});
