# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/campaign-identity.spec.ts >> campaign: actual UI version and preserved LZPT source
- Location: scenarios/lz-ppm/campaign-identity.spec.ts:14:1

# Error details

```
AssertionError: Expected values to be strictly equal:
actual expected

'retained-after-failure'

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
                              - /url: /jira/marketplace/discover/app/com.k15t.backbone.backbone-issue-sync?source=side_nav_recommendations_jira&recoSessionId=87df1795-63d1-45ce-9167-aecbf6694312&recoEntityId=fd952d18bc77797673b685009ba8520e9656df27515b7e0491bd61e8d8de9e0b
                              - generic [ref=e242]: Backbone Work Sync for Jira (Two Way Issue Sync)
                              - generic [ref=e243]: ", (opens new window)"
                            - generic:
                              - generic:
                                - img
                        - listitem [ref=e244]:
                          - generic [ref=e245]:
                            - link "Clockwork Pro for Jira Time Tracking and Timesheets , (opens new window)" [ref=e246] [cursor=pointer]:
                              - /url: /jira/marketplace/discover/app/clockwork-cloud?source=side_nav_recommendations_jira&recoSessionId=87df1795-63d1-45ce-9167-aecbf6694312&recoEntityId=c580df1e7a75a52a0de82b490516095161f6bbe4a514c2fdc43a0b80a1a244d6
                              - generic [ref=e251]: Clockwork Pro for Jira Time Tracking and Timesheets
                              - generic [ref=e252]: ", (opens new window)"
                            - generic:
                              - generic:
                                - img
                        - listitem [ref=e253]:
                          - generic [ref=e254]:
                            - link "The Scheduler , (opens new window)" [ref=e255] [cursor=pointer]:
                              - /url: /jira/marketplace/discover/app/pl.com.tt.jira.plugin.theschedulerpro?source=side_nav_recommendations_jira&recoSessionId=87df1795-63d1-45ce-9167-aecbf6694312&recoEntityId=1aa3f7f3aadfe79312c635b47f2e2b30feaa2352c2d0118735fb18993d8287b5
                              - generic [ref=e260]: The Scheduler
                              - generic [ref=e261]: ", (opens new window)"
                            - generic:
                              - generic:
                                - img
                        - listitem [ref=e262]:
                          - generic [ref=e263]:
                            - link "Cursor , (opens new window)" [ref=e264] [cursor=pointer]:
                              - /url: /jira/marketplace/discover/app/com.anysphere.jira.plugins.cursor?source=side_nav_recommendations_jira
                              - generic [ref=e269]: Cursor
                              - generic [ref=e270]: ", (opens new window)"
                            - generic:
                              - generic:
                                - img
                        - listitem [ref=e271]:
                          - generic [ref=e272]:
                            - link "GitHub Copilot for Jira , (opens new window)" [ref=e273] [cursor=pointer]:
                              - /url: /jira/marketplace/discover/app/com.github.copilot?source=side_nav_recommendations_jira
                              - generic [ref=e278]: GitHub Copilot for Jira
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
                  - /url: https://wolfaenpak.atlassian.net/wiki?xpis=eyJicmlkZ2UiOiJnbG9iYWxTaG9ydGN1dHMiLCJpZCI6IjE3ODg3MjMwOTY1NTYiLCJzb3VyY2UiOiJqaXJhIn0%3D
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
                  - /url: https://home.atlassian.com/o/217bc256-kddj-14b3-kkdk-jb6bk7692jbk/goals?cloudId=049de078-bffa-42d1-bbfb-ad8db9860adb&xpis=eyJicmlkZ2UiOiJnbG9iYWxTaG9ydGN1dHMiLCJpZCI6IjE3ODg3MjMwOTY1NTYiLCJzb3VyY2UiOiJqaXJhIn0%3D
                  - generic [ref=e432]: Goals
                  - generic [ref=e433]: ", (opens new window)"
                - generic:
                  - generic:
                    - img
            - listitem [ref=e435]:
              - generic [ref=e436]:
                - link "Projects , (opens new window)" [ref=e437] [cursor=pointer]:
                  - /url: https://home.atlassian.com/o/217bc256-kddj-14b3-kkdk-jb6bk7692jbk/projects?cloudId=049de078-bffa-42d1-bbfb-ad8db9860adb&xpis=eyJicmlkZ2UiOiJnbG9iYWxTaG9ydGN1dHMiLCJpZCI6IjE3ODg3MjMwOTY1NTYiLCJzb3VyY2UiOiJqaXJhIn0%3D
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
                - button "Capacity" [active] [ref=f1e15] [cursor=pointer]
            - generic [ref=f1e16]:
              - text: Portfolio control · rev
              - strong [ref=f1e17]: v4.58.588
          - main [ref=f1e18]:
            - main [ref=f1e19]:
              - generic [ref=f1e20]:
                - button "Back to plans" [ref=f1e21] [cursor=pointer]
                - heading "Portfolio capacity" [level=1] [ref=f1e22]
              - paragraph [ref=f1e23]: Compare remaining Jira effort with your private availability assumptions across selected plans. This report does not move tasks or change anyone’s recorded availability.
              - group "Your portfolio" [ref=f1e24]:
                - generic [ref=f1e25]: Your portfolio
                - generic [ref=f1e26]:
                  - generic [ref=f1e27]:
                    - checkbox "Include LZPT Scenarios" [ref=f1e28] [cursor=pointer]
                    - text: LZPT Scenarios
                  - generic [ref=f1e29]:
                    - checkbox "Include test" [ref=f1e30] [cursor=pointer]
                    - text: test
                  - generic [ref=f1e31]:
                    - checkbox "Include LZPP Perf" [ref=f1e32] [cursor=pointer]
                    - text: LZPP Perf
                  - generic [ref=f1e33]:
                    - checkbox "Include [harness-test] Private report source mtq75lja" [ref=f1e34] [cursor=pointer]
                    - text: "[harness-test] Private report source mtq75lja"
                  - generic [ref=f1e35]:
                    - checkbox "Include [harness-test] Private report model mtq75lja" [ref=f1e36] [cursor=pointer]
                    - text: "[harness-test] Private report model mtq75lja"
                  - generic [ref=f1e37]:
                    - checkbox "Include [harness-test] UAT 20260906 October release decisions" [ref=f1e38] [cursor=pointer]
                    - text: "[harness-test] UAT 20260906 October release decisions"
                  - generic [ref=f1e39]:
                    - checkbox "Include [harness-test] UAT 20260906 October capacity mirror" [ref=f1e40] [cursor=pointer]
                    - text: "[harness-test] UAT 20260906 October capacity mirror"
                - generic [ref=f1e41]:
                  - generic [ref=f1e42]:
                    - text: Report starts
                    - button "Report starts" [ref=f1e43] [cursor=pointer]:
                      - generic [ref=f1e44]: Sep 6, 2026
                      - img [ref=f1e45]
                  - generic [ref=f1e47]:
                    - text: Report ends
                    - button "Report ends" [ref=f1e48] [cursor=pointer]:
                      - generic [ref=f1e49]: Oct 31, 2026
                      - img [ref=f1e50]
                  - button "Save selection and calculate" [ref=f1e52] [cursor=pointer]
              - paragraph [ref=f1e53]: Select plans and calculate. Availability stays unknown until you save an explicit assumption for a person.
```

# Test source

```ts
  1  | import assert from 'node:assert/strict';
  2  | import {createHash} from 'node:crypto';
  3  | import path from 'node:path';
  4  | 
  5  | export const retainedPlanNames={main:'[harness-test] UAT 20260906 October release decisions',mirror:'[harness-test] UAT 20260906 October capacity mirror'};
  6  | const summaries={E:'October release',A:'Delivery preparation',B:'Planned reserve',L:'Unrelated late work'};
  7  | const sorted=values=>[...values].sort();
  8  | const unique=values=>new Set(values).size===values.length;
  9  | 
  10 | // A single explicit UAT retention contract; not a generic registry exemption.
  11 | // The normal identity guard still proves the rendered stamp and original45.
  12 | export function retainedIdentityPolicy({ledger,beforeBytes,runId,unitDir,ledgerPath,actualLedgerPath,plans,details,actualCapacitySettings,actualDrafts}) {
  13 |   assert.equal(path.resolve(ledgerPath),path.join(path.resolve(unitDir),'retained-uat-ledger.json'),'Ledger must belong to this exact attempt');
  14 |   assert.equal(actualLedgerPath,path.resolve(ledgerPath),'Symlinked ledger/ancestor must not escape the attempt');
  15 |   const before=JSON.parse(beforeBytes);
> 16 |   assert.equal(ledger.schema,1);assert.equal(ledger.state,'retained');
     |                                        ^ AssertionError: Expected values to be strictly equal:
  17 |   assert.equal(ledger.runId,runId);assert.ok(typeof runId==='string'&&runId.length>0);
  18 |   assert.equal(ledger.unitDir,path.resolve(unitDir));
  19 |   assert.equal(ledger.beforeIdentitySha256,createHash('sha256').update(beforeBytes).digest('hex'));
  20 |   assert.equal(ledger.observedUiVersion,before.uiVersion);
  21 |   assert.equal(ledger.privateSettingsRestored,true);assert.equal(ledger.noPendingDrafts,true);
  22 |   for(const field of ['failure','settingsRestorationFailure','browserCrash'])assert.ok(!ledger[field],`Retained ledger has ${field}`);
  23 |   assert.ok(Array.isArray(ledger.cleanup)&&ledger.cleanup.every(row=>row.ok===true),'Every terminal cleanup/retention guard must pass');
  24 |   for(const name of ['owned source and standing schedule unchanged','registry exact retained delta','standing schedule unchanged'])assert.equal(ledger.cleanup.filter(row=>row.name===name&&row.ok===true).length,1);
  25 |   assert.ok(ledger.originalPrivateSettings&&typeof ledger.originalPrivateSettings==='object');assert.deepEqual(actualCapacitySettings,ledger.originalPrivateSettings,'Fresh current-user settings must equal the original');
  26 |   assert.ok(Number.isFinite(Date.parse(ledger.startedAt))&&Number.isFinite(Date.parse(ledger.finishedAt)));
  27 |   assert.ok(Date.parse(ledger.startedAt)>=Date.parse(before.time)&&Date.parse(ledger.finishedAt)>=Date.parse(ledger.startedAt));
  28 |   assert.ok(Array.isArray(before.planIds)&&unique(before.planIds));assert.deepEqual(sorted(ledger.registry),sorted(before.planIds));
  29 |   assert.deepEqual(Object.keys(ledger.plans).sort(),['main','mirror']);
  30 |   assert.deepEqual(Object.keys(ledger.issues).sort(),['A','B','E','L']);
  31 |   const ownedPlans=Object.entries(retainedPlanNames).map(([role,name])=>{
  32 |     const item=ledger.plans[role];assert.equal(item.state,'created');assert.equal(item.name,name);assert.ok(typeof item.id==='string'&&item.id.startsWith('plan-'));
  33 |     assert.ok(!before.planIds.includes(item.id),'A retained plan must be new to this attempt');
  34 |     const actual=plans.filter(plan=>plan.id===item.id);assert.equal(actual.length,1);assert.equal(actual[0].name,name);return item.id;
  35 |   });
  36 |   assert.ok(unique(ownedPlans));
  37 |   const expected=sorted([...before.planIds,...ownedPlans]);assert.deepEqual(sorted(plans.map(plan=>plan.id)),expected,'Only the two exact retained plans may be added');
  38 |   const issues=Object.entries(summaries).map(([role,summary])=>{
  39 |     const item=ledger.issues[role];assert.equal(item.state,'created');assert.match(item.id,/^\d+$/);assert.match(item.key,/^WFH-\d+$/);
  40 |     assert.equal(item.summary,`[harness-test] LZ retained UAT 20260906 ${summary}`);assert.equal(item.type,role==='E'?'10000':'10004');return item;
  41 |   });
  42 |   assert.ok(unique(issues.map(i=>i.id))&&unique(issues.map(i=>i.key)));
  43 |   assert.ok(ledger.handoff?.baselineId&&ledger.handoff?.originalId&&ledger.handoff?.alternativeId&&ledger.handoff?.reportId,'Retained decisions and report must be recorded');
  44 |   assert.match(ledger.handoff.reportHtmlHash,/^[a-f0-9]{64}$/);
  45 |   assert.equal(details.length,2);
  46 |   assert.deepEqual(actualDrafts.map(item=>item.planId).sort(),sorted(ownedPlans));
  47 |   for(const item of actualDrafts){assert.equal(item.draft,null);assert.deepEqual(item.drafts,{});}
  48 |   for(const planId of ownedPlans){
  49 |     const matching=details.filter(detail=>detail.meta?.id===planId);assert.equal(matching.length,1);const detail=matching[0];
  50 |     assert.equal(detail.meta.name,plans.find(p=>p.id===planId).name);assert.notEqual(detail.meta.mode,'simulation');assert.equal(detail.meta.status,'indexed');assert.equal(detail.meta.issueCount,4);
  51 |     assert.equal(detail.issues.length,4);assert.deepEqual(sorted(detail.issues.map(i=>i.key)),sorted(issues.map(i=>i.key)));
  52 |     for(const expectedIssue of issues){const row=detail.issues.find(i=>i.key===expectedIssue.key);assert.equal(String(row.id),expectedIssue.id);assert.equal(row.summary,expectedIssue.summary);}
  53 |   }
  54 |   return {planIds:expected,retainedPlanIds:ownedPlans,retainedIssueKeys:issues.map(i=>i.key),ledgerHash:createHash('sha256').update(JSON.stringify(ledger)).digest('hex')};
  55 | }
  56 | 
```