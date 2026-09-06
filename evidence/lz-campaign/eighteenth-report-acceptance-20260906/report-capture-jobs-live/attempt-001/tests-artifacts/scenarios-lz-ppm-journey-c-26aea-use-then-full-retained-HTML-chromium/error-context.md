# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/journey-campaign-report-jobs.spec.ts >> report jobs: paused source checkpoint survives reload and final publication pause, then full retained HTML
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
                              - /url: /jira/marketplace/discover/app/com.k15t.backbone.backbone-issue-sync?source=side_nav_recommendations_jira&recoSessionId=dfdeb2be-842e-4b80-8200-3542396e26ee&recoEntityId=fd952d18bc77797673b685009ba8520e9656df27515b7e0491bd61e8d8de9e0b
                              - generic [ref=e242]: Backbone Work Sync for Jira (Two Way Issue Sync)
                              - generic [ref=e243]: ", (opens new window)"
                            - generic:
                              - generic:
                                - img
                        - listitem [ref=e244]:
                          - generic [ref=e245]:
                            - link "Clockwork Pro for Jira Time Tracking and Timesheets , (opens new window)" [ref=e246] [cursor=pointer]:
                              - /url: /jira/marketplace/discover/app/clockwork-cloud?source=side_nav_recommendations_jira&recoSessionId=dfdeb2be-842e-4b80-8200-3542396e26ee&recoEntityId=c580df1e7a75a52a0de82b490516095161f6bbe4a514c2fdc43a0b80a1a244d6
                              - generic [ref=e251]: Clockwork Pro for Jira Time Tracking and Timesheets
                              - generic [ref=e252]: ", (opens new window)"
                            - generic:
                              - generic:
                                - img
                        - listitem [ref=e253]:
                          - generic [ref=e254]:
                            - link "The Scheduler , (opens new window)" [ref=e255] [cursor=pointer]:
                              - /url: /jira/marketplace/discover/app/pl.com.tt.jira.plugin.theschedulerpro?source=side_nav_recommendations_jira&recoSessionId=dfdeb2be-842e-4b80-8200-3542396e26ee&recoEntityId=1aa3f7f3aadfe79312c635b47f2e2b30feaa2352c2d0118735fb18993d8287b5
                              - generic [ref=e260]: The Scheduler
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
                  - /url: https://wolfaenpak.atlassian.net/wiki?xpis=eyJicmlkZ2UiOiJnbG9iYWxTaG9ydGN1dHMiLCJpZCI6IjE3ODg3MDk3NzMwNDEiLCJzb3VyY2UiOiJqaXJhIn0%3D
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
                  - /url: https://home.atlassian.com/o/217bc256-kddj-14b3-kkdk-jb6bk7692jbk/goals?cloudId=049de078-bffa-42d1-bbfb-ad8db9860adb&xpis=eyJicmlkZ2UiOiJnbG9iYWxTaG9ydGN1dHMiLCJpZCI6IjE3ODg3MDk3NzMwNDEiLCJzb3VyY2UiOiJqaXJhIn0%3D
                  - generic [ref=e432]: Goals
                  - generic [ref=e433]: ", (opens new window)"
                - generic:
                  - generic:
                    - img
            - listitem [ref=e435]:
              - generic [ref=e436]:
                - link "Projects , (opens new window)" [ref=e437] [cursor=pointer]:
                  - /url: https://home.atlassian.com/o/217bc256-kddj-14b3-kkdk-jb6bk7692jbk/projects?cloudId=049de078-bffa-42d1-bbfb-ad8db9860adb&xpis=eyJicmlkZ2UiOiJnbG9iYWxTaG9ydGN1dHMiLCJpZCI6IjE3ODg3MDk3NzMwNDEiLCJzb3VyY2UiOiJqaXJhIn0%3D
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
      - iframe [ref=e465]:
        - generic [ref=f2e3]:
          - banner [ref=f2e4]:
            - generic [ref=f2e5]:
              - button "LeanZero Management home" [ref=f2e6] [cursor=pointer]:
                - img [ref=f2e8]
                - generic [ref=f2e12]: LeanZero Management
              - navigation [ref=f2e13]:
                - button "Plans" [ref=f2e14] [cursor=pointer]
                - button "Capacity" [ref=f2e15] [cursor=pointer]
            - generic [ref=f2e16]:
              - text: Portfolio control · rev
              - strong [ref=f2e17]: v4.58.588
          - main [ref=f2e18]:
            - generic [ref=f2e19]:
              - generic [ref=f2e20]:
                - generic [ref=f2e21]:
                  - generic [ref=f2e22]: Portfolio
                  - heading "Plans" [level=1] [ref=f2e23]
                  - paragraph [ref=f2e24]: Manage your project portfolio timelines
                - generic [ref=f2e25]:
                  - button "Import a Jira plan" [ref=f2e26] [cursor=pointer]
                  - button "+ New Plan" [ref=f2e27] [cursor=pointer]
              - generic [ref=f2e28]:
                - button "New plan Index issues from JQL, a board, or a project" [ref=f2e29] [cursor=pointer]:
                  - img [ref=f2e31]
                  - generic [ref=f2e33]: New plan
                  - generic [ref=f2e34]: Index issues from JQL, a board, or a project
                - 'button "Import a Jira plan Bring a Jira Premium plan in: its sources, exclusion rules and date fields" [ref=f2e35] [cursor=pointer]':
                  - img [ref=f2e37]
                  - generic [ref=f2e40]: Import a Jira plan
                  - generic [ref=f2e41]: "Bring a Jira Premium plan in: its sources, exclusion rules and date fields"
                - generic [ref=f2e42] [cursor=pointer]:
                  - generic [ref=f2e43]:
                    - heading "LZPT Scenarios" [level=3] [ref=f2e44]
                    - generic [ref=f2e45]:
                      - generic [ref=f2e47]: Ready
                      - button "More" [ref=f2e49]:
                        - img [ref=f2e50]
                  - generic [ref=f2e54]:
                    - generic [ref=f2e55]:
                      - generic [ref=f2e56]: "45"
                      - generic [ref=f2e57]: Issues
                    - generic [ref=f2e58]:
                      - generic [ref=f2e59]: "1"
                      - generic [ref=f2e60]: Sources
                    - generic [ref=f2e61]:
                      - generic [ref=f2e62]: "0"
                      - generic [ref=f2e63]: Drafts
                  - generic [ref=f2e65]:
                    - text: JQL
                    - generic [ref=f2e67]: "?"
                  - generic [ref=f2e68]:
                    - generic [ref=f2e69]: Updated 18h ago
                    - generic [ref=f2e70]: Indexed 18h ago
                  - button "Open plan →" [ref=f2e71]
                - generic [ref=f2e72] [cursor=pointer]:
                  - generic [ref=f2e73]:
                    - heading "test" [level=3] [ref=f2e74]
                    - generic [ref=f2e75]:
                      - generic [ref=f2e77]: Ready
                      - button "More" [ref=f2e79]:
                        - img [ref=f2e80]
                  - generic [ref=f2e84]:
                    - generic [ref=f2e85]:
                      - generic [ref=f2e86]: "54"
                      - generic [ref=f2e87]: Issues
                    - generic [ref=f2e88]:
                      - generic [ref=f2e89]: "1"
                      - generic [ref=f2e90]: Sources
                    - generic [ref=f2e91]:
                      - generic [ref=f2e92]: "0"
                      - generic [ref=f2e93]: Drafts
                  - generic [ref=f2e95]:
                    - text: JQL
                    - generic [ref=f2e97]: "?"
                  - generic [ref=f2e98]:
                    - generic [ref=f2e99]: Updated 21h ago
                    - generic [ref=f2e100]: Indexed 21h ago
                  - button "Open plan →" [ref=f2e101]
                - generic [ref=f2e102] [cursor=pointer]:
                  - generic [ref=f2e103]:
                    - heading "LZPP Perf" [level=3] [ref=f2e104]
                    - generic [ref=f2e105]:
                      - generic [ref=f2e107]: Ready
                      - button "More" [ref=f2e109]:
                        - img [ref=f2e110]
                  - generic [ref=f2e114]:
                    - generic [ref=f2e115]:
                      - generic [ref=f2e116]: 5,300
                      - generic [ref=f2e117]: Issues
                    - generic [ref=f2e118]:
                      - generic [ref=f2e119]: "1"
                      - generic [ref=f2e120]: Sources
                    - generic [ref=f2e121]:
                      - generic [ref=f2e122]: "0"
                      - generic [ref=f2e123]: Drafts
                  - generic [ref=f2e125]:
                    - text: JQL
                    - generic [ref=f2e127]: "?"
                  - generic [ref=f2e128]:
                    - generic [ref=f2e129]: Updated 21h ago
                    - generic [ref=f2e130]: Indexed 21h ago
                  - button "Open plan →" [ref=f2e131]
                - generic [ref=f2e132] [cursor=pointer]:
                  - generic [ref=f2e133]:
                    - heading "[harness-test] lz-norm-mtpzm0tl" [level=3] [ref=f2e134]
                    - generic [ref=f2e135]:
                      - generic [ref=f2e137]: Ready
                      - button "More" [ref=f2e139]:
                        - img [ref=f2e140]
                  - generic [ref=f2e144]:
                    - generic [ref=f2e145]:
                      - generic [ref=f2e146]: "1"
                      - generic [ref=f2e147]: Issues
                    - generic [ref=f2e148]:
                      - generic [ref=f2e149]: "1"
                      - generic [ref=f2e150]: Sources
                    - generic [ref=f2e151]:
                      - generic [ref=f2e152]: "0"
                      - generic [ref=f2e153]: Drafts
                  - generic [ref=f2e155]:
                    - text: JQL
                    - generic [ref=f2e157]: "?"
                  - generic [ref=f2e158]:
                    - generic [ref=f2e159]: Updated just now
                    - generic [ref=f2e160]: Indexed just now
                  - button "Open plan →" [ref=f2e161]
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