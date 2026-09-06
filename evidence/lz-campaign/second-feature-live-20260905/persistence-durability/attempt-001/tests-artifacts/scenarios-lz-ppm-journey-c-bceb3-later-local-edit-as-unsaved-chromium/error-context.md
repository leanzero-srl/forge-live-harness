# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/journey-campaign-persistence.spec.ts >> persistence: an actual held Save response preserves a later local edit as unsaved
- Location: scenarios/lz-ppm/journey-campaign-persistence.spec.ts:28:1

# Error details

```
Error: route.fulfill: Route is already handled!
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
                              - /url: /jira/apps/36415848-6868-4697-9554-3c3ad87b8da9/37dd35f1-42db-4e65-8e91-b2f18caed58d
                              - generic [ref=e172]: CogniRunner
                            - generic:
                              - generic:
                                - img
                            - generic:
                              - button "More actions":
                                - generic [ref=e175] [cursor=pointer]: More actions
                        - listitem [ref=e176]:
                          - generic [ref=e177]:
                            - link "CogniRunner" [ref=e178] [cursor=pointer]:
                              - /url: /jira/apps/36415848-6868-4697-9554-3c3ad87b8da9/989ecaa0-261b-406e-b444-78c01c0d7772
                              - generic [ref=e183]: CogniRunner
                            - generic:
                              - generic:
                                - img
                            - generic:
                              - button "More actions":
                                - generic [ref=e186] [cursor=pointer]: More actions
                            - generic:
                              - generic:
                                - generic: Dev
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
                              - /url: /jira/marketplace/discover/app/com.k15t.backbone.backbone-issue-sync?source=side_nav_recommendations_jira&recoSessionId=a9cfa12a-1e7d-4adf-a4a4-81477cc7bc7f&recoEntityId=fd952d18bc77797673b685009ba8520e9656df27515b7e0491bd61e8d8de9e0b
                              - generic [ref=e242]: Backbone Work Sync for Jira (Two Way Issue Sync)
                              - generic [ref=e243]: ", (opens new window)"
                            - generic:
                              - generic:
                                - img
                        - listitem [ref=e244]:
                          - generic [ref=e245]:
                            - link "Connector for Salesforce & Jira , (opens new window)" [ref=e246] [cursor=pointer]:
                              - /url: /jira/marketplace/discover/app/com.servicerocket.jira.salesforce?source=side_nav_recommendations_jira&recoSessionId=a9cfa12a-1e7d-4adf-a4a4-81477cc7bc7f&recoEntityId=ac76883adc9de0bad463234875a64937f26bb230d8227064443850bb705bdd74
                              - generic [ref=e251]: Connector for Salesforce & Jira
                              - generic [ref=e252]: ", (opens new window)"
                            - generic:
                              - generic:
                                - img
                        - listitem [ref=e253]:
                          - generic [ref=e254]:
                            - link "Power BI Connector for Jira , (opens new window)" [ref=e255] [cursor=pointer]:
                              - /url: /jira/marketplace/discover/app/com.alphaserve.powerbi-connector-jira?source=side_nav_recommendations_jira&recoSessionId=a9cfa12a-1e7d-4adf-a4a4-81477cc7bc7f&recoEntityId=4baf13124f9889646fec4ed74c4c5e24611e87dfba4ec1f897ffdd6abbad35d2
                              - generic [ref=e260]: Power BI Connector for Jira
                              - generic [ref=e261]: ", (opens new window)"
                            - generic:
                              - generic:
                                - img
                        - listitem [ref=e262]:
                          - generic [ref=e263]:
                            - link "GitHub Copilot for Jira , (opens new window)" [ref=e264] [cursor=pointer]:
                              - /url: /jira/marketplace/discover/app/com.github.copilot?source=side_nav_recommendations_jira
                              - generic [ref=e269]: GitHub Copilot for Jira
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
                  - /url: https://wolfaenpak.atlassian.net/wiki?xpis=eyJicmlkZ2UiOiJnbG9iYWxTaG9ydGN1dHMiLCJpZCI6IjE3ODg2MzI3MzAwMjMiLCJzb3VyY2UiOiJqaXJhIn0%3D
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
                  - /url: https://home.atlassian.com/o/217bc256-kddj-14b3-kkdk-jb6bk7692jbk/goals?cloudId=049de078-bffa-42d1-bbfb-ad8db9860adb&xpis=eyJicmlkZ2UiOiJnbG9iYWxTaG9ydGN1dHMiLCJpZCI6IjE3ODg2MzI3MzAwMjMiLCJzb3VyY2UiOiJqaXJhIn0%3D
                  - generic [ref=e432]: Goals
                  - generic [ref=e433]: ", (opens new window)"
                - generic:
                  - generic:
                    - img
            - listitem [ref=e435]:
              - generic [ref=e436]:
                - link "Projects , (opens new window)" [ref=e437] [cursor=pointer]:
                  - /url: https://home.atlassian.com/o/217bc256-kddj-14b3-kkdk-jb6bk7692jbk/projects?cloudId=049de078-bffa-42d1-bbfb-ad8db9860adb&xpis=eyJicmlkZ2UiOiJnbG9iYWxTaG9ydGN1dHMiLCJpZCI6IjE3ODg2MzI3MzAwMjMiLCJzb3VyY2UiOiJqaXJhIn0%3D
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
        - generic [ref=f3e2]:
          - generic [ref=f3e3]:
            - banner [ref=f3e4]:
              - generic [ref=f3e5]:
                - button "LeanZero Management home" [ref=f3e6] [cursor=pointer]:
                  - img [ref=f3e8]
                  - generic [ref=f3e12]: LeanZero Management
                - navigation [ref=f3e13]:
                  - button "Plans" [ref=f3e14] [cursor=pointer]
                  - button "Capacity" [ref=f3e15] [cursor=pointer]
              - generic [ref=f3e16]:
                - text: Portfolio control · rev
                - strong [ref=f3e17]: v4.58.575
            - main [ref=f3e18]:
              - generic [ref=f3e20]:
                - generic [ref=f3e21]:
                  - generic [ref=f3e22]:
                    - button "Back to plans" [ref=f3e23] [cursor=pointer]: ←
                    - generic [ref=f3e24]:
                      - generic [ref=f3e25]: "[harness-test] lz-norm-mtoprbgl"
                      - generic [ref=f3e28]: Ready
                    - generic [ref=f3e30]:
                      - generic [ref=f3e31]:
                        - generic [ref=f3e32]: "1"
                        - text: issue
                      - generic [ref=f3e34]: "?"
                    - 'generic "Working days: Standard (Mon-Fri)" [ref=f3e35]':
                      - img [ref=f3e36]
                      - text: Standard (Mon-Fri)
                    - button "JQL" [ref=f3e38] [cursor=pointer]:
                      - img [ref=f3e39]
                      - text: JQL
                  - generic [ref=f3e41]:
                    - generic [ref=f3e42]:
                      - button "Gantt" [ref=f3e43] [cursor=pointer]:
                        - img [ref=f3e44]
                        - text: Gantt
                      - button "Table" [ref=f3e48] [cursor=pointer]:
                        - img [ref=f3e49]
                        - text: Table
                      - button "Dashboard" [ref=f3e51] [cursor=pointer]:
                        - img [ref=f3e52]
                        - text: Dashboard
                      - button "Schedule" [ref=f3e57] [cursor=pointer]:
                        - img [ref=f3e58]
                        - text: Schedule
                      - button "Planning" [ref=f3e60] [cursor=pointer]
                      - button "Permissions" [ref=f3e61] [cursor=pointer]:
                        - img [ref=f3e62]
                        - text: Permissions
                    - button "✦ Assess" [ref=f3e67] [cursor=pointer]:
                      - generic [ref=f3e68]: ✦
                      - text: Assess
                  - generic [ref=f3e69]:
                    - generic "Live updates on — changes from others appear instantly." [ref=f3e70]:
                      - generic [ref=f3e72]: Live
                    - button "Save (1)" [ref=f3e74] [cursor=pointer]
                    - button "Delete" [ref=f3e75] [cursor=pointer]
                    - generic [ref=f3e76]:
                      - button "Re-index" [ref=f3e77] [cursor=pointer]
                      - generic [ref=f3e79]: "?"
                    - button "Apply 1 change" [ref=f3e80] [cursor=pointer]
                - generic [ref=f3e82]:
                  - button "Assets" [ref=f3e83] [cursor=pointer]
                  - button "Configure fields" [ref=f3e84] [cursor=pointer]
                - generic [ref=f3e87]:
                  - generic [ref=f3e88]:
                    - generic [ref=f3e89]: 1 issues
                    - generic [ref=f3e90]:
                      - img [ref=f3e91]
                      - textbox "Filter tasks…" [ref=f3e94]
                    - generic [ref=f3e95]:
                      - generic [ref=f3e96]: Group
                      - combobox [ref=f3e98] [cursor=pointer]:
                        - generic [ref=f3e99]: No grouping
                        - img [ref=f3e100]
                    - button "Columns" [ref=f3e103] [cursor=pointer]:
                      - img [ref=f3e104]
                      - text: Columns
                  - generic [ref=f3e110]:
                    - generic [ref=f3e111]:
                      - checkbox "Select all visible rows" [ref=f3e113] [cursor=pointer]
                      - button "Key" [ref=f3e114] [cursor=pointer]:
                        - generic [ref=f3e115]: Key
                      - button "Summary" [ref=f3e116] [cursor=pointer]:
                        - generic [ref=f3e117]: Summary
                      - button "Start Date" [ref=f3e119] [cursor=pointer]:
                        - generic [ref=f3e120]: Start Date
                      - button "Due Date" [ref=f3e121] [cursor=pointer]:
                        - generic [ref=f3e122]: Due Date
                      - button "Duration" [ref=f3e123] [cursor=pointer]:
                        - generic [ref=f3e124]: Duration
                      - button "Buffer" [ref=f3e125] [cursor=pointer]:
                        - generic [ref=f3e126]: Buffer
                    - generic [ref=f3e127]:
                      - checkbox "Select WFH-2736" [ref=f3e129] [cursor=pointer]
                      - generic [ref=f3e131] [cursor=pointer]: WFH-2736
                      - generic [ref=f3e133]: "[harness-test] lz-norm-mtoprbgl inflight save"
                      - generic [ref=f3e135] [cursor=pointer]:
                        - text: Oct 5
                        - img [ref=f3e136]
                      - generic [ref=f3e139] [cursor=pointer]:
                        - text: Oct 13
                        - img [ref=f3e140]
                      - generic [ref=f3e143] [cursor=pointer]: 7d
                      - generic [ref=f3e145] [cursor=pointer]: "No"
          - generic [ref=f3e147]:
            - generic [ref=f3e148]: ✓
            - generic [ref=f3e149]: Saved 1 issue to plan
            - button "Close" [ref=f3e150] [cursor=pointer]:
              - img [ref=f3e151]
```

# Test source

```ts
  1  | // Real fixtures and resolver calls. The two controlled response tests disclose
  2  | // transport instrumentation; no fabricated backend state is counted as a pass.
  3  | import {gunzipSync} from 'node:zlib';
  4  | import {test,expect} from '../../fixtures/forge';
  5  | import {getTestState} from '../../testhook/client';
  6  | import {withOwnedSchedule,table,row,editDuration,save,review} from './normalization-owned-fixture';
  7  | import {openPlan} from './forecast-fixture';
  8  | test.describe.configure({retries:0,timeout:600_000});
  9  | const seed=(label:string)=>({label,duration:5,start:'2026-10-05',due:'2026-10-09'});
  10 | function callOf(request:any){try{let raw=request.postDataBuffer();if(!raw)return null;if(raw[0]===31&&raw[1]===139)raw=gunzipSync(raw);return JSON.parse(raw.toString()).variables?.input?.payload?.call||null;}catch{return null;}}
  11 | const responseBody=async(response:any)=>(await response.json()).data?.invokeExtension?.response?.body;
  12 | function actualResponse(page:any,functionKey:string,planId:string){return page.waitForResponse((r:any)=>{const c=callOf(r.request());return c?.functionKey===functionKey&&c.payload?.planId===planId;},{timeout:90000}).then(async(r:any)=>{expect(r.status()).toBe(200);await r.finished();const body=await responseBody(r);expect(body.success).toBe(true);return body;});}
  13 | async function exact(frame:any,key:string,duration:number,due:string){await expect(row(frame,key)).toHaveAttribute('data-row-duration',String(duration));await expect(row(frame,key)).toHaveAttribute('data-row-start','2026-10-05');await expect(row(frame,key)).toHaveAttribute('data-row-due',due);await expect(row(frame,key).locator(':scope > div').nth(5)).toHaveText(`${duration}d`);}
  14 | 
  15 | test('persistence: acknowledged Save7 replaces earlier autosaved6 before immediate reopen',async({page},info)=>{
  16 |  await withOwnedSchedule(page,info,[seed('older autosave')],async(f)=>{
  17 |   const key=f.keys[0];let frame=await table(page,f.name);const original=await f.read(key);
  18 |   const drafted=actualResponse(page,'saveDraft',f.planId);await editDuration(frame,key,'6');await drafted;
  19 |   await editDuration(frame,key,'7');await save(frame);
  20 |   // No arbitrary wait: close on the actual Saved acknowledgement.
  21 |   await page.goto('about:blank');frame=await table(page,f.name);await exact(frame,key,7,'2026-10-13');
  22 |   await expect(frame.locator('[data-testid="plan-save-btn"]')).toHaveAttribute('data-has-changes','0');
  23 |   const stored=(await getTestState('lz-ppm',{what:'plan',planId:f.planId})).issues.find((i:any)=>i.key===key);expect(stored).toMatchObject({duration:7,startDate:'2026-10-05',dueDate:'2026-10-13'});
  24 |   expect(await f.read(key)).toEqual(original);await row(frame,key).screenshot({path:info.outputPath('save7-immediate-reopen.png')});
  25 |  });
  26 | });
  27 | 
  28 | test('persistence: an actual held Save response preserves a later local edit as unsaved',async({page},info)=>{
  29 |  await withOwnedSchedule(page,info,[seed('inflight save')],async(f)=>{
  30 |   const key=f.keys[0];let frame=await table(page,f.name);const original=await f.read(key);await editDuration(frame,key,'6');
  31 |   let release!:()=>void,arrived!:()=>void;const held=new Promise<void>(resolve=>release=resolve),received=new Promise<void>(resolve=>arrived=resolve);let captured:any;
> 32 |   const handler=async(route:any)=>{const c=callOf(route.request());if(c?.functionKey!=='savePlanState'||c.payload?.planId!==f.planId)return route.continue();await page.unroute('**/gateway/api/graphql**',handler);const response=await route.fetch();const body=await responseBody(response);expect(body.success).toBe(true);captured={functionKey:c.functionKey,planId:f.planId,submitted:c.payload.issues.map((i:any)=>({key:i.key,duration:i.duration,startDate:i.startDate,dueDate:i.dueDate})),result:body};arrived();await held;await route.fulfill({response});};
     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     ^ Error: route.fulfill: Route is already handled!
  33 |   await page.route('**/gateway/api/graphql**',handler);
  34 |   try{
  35 |    await frame.locator('[data-testid="plan-save-btn"]').click();await expect.poll(()=>Boolean(captured),{timeout:60000,message:'real Save response reached the controlled hold'}).toBe(true);await received;
  36 |    await editDuration(frame,key,'7');await exact(frame,key,7,'2026-10-13');release();
  37 |    await expect(frame.locator('[data-testid="plan-save-btn"]')).toHaveAttribute('data-has-changes','1');await expect(frame.locator('[data-testid="plan-save-btn"]')).toBeEnabled();
  38 |    await exact(frame,key,7,'2026-10-13');expect(captured.submitted.find((i:any)=>i.key===key).duration).toBe(6);
  39 |    expect((await getTestState('lz-ppm',{what:'plan',planId:f.planId})).issues.find((i:any)=>i.key===key).duration).toBe(6);
  40 |    await info.attach('transport-instrumentation',{body:JSON.stringify({method:'Real savePlanState request executed and returned success; only its unchanged response delivery was held while the user edited7.',...captured}),contentType:'application/json'});
  41 |    await row(frame,key).screenshot({path:info.outputPath('late7-remains-unsaved.png')});await save(frame);frame=await table(page,f.name);await exact(frame,key,7,'2026-10-13');expect(await f.read(key)).toEqual(original);
  42 |   }finally{release();await page.unroute('**/gateway/api/graphql**',handler);}
  43 |  });
  44 | });
  45 | 
  46 | test('persistence: partial Apply discards a previously Saved sibling durably through completion reload',async({page},info)=>{
  47 |  await withOwnedSchedule(page,info,[seed('apply selected'),seed('discard saved sibling')],async(f)=>{
  48 |   const[a,b]=f.keys;let frame=await table(page,f.name);const originalB=await f.read(b);await editDuration(frame,a,'6');await editDuration(frame,b,'7');await save(frame);
  49 |   const modal=await review(frame);await expect(modal.locator('[data-testid="apply-change-row"]')).toHaveCount(2);await modal.locator(`[data-testid="apply-change-row"][data-issue-key="${b}"]`).getByRole('button').first().click();await expect(modal.locator('[data-testid="apply-review-subtitle"]')).toContainText('1 discarded');await modal.getByRole('button',{name:/^Apply 1 Change/i}).click();
  50 |   await expect(frame.getByText('Successfully wrote 1 issue',{exact:true})).toBeVisible({timeout:120000});
  51 |   await expect.poll(()=>f.read(a),{timeout:60000}).toEqual({key:a,start:'2026-10-05',due:'2026-10-12',duration:6});expect(await f.read(b)).toEqual(originalB);
  52 |   frame=await table(page,f.name);await exact(frame,a,6,'2026-10-12');await exact(frame,b,5,'2026-10-09');await expect(frame.getByRole('button',{name:/^Apply \d+ change/i})).toHaveCount(0);await expect(frame.locator('[data-testid="plan-save-btn"]')).toHaveAttribute('data-has-changes','0');
  53 |   const stored=(await getTestState('lz-ppm',{what:'plan',planId:f.planId})).issues;expect(stored.find((i:any)=>i.key===b)).toMatchObject({duration:5,startDate:'2026-10-05',dueDate:'2026-10-09'});
  54 |   await row(frame,b).screenshot({path:info.outputPath('discarded-sibling-stays5.png')});await info.attach('actual-jira-second-reads',{body:JSON.stringify({applied:await f.read(a),discarded:await f.read(b)}),contentType:'application/json'});
  55 |  });
  56 | });
  57 | 
  58 | for(const status of[403,503])test(`persistence: simulated draft-read HTTP${status} gates edits and real Retry recovers unseen draft`,async({page},info)=>{
  59 |  await withOwnedSchedule(page,info,[seed('edit after recovery'),seed('unseen draft')],async(f)=>{
  60 |   const[a,b]=f.keys;let frame=await table(page,f.name);const drafted=actualResponse(page,'saveDraft',f.planId);await editDuration(frame,b,'9');await drafted;await page.goto('about:blank');let injected=0;
  61 |   const handler=async(route:any)=>{const c=callOf(route.request());if(c?.functionKey!=='getDraft'||c.payload?.planId!==f.planId)return route.continue();injected++;await page.unroute('**/gateway/api/graphql**',handler);await route.fulfill({status,contentType:'application/json',body:JSON.stringify({error:`Harness simulated draft transport ${status}`})});};
  62 |   await page.route('**/gateway/api/graphql**',handler);
  63 |   try{
  64 |    frame=await openPlan(page,f.name);const alert=frame.getByRole('alert').filter({hasText:'Your saved draft could not be loaded'});await expect(alert).toBeVisible();expect(injected).toBe(1);await expect(frame.locator('[inert] [data-testid="plan-save-btn"]')).toHaveCount(1);await alert.screenshot({path:info.outputPath(`draft-${status}-blocked.png`)});
  65 |    const recovered=actualResponse(page,'getDraft',f.planId);await alert.getByRole('button',{name:'Retry saved draft',exact:true}).click();const body=await recovered;expect(body.draft.changes[b].duration).toBe(9);await expect(alert).toHaveCount(0);await frame.getByRole('button',{name:/^Table/i}).first().click();await exact(frame,b,9,'2026-10-15');await editDuration(frame,a,'6');await save(frame);frame=await table(page,f.name);await exact(frame,a,6,'2026-10-12');await exact(frame,b,9,'2026-10-15');
  66 |    await row(frame,b).screenshot({path:info.outputPath(`draft-${status}-recovered9.png`)});await info.attach('failure-instrumentation',{body:JSON.stringify({injectedHttpStatus:status,request:'getDraft',planId:f.planId,count:injected,realRetry:true,backendDraftNeverMutatedByFault:true}),contentType:'application/json'});
  67 |   }finally{await page.unroute('**/gateway/api/graphql**',handler);}
  68 |  });
  69 | });
  70 | 
```