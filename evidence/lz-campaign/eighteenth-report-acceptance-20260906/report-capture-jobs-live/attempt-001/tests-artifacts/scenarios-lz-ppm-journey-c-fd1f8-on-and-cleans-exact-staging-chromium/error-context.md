# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/journey-campaign-report-jobs.spec.ts >> report jobs: changed owned source during pause refuses publication and cleans exact staging
- Location: scenarios/lz-ppm/journey-campaign-report-jobs.spec.ts:14:32

# Error details

```
AggregateError: Report capture recovery required; exact owned fixtures retained, cleanup not passed
```

```
AggregateError: Report job body/cleanup failure; exact recovery state retained
```

```
Error: Owned report departure failed; exact fixture retained
```

```
Error: Report capture cleanup is unverified; exact owned resources must be retained.
```

```
Error: Owned report departure failed; exact fixture retained
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic:
    - generic: "Skip to:"
    - list:
      - listitem:
        - link "Top Bar":
          - /url: "#jira-page-layout-top-nav"
      - listitem:
        - link "Sidebar":
          - /url: "#jira-page-layout-side-nav"
      - listitem:
        - link "Main Content":
          - /url: "#jira-page-layout-main"
  - generic [ref=e3]:
    - banner [ref=e4]:
      - generic [ref=e5]:
        - button "Collapse sidebar" [ref=e6] [cursor=pointer]:
          - generic [ref=e8]: Collapse sidebar
        - button "Switch sites or apps" [ref=e12] [cursor=pointer]:
          - generic [ref=e15]: Switch sites or apps
        - link "Go to your Jira homepage" [ref=e17] [cursor=pointer]:
          - /url: /jira
          - generic [ref=e18]:
            - img [ref=e21]
            - generic [ref=e26]: Jira
      - generic [ref=e27]:
        - button [ref=e28] [cursor=pointer]:
          - search [ref=e29]:
            - combobox "Search, press enter to navigate to advanced search with your text query" [ref=e32]
            - button "Open app connections" [ref=e34]:
              - generic: Connect apps
        - button "Create" [ref=e37] [cursor=pointer]:
          - generic [ref=e40]: Create
      - navigation "Actions" [ref=e41]:
        - list [ref=e42]:
          - listitem [ref=e43]:
            - button "Rovo Ask Rovo" [ref=e45] [cursor=pointer]:
              - img "Rovo" [ref=e47]:
                - img [ref=e48]
              - generic [ref=e53]: Ask Rovo
          - listitem [ref=e54]:
            - generic [ref=e56]:
              - button "Over 9 Notifications" [ref=e57] [cursor=pointer]:
                - generic [ref=e60]: Over 9 Notifications
              - generic:
                - generic:
                  - generic:
                    - generic: 9+
          - listitem [ref=e64]:
            - button "Help" [ref=e65] [cursor=pointer]:
              - generic [ref=e68]: Help
          - listitem [ref=e70]:
            - button "Settings" [ref=e71] [cursor=pointer]:
              - generic [ref=e74]: Settings
          - listitem [ref=e75]:
            - button "mihai@wolfaenpak.com" [ref=e76] [cursor=pointer]:
              - generic [ref=e77]:
                - img [ref=e80]
                - generic [ref=e81]: mihai@wolfaenpak.com
    - navigation "Sidebar" [ref=e82]:
      - generic [ref=e85]:
        - list [ref=e86]:
          - generic [ref=e88]:
            - listitem [ref=e90]:
              - link "For you" [ref=e92] [cursor=pointer]:
                - /url: /jira/for-you
                - generic [ref=e97]: For you
            - listitem [ref=e98]:
              - button "Recent" [ref=e100] [cursor=pointer]:
                - generic [ref=e104]: Recent
            - listitem [ref=e105]:
              - button "Starred" [ref=e107] [cursor=pointer]:
                - generic [ref=e111]: Starred
            - listitem [ref=e112]:
              - generic [ref=e113]:
                - generic [ref=e115]:
                  - button "Apps" [expanded] [ref=e116] [cursor=pointer]:
                    - generic [ref=e120]: Apps
                  - button "More actions for Apps" [ref=e122] [cursor=pointer]:
                    - generic [ref=e125]: More actions for Apps
                - list [ref=e126]:
                  - listitem [ref=e127]:
                    - group "Your apps" [ref=e128]:
                      - paragraph [ref=e129]: Your apps
                      - list [ref=e131]:
                        - listitem [ref=e132]:
                          - generic [ref=e133]:
                            - link "Altomata" [ref=e134] [cursor=pointer]:
                              - /url: /jira/apps/8513392b-129b-4ad1-9b09-811804ca5705/244ac2e9-6cbb-4012-99ae-1f958fc9309c
                              - generic [ref=e139]: Altomata
                            - generic:
                              - generic:
                                - img
                            - generic:
                              - button "More actions":
                                - generic [ref=e142] [cursor=pointer]: More actions
                            - generic:
                              - generic:
                                - generic: Dev
                        - listitem [ref=e143]:
                          - generic [ref=e144]:
                            - link "Assigned items" [ref=e145] [cursor=pointer]:
                              - /url: /plugins/servlet/ac/com.herocoders.plugins.jira.issuechecklist-free/assigned-items-page?project.key=WFH&project.id=10001
                              - generic [ref=e150]: Assigned items
                            - generic:
                              - generic:
                                - img
                            - generic:
                              - button "More actions":
                                - generic [ref=e153] [cursor=pointer]: More actions
                        - listitem [ref=e154]:
                          - generic [ref=e155]:
                            - link "ChatWise AI Assistant" [ref=e156] [cursor=pointer]:
                              - /url: /jira/apps/97022e0a-df09-4df1-818c-c4593b956122/8613e672-d4ba-4afb-9bbe-d4b5a368a264
                              - generic [ref=e161]: ChatWise AI Assistant
                            - generic:
                              - generic:
                                - img
                            - generic:
                              - button "More actions":
                                - generic [ref=e164] [cursor=pointer]: More actions
                            - generic:
                              - generic:
                                - generic: Dev
                        - listitem [ref=e165]:
                          - generic [ref=e166]:
                            - link "CogniRunner" [ref=e167] [cursor=pointer]:
                              - /url: /jira/apps/36415848-6868-4697-9554-3c3ad87b8da9/989ecaa0-261b-406e-b444-78c01c0d7772
                              - generic [ref=e172]: CogniRunner
                            - generic:
                              - generic:
                                - img
                            - generic:
                              - button "More actions":
                                - generic [ref=e175] [cursor=pointer]: More actions
                            - generic:
                              - generic:
                                - generic: Dev
                        - listitem [ref=e176]:
                          - generic [ref=e177]:
                            - link "CogniRunner" [ref=e178] [cursor=pointer]:
                              - /url: /jira/apps/36415848-6868-4697-9554-3c3ad87b8da9/37dd35f1-42db-4e65-8e91-b2f18caed58d
                              - generic [ref=e183]: CogniRunner
                            - generic:
                              - generic:
                                - img
                            - generic:
                              - button "More actions":
                                - generic [ref=e186] [cursor=pointer]: More actions
                        - listitem [ref=e187]:
                          - generic [ref=e188]:
                            - link "LeanZero Management" [ref=e189] [cursor=pointer]:
                              - /url: /jira/apps/087a8e18-d45a-4cb7-9d87-3e84101ac4f3/d6096af9-3082-4ee1-a05e-f8b61d766b77
                              - generic [ref=e194]: LeanZero Management
                            - generic:
                              - generic:
                                - img
                            - generic:
                              - button "More actions":
                                - generic [ref=e197] [cursor=pointer]: More actions
                            - generic:
                              - generic:
                                - generic: Dev
                        - listitem [ref=e198]:
                          - generic [ref=e199]:
                            - link "ScriptRunner Enhanced Search" [ref=e200] [cursor=pointer]:
                              - /url: /plugins/servlet/ac/com.onresolve.jira.groovy.groovyrunner/jql-search-view?project.key=WFH&project.id=10001
                              - generic [ref=e205]: ScriptRunner Enhanced Search
                            - generic:
                              - generic:
                                - img
                            - generic:
                              - button "More actions":
                                - generic [ref=e208] [cursor=pointer]: More actions
                        - listitem [ref=e209]:
                          - generic [ref=e210]:
                            - link "ScriptRunner for Jira" [ref=e211] [cursor=pointer]:
                              - /url: /plugins/servlet/ac/com.onresolve.jira.groovy.groovyrunner/post-install-nav-link?project.key=WFH&project.id=10001
                              - generic [ref=e216]: ScriptRunner for Jira
                            - generic:
                              - generic:
                                - img
                            - generic:
                              - button "More actions":
                                - generic [ref=e219] [cursor=pointer]: More actions
                        - listitem [ref=e220]:
                          - generic [ref=e221]:
                            - link "SolarEdge PPM" [ref=e222] [cursor=pointer]:
                              - /url: /jira/apps/f09330db-cac4-4243-938c-42d256fe31c7/42ad8473-d18e-4d45-aa3e-1b425ba11b44
                              - generic [ref=e227]: SolarEdge PPM
                            - generic:
                              - button "More actions":
                                - generic [ref=e230] [cursor=pointer]: More actions
                            - generic:
                              - generic:
                                - generic: Dev
                  - listitem [ref=e231]:
                    - group "Recommended for your team" [ref=e232]:
                      - paragraph [ref=e233]: Recommended for your team
                      - list [ref=e234]:
                        - listitem [ref=e235]:
                          - generic [ref=e236]:
                            - link "Backbone Work Sync for Jira (Two Way Issue Sync) , (opens new window)" [ref=e237] [cursor=pointer]:
                              - /url: /jira/marketplace/discover/app/com.k15t.backbone.backbone-issue-sync?source=side_nav_recommendations_jira&recoSessionId=cc380d5f-a400-4308-8d4c-ba1cff7222d9&recoEntityId=fd952d18bc77797673b685009ba8520e9656df27515b7e0491bd61e8d8de9e0b
                              - generic [ref=e242]: Backbone Work Sync for Jira (Two Way Issue Sync)
                              - generic [ref=e243]: ", (opens new window)"
                            - generic:
                              - generic:
                                - img
                        - listitem [ref=e244]:
                          - generic [ref=e245]:
                            - link "Clockwork Pro for Jira Time Tracking and Timesheets , (opens new window)" [ref=e246] [cursor=pointer]:
                              - /url: /jira/marketplace/discover/app/clockwork-cloud?source=side_nav_recommendations_jira&recoSessionId=cc380d5f-a400-4308-8d4c-ba1cff7222d9&recoEntityId=c580df1e7a75a52a0de82b490516095161f6bbe4a514c2fdc43a0b80a1a244d6
                              - generic [ref=e251]: Clockwork Pro for Jira Time Tracking and Timesheets
                              - generic [ref=e252]: ", (opens new window)"
                            - generic:
                              - generic:
                                - img
                        - listitem [ref=e253]:
                          - generic [ref=e254]:
                            - link "The Scheduler , (opens new window)" [ref=e255] [cursor=pointer]:
                              - /url: /jira/marketplace/discover/app/pl.com.tt.jira.plugin.theschedulerpro?source=side_nav_recommendations_jira&recoSessionId=cc380d5f-a400-4308-8d4c-ba1cff7222d9&recoEntityId=1aa3f7f3aadfe79312c635b47f2e2b30feaa2352c2d0118735fb18993d8287b5
                              - generic [ref=e260]: The Scheduler
                              - generic [ref=e261]: ", (opens new window)"
                            - generic:
                              - generic:
                                - img
                        - listitem [ref=e262]:
                          - generic [ref=e263]:
                            - link "Claude Agent for Jira , (opens new window)" [ref=e264] [cursor=pointer]:
                              - /url: /jira/marketplace/discover/app/com.atlassian.agent.claude.for.jira?source=side_nav_recommendations_jira
                              - generic [ref=e269]: Claude Agent for Jira
                              - generic [ref=e270]: ", (opens new window)"
                            - generic:
                              - generic:
                                - img
                        - listitem [ref=e271]:
                          - generic [ref=e272]:
                            - link "Cursor , (opens new window)" [ref=e273] [cursor=pointer]:
                              - /url: /jira/marketplace/discover/app/com.anysphere.jira.plugins.cursor?source=side_nav_recommendations_jira
                              - generic [ref=e278]: Cursor
                              - generic [ref=e279]: ", (opens new window)"
                            - generic:
                              - generic:
                                - img
                  - listitem [ref=e280]:
                    - link "Explore more apps" [ref=e282] [cursor=pointer]:
                      - /url: /jira/marketplace/discover
                      - generic [ref=e287]: Explore more apps
            - listitem [ref=e288]:
              - generic [ref=e289]:
                - button "Roadmaps" [ref=e290] [cursor=pointer]:
                  - generic [ref=e294]: Roadmaps
                - generic:
                  - button "Ad controls":
                    - generic [ref=e297] [cursor=pointer]: Ad controls
                - generic:
                  - generic:
                    - generic:
                      - generic: Try
            - listitem [ref=e298]:
              - generic [ref=e301]:
                - button "Plans" [ref=e302] [cursor=pointer]:
                  - generic [ref=e306]: Plans
                - generic:
                  - button "Create plan" [ref=e307] [cursor=pointer]:
                    - generic [ref=e310]: Create plan
                  - button "More actions for Plans":
                    - generic [ref=e313] [cursor=pointer]: More actions for Plans
            - listitem [ref=e314]:
              - generic [ref=e317]:
                - button "Spaces" [ref=e318] [cursor=pointer]:
                  - generic [ref=e322]: Spaces
                - generic:
                  - button "Create space" [ref=e323] [cursor=pointer]:
                    - generic [ref=e326]: Create space
                  - button "More actions for spaces":
                    - generic [ref=e329] [cursor=pointer]: More actions for spaces
            - listitem [ref=e330]:
              - button "Filters" [ref=e334] [cursor=pointer]:
                - generic [ref=e338]: Filters
            - listitem [ref=e339]:
              - generic [ref=e342]:
                - button "Dashboards" [ref=e343] [cursor=pointer]:
                  - generic [ref=e347]: Dashboards
                - button "Create dashboard" [ref=e348] [cursor=pointer]:
                  - generic [ref=e351]: Create dashboard
            - listitem [ref=e352]:
              - generic [ref=e355]:
                - button "Operations" [ref=e356] [cursor=pointer]:
                  - generic [ref=e360]: Operations
                - generic:
                  - button "More actions for Operations":
                    - generic [ref=e363] [cursor=pointer]: More actions for Operations
            - listitem [ref=e364]:
              - link "Customers" [ref=e366] [cursor=pointer]:
                - /url: /jira/customer-service/customers
                - generic [ref=e371]: Customers
            - listitem [ref=e372]:
              - generic [ref=e375]:
                - button "Customer experiences" [ref=e376] [cursor=pointer]:
                  - generic [ref=e380]: Customer experiences
                - button "Create experience" [ref=e381] [cursor=pointer]:
                  - generic [ref=e384]: Create experience
        - generic [ref=e386]:
          - list [ref=e391]:
            - listitem [ref=e393]:
              - generic [ref=e394]:
                - link "Confluence , (opens new window)" [ref=e395] [cursor=pointer]:
                  - /url: https://wolfaenpak.atlassian.net/wiki?xpis=eyJicmlkZ2UiOiJnbG9iYWxTaG9ydGN1dHMiLCJpZCI6IjE3ODg3MDk4NjU1NzMiLCJzb3VyY2UiOiJqaXJhIn0%3D
                  - generic [ref=e400]: Confluence
                  - generic [ref=e401]: ", (opens new window)"
                - generic:
                  - generic:
                    - img
            - listitem [ref=e402]:
              - generic [ref=e403]:
                - link "Assets , (opens new window)" [ref=e404] [cursor=pointer]:
                  - /url: /jira/assets
                  - generic [ref=e409]: Assets
                  - generic [ref=e410]: ", (opens new window)"
                - generic:
                  - img "Assets":
                    - img
            - listitem [ref=e412]:
              - generic [ref=e413]:
                - link "Teams , (opens new window)" [ref=e414] [cursor=pointer]:
                  - /url: https://home.atlassian.com/o/217bc256-kddj-14b3-kkdk-jb6bk7692jbk/people/?cloudId=049de078-bffa-42d1-bbfb-ad8db9860adb
                  - generic [ref=e419]: Teams
                  - generic [ref=e420]: ", (opens new window)"
                - generic:
                  - img "Teams":
                    - img
                - generic:
                  - button "Teams":
                    - generic [ref=e423] [cursor=pointer]: Teams
            - listitem [ref=e425]:
              - generic [ref=e426]:
                - link "Goals , (opens new window)" [ref=e427] [cursor=pointer]:
                  - /url: https://home.atlassian.com/o/217bc256-kddj-14b3-kkdk-jb6bk7692jbk/goals?cloudId=049de078-bffa-42d1-bbfb-ad8db9860adb&xpis=eyJicmlkZ2UiOiJnbG9iYWxTaG9ydGN1dHMiLCJpZCI6IjE3ODg3MDk4NjU1NzMiLCJzb3VyY2UiOiJqaXJhIn0%3D
                  - generic [ref=e432]: Goals
                  - generic [ref=e433]: ", (opens new window)"
                - generic:
                  - generic:
                    - img
            - listitem [ref=e435]:
              - generic [ref=e436]:
                - link "Projects , (opens new window)" [ref=e437] [cursor=pointer]:
                  - /url: https://home.atlassian.com/o/217bc256-kddj-14b3-kkdk-jb6bk7692jbk/projects?cloudId=049de078-bffa-42d1-bbfb-ad8db9860adb&xpis=eyJicmlkZ2UiOiJnbG9iYWxTaG9ydGN1dHMiLCJpZCI6IjE3ODg3MDk4NjU1NzMiLCJzb3VyY2UiOiJqaXJhIn0%3D
                  - generic [ref=e442]: Projects
                  - generic [ref=e443]: ", (opens new window)"
                - generic:
                  - generic:
                    - img
          - button "Customize sidebar" [ref=e449] [cursor=pointer]:
            - generic [ref=e453]: Customize sidebar
      - generic [ref=e455]:
        - slider "Resize panel" [ref=e456]: "320"
        - text: Resize panel
    - main [ref=e458]:
      - iframe [active] [ref=e465]:
        - generic [ref=f1e3]:
          - banner [ref=f1e4]:
            - generic [ref=f1e5]:
              - button "LeanZero Management home" [ref=f1e6] [cursor=pointer]:
                - img [ref=f1e8]
                - generic [ref=f1e12]: LeanZero Management
              - navigation [ref=f1e13]:
                - button "Plans" [ref=f1e14] [cursor=pointer]
                - button "Capacity" [ref=f1e15] [cursor=pointer]
            - generic [ref=f1e16]:
              - text: Portfolio control · rev
              - strong [ref=f1e17]: v4.58.588
          - main [ref=f1e18]:
            - generic [ref=f1e20]:
              - generic [ref=f1e21]:
                - generic [ref=f1e22]:
                  - button "Back to plans" [ref=f1e23] [cursor=pointer]: ←
                  - generic [ref=f1e24]:
                    - generic [ref=f1e25]: "[harness-test] lz-norm-mtpzo0q6"
                    - generic [ref=f1e28]: Ready
                  - generic [ref=f1e30]:
                    - generic [ref=f1e31]:
                      - generic [ref=f1e32]: "1"
                      - text: issue
                    - generic [ref=f1e34]: "?"
                  - 'generic "Working days: Standard (Mon-Fri)" [ref=f1e35]':
                    - img [ref=f1e36]
                    - text: Standard (Mon-Fri)
                  - button "JQL" [ref=f1e38] [cursor=pointer]:
                    - img [ref=f1e39]
                    - text: JQL
                - generic [ref=f1e41]:
                  - generic [ref=f1e42]:
                    - button "Gantt" [ref=f1e43] [cursor=pointer]:
                      - img [ref=f1e44]
                      - text: Gantt
                    - button "Table" [ref=f1e48] [cursor=pointer]:
                      - img [ref=f1e49]
                      - text: Table
                    - button "Dashboard" [ref=f1e51] [cursor=pointer]:
                      - img [ref=f1e52]
                      - text: Dashboard
                    - button "Schedule" [ref=f1e57] [cursor=pointer]:
                      - img [ref=f1e58]
                      - text: Schedule
                    - button "Planning" [ref=f1e60] [cursor=pointer]
                    - button "Permissions" [ref=f1e61] [cursor=pointer]:
                      - img [ref=f1e62]
                      - text: Permissions
                  - button "✦ Assess" [ref=f1e67] [cursor=pointer]:
                    - generic [ref=f1e68]: ✦
                    - text: Assess
                - generic [ref=f1e69]:
                  - generic "Live updates on — changes from others appear instantly." [ref=f1e70]:
                    - generic [ref=f1e72]: Live
                  - button "Saved" [disabled] [ref=f1e74]
                  - button "Delete" [ref=f1e75] [cursor=pointer]
                  - generic [ref=f1e76]:
                    - button "Re-index" [ref=f1e77] [cursor=pointer]
                    - generic [ref=f1e79]: "?"
              - generic [ref=f1e81]:
                - navigation "Planning views" [ref=f1e82]:
                  - button "Scenarios & history" [ref=f1e83] [cursor=pointer]
                  - button "Targets" [ref=f1e84] [cursor=pointer]
                  - button "Forecast outcomes" [ref=f1e85] [cursor=pointer]
                  - button "Sponsor reports" [ref=f1e86] [cursor=pointer]
                - generic [ref=f1e87]:
                  - generic [ref=f1e88]:
                    - generic [ref=f1e89]:
                      - paragraph [ref=f1e90]: Sponsor communication
                      - heading "Sponsor reports" [level=2] [ref=f1e91]
                      - paragraph [ref=f1e92]: A dated timeline, scoped targets, baseline changes and assumptions from one retained capture.
                    - button "Refresh reports" [ref=f1e93] [cursor=pointer]
                  - region "Report capture" [ref=f1e94]:
                    - 'heading "Report: Bounded source-drift report" [level=3] [ref=f1e95]'
                    - paragraph [ref=f1e96]: Paused. Resume keeps the schedule and choices saved when this capture began.
                    - progressbar "Verified capture steps" [ref=f1e97]
                    - paragraph [ref=f1e99]: 1 of 16 capture steps checked. Confirming the complete plan
                    - paragraph [ref=f1e100]: You can pause and return to this plan to resume. Leaving this view stops after the current step.
                    - generic [ref=f1e101]:
                      - button "Resume capture" [ref=f1e102] [cursor=pointer]
                      - button "Cancel capture" [ref=f1e103] [cursor=pointer]
                  - generic [ref=f1e104]:
                    - generic [ref=f1e105]:
                      - text: Report name
                      - textbox "Report name" [disabled] [ref=f1e106]: Bounded source-drift report
                    - group [ref=f1e107]:
                      - generic [ref=f1e108]:
                        - text: Duration uncertainty
                        - combobox "Duration uncertainty" [disabled] [ref=f1e110] [cursor=pointer]:
                          - generic [ref=f1e111]: Medium −15% / +35%
                          - img [ref=f1e112]
                    - group [ref=f1e114]:
                      - generic [ref=f1e115]:
                        - checkbox "Include captured plan capacity" [disabled] [ref=f1e116] [cursor=pointer]
                        - text: Include captured plan capacity
                    - button "Capture sponsor report" [disabled] [ref=f1e117]
                    - generic [ref=f1e118]: Includes the current working schedule and a separate copy of the active baseline. Assets fields are excluded.
                  - generic [ref=f1e119]:
                    - navigation "Retained sponsor reports" [ref=f1e120]:
                      - paragraph [ref=f1e121]: No reports found. Refresh or capture a report.
                    - paragraph [ref=f1e123]: Select a report to preview or download.
```

# Test source

```ts
  1  | import fs from 'node:fs';
  2  | import {expect} from '../../fixtures/forge';
  3  | import {callEnvelope} from './campaign-ui';
  4  | import {getTarget} from '../../config/targets';
  5  | import {departOwnedPlan,armPresenceLeave} from './owned-plan-departure.mjs';
  6  | import {serializeForgeResponse,ForgeResponseRecordError} from './forge-response-record.mjs';
  7  | 
  8  | const sessions=new WeakMap<any,any>();
  9  | const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
  10 | /** Report-only registration. It observes existing traffic and never routes or sends an RPC. */
  11 | export function installReportDeparture(page:any,{record=(_stage:string,_value:any)=>{},accountId=process.env.LZ_EXPECTED_ACCOUNT_ID,timeoutMs=120000}:any={}){
  12 |  if(sessions.has(page))throw new Error('Report departure already registered');
  13 |  if(typeof accountId!=='string'||!accountId)throw new Error('Expected account required for report departure');
  14 |  const target=getTarget('lz-ppm-dashboard'),extensionId=`ari:cloud:ecosystem::extension/${target.appId.split('/').at(-1)}/${target.envId}/static/ppm-dashboard`;
  15 |  const requests=new Map<any,any>(),pending=new Set<Promise<any>>(),leaves=new Set<(value:any)=>void>(),receipts:any[]=[],observationErrors:any[]=[];
  16 |  let owner:any=null,nextId=0,lastBlank=0,disposed=false,departing=false,departureFailure:any=null;
  17 |  const emit=(stage:string,value:any)=>record(stage,value);
  18 |  const request=(req:any)=>{const envelope=callEnvelope(req),input=envelope?.variables?.input;if(input?.extensionId!==extensionId)return;const call=input.payload?.call;if(typeof call?.functionKey!=='string')return;const value={requestId:++nextId,key:call.functionKey,planId:call.payload?.planId??null,requestedAtMs:Date.now(),ownerAtRequest:owner?.planId??null};requests.set(req,value);};
  19 |  const terminal=(req:any,failed:boolean)=>{
  20 |   const initial=requests.get(req);if(!initial)return;requests.delete(req);
  21 |   const operation=(async()=>{const value:any={...initial,dispatchedAtMs:initial.requestedAtMs,completedAtMs:Date.now(),state:failed?'failed':'finished',dispatchTiming:'request-event-observed'};
  22 |    if(failed)value.error='Observed app request failed';
  23 |    else if(['presenceBeat','presenceLeave'].includes(value.key)){
  24 |     const response=await req.response();value.httpStatus=response?.status()??null;
  25 |     try{const envelope=callEnvelope(req),serialized=serializeForgeResponse(response?await response.text():'',{requestToken:envelope?.variables?.input?.payload?.contextToken,requestHeaders:await req.allHeaders()});const {data,...safe}=serialized;Object.assign(value,safe);const extension=data?.data?.invokeExtension;value.outerSuccess=extension?.success??null;value.errors=extension?.errors??data?.errors??null;value.body=extension?.response?.body??null;}
  26 |     catch(error){if(error instanceof ForgeResponseRecordError)Object.assign(value,error.receipt);else value.observationError='Presence response could not be read';observationErrors.push(new Error('Presence response observation failed'));}
  27 |    }
  28 |    receipts.push(value);emit('report-departure-request-terminal',value);for(const observe of leaves)observe(value);
  29 |   })();pending.add(operation);operation.catch(()=>observationErrors.push(new Error('Report departure evidence could not be retained'))).finally(()=>pending.delete(operation));
  30 |  };
  31 |  const finished=(req:any)=>terminal(req,false),failed=(req:any)=>terminal(req,true);
  32 |  const navigated=(frame:any)=>{if(frame===page.mainFrame())lastBlank=nextId;};
  33 |  page.on('request',request);page.on('requestfinished',finished);page.on('requestfailed',failed);page.on('framenavigated',navigated);
  34 |  const drain=async()=>{const deadline=performance.now()+timeoutMs;while(requests.size||pending.size){if(performance.now()>=deadline)throw new Error('Report departure request drain exceeded its bound');await Promise.race([pause(25),...(pending.size?[Promise.allSettled([...pending])]:[])]);}if(observationErrors.length)throw new AggregateError(observationErrors,'Report departure observation failed');};
  35 |  const stop=async()=>{
  36 |   if(departureFailure)throw departureFailure;if(disposed)throw new Error('Report departure disposed');if(departing)throw new Error('Overlapping report departure');departing=true;
  37 |   try{await departOwnedPlan({planId:owner?.planId,drain,record:emit,
  38 |    findMounted:async()=>{const found:any[]=[];for(const frame of page.frames()){const back=frame.locator('button[aria-label="Back to plans"][title="Back to plans"]');if(await back.count()&&await back.first().isVisible())found.push({frame,back});}if(!found.length)return null;expect(found).toHaveLength(1);if(!owner)throw new Error('Mounted PlanView lacks exact report ownership');const mounted=found[0];await expect(mounted.back).toHaveCount(1);await expect(mounted.frame.getByText(owner.name,{exact:true})).toBeVisible();expect(receipts.some(r=>r.requestId>lastBlank&&r.key==='presenceBeat'&&r.planId===owner.planId&&r.state==='finished'&&r.httpStatus===200&&r.outerSuccess===true&&(r.errors==null||Array.isArray(r.errors)&&r.errors.length===0)&&r.body?.selfAccountId===accountId)).toBe(true);return mounted;},
  39 |    confirmNonPlan:async()=>{if(page.url()==='about:blank')return;let known=false;for(const frame of page.frames()){const capacity=frame.locator('[data-testid="capacity-view"]');if(await capacity.count()&&await capacity.isVisible()){await expect(capacity.getByRole('heading',{name:'Portfolio capacity',exact:true})).toBeVisible();known=true;continue;}const card=frame.getByText('LZPT Scenarios',{exact:true}).first();if(await card.count()&&await card.isVisible())known=true;}expect(known,'Positive Plan list or Capacity surface required').toBe(true);},
  40 |    armLeave:()=>armPresenceLeave(leaves,{timeoutMs}),clickBack:async(mounted:any)=>mounted.back.click(),confirmUnmounted:async(mounted:any)=>{await expect(mounted.back).toHaveCount(0);await expect(mounted.frame.getByText('LZPT Scenarios',{exact:true}).first()).toBeVisible();},blank:async()=>{await page.goto('about:blank');lastBlank=nextId;}
> 41 |   });}catch(error){const failure:any=new Error('Owned report departure failed; exact fixture retained');failure.code='LZ_REPORT_CAPTURE_RECOVERY_REQUIRED';failure.reportState={planId:owner?.planId??null,owner,departureFailed:true};departureFailure=failure;emit('report-departure-failed-retained',{...failure.reportState,errorType:(error as any)?.name??typeof error});throw failure;}finally{departing=false;}
     |                                      ^ Error: Owned report departure failed; exact fixture retained
  42 |  };
  43 |  const session={
  44 |   own(planId:string,name:string){if(typeof planId!=='string'||!planId.startsWith('plan-test-')||typeof name!=='string'||!name.startsWith('[harness-test]'))throw new Error('Exact owned report fixture required');if(owner&&(owner.planId!==planId||owner.name!==name))throw new Error('Report owner cannot change during a journey');owner={planId,name};emit('report-departure-owner',owner);},
  45 |   stop,
  46 |   failure:()=>departureFailure,
  47 |   async dispose(){if(disposed)return;try{await drain();}finally{disposed=true;page.off('request',request);page.off('requestfinished',finished);page.off('requestfailed',failed);page.off('framenavigated',navigated);sessions.delete(page);emit('report-departure-disposed',{owner,receipts:receipts.length});}},
  48 |  };
  49 |  sessions.set(page,session);return session;
  50 | }
  51 | export function reportDepartureFailure(page:any){return sessions.get(page)?.failure()??null;}
  52 | export function setReportDepartureOwner(page:any,planId:string,name:string){sessions.get(page)?.own(planId,name);}
  53 | /** Called only before ordinary helper navigation. Intentional page.reload remains untouched. */
  54 | export async function beforeReportNavigation(page:any){const session=sessions.get(page);if(session&&!page.isClosed())await session.stop();}
  55 | export async function stopReportUi(page:any,unchangedDefault:()=>Promise<any>){const session=sessions.get(page);if(!session)return unchangedDefault();if(!page.isClosed())await session.stop();}
  56 | export async function withReportDeparture(page:any,info:any,work:()=>Promise<any>){
  57 |  fs.mkdirSync(info.outputDir,{recursive:true});const events:any[]=[];const record=(stage:string,value:any)=>{events.push({stage,time:new Date().toISOString(),value});fs.writeFileSync(info.outputPath('report-departure.json'),JSON.stringify(events,null,2));};
  58 |  const session=installReportDeparture(page,{record});let bodyFailed=false,bodyError:any;
  59 |  try{return await work();}catch(error){bodyFailed=true;bodyError=error;throw error;}
  60 |  finally{try{await session.dispose();}catch(error){throw new AggregateError([...(bodyFailed?[bodyError]:[]),error],'Report journey and departure observation failed');}}
  61 | }
  62 | 
```