# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios/lz-ppm/campaign-identity.spec.ts >> campaign: actual UI version and preserved LZPT source
- Location: scenarios/lz-ppm/campaign-identity.spec.ts:14:1

# Error details

```
Error: no temporary plan remains or original plan disappeared

expect(received).toEqual(expected) // deep equality

- Expected  - 0
+ Received  + 3

  Array [
    "plan-msq9dg8l-gz6mz1",
    "plan-mta3aw3t-6dyijd",
    "plan-mtbrlh8n-7ghw8u",
+   "plan-test-mtpzm3tg-kkqxi5",
+   "plan-test-mtpzn218-4ref5x",
+   "plan-test-mtpzo368-x4846f",
  ]
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
                              - /url: /jira/marketplace/discover/app/com.k15t.backbone.backbone-issue-sync?source=side_nav_recommendations_jira&recoSessionId=86867bb5-0405-421a-922b-28825acb30af&recoEntityId=fd952d18bc77797673b685009ba8520e9656df27515b7e0491bd61e8d8de9e0b
                              - generic [ref=e242]: Backbone Work Sync for Jira (Two Way Issue Sync)
                              - generic [ref=e243]: ", (opens new window)"
                            - generic:
                              - generic:
                                - img
                        - listitem [ref=e244]:
                          - generic [ref=e245]:
                            - link "Clockwork Pro for Jira Time Tracking and Timesheets , (opens new window)" [ref=e246] [cursor=pointer]:
                              - /url: /jira/marketplace/discover/app/clockwork-cloud?source=side_nav_recommendations_jira&recoSessionId=86867bb5-0405-421a-922b-28825acb30af&recoEntityId=c580df1e7a75a52a0de82b490516095161f6bbe4a514c2fdc43a0b80a1a244d6
                              - generic [ref=e251]: Clockwork Pro for Jira Time Tracking and Timesheets
                              - generic [ref=e252]: ", (opens new window)"
                            - generic:
                              - generic:
                                - img
                        - listitem [ref=e253]:
                          - generic [ref=e254]:
                            - link "The Scheduler , (opens new window)" [ref=e255] [cursor=pointer]:
                              - /url: /jira/marketplace/discover/app/pl.com.tt.jira.plugin.theschedulerpro?source=side_nav_recommendations_jira&recoSessionId=86867bb5-0405-421a-922b-28825acb30af&recoEntityId=1aa3f7f3aadfe79312c635b47f2e2b30feaa2352c2d0118735fb18993d8287b5
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
                  - /url: https://wolfaenpak.atlassian.net/wiki?xpis=eyJicmlkZ2UiOiJnbG9iYWxTaG9ydGN1dHMiLCJpZCI6IjE3ODg3MDk5ODI3NzMiLCJzb3VyY2UiOiJqaXJhIn0%3D
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
                  - /url: https://home.atlassian.com/o/217bc256-kddj-14b3-kkdk-jb6bk7692jbk/goals?cloudId=049de078-bffa-42d1-bbfb-ad8db9860adb&xpis=eyJicmlkZ2UiOiJnbG9iYWxTaG9ydGN1dHMiLCJpZCI6IjE3ODg3MDk5ODI3NzMiLCJzb3VyY2UiOiJqaXJhIn0%3D
                  - generic [ref=e432]: Goals
                  - generic [ref=e433]: ", (opens new window)"
                - generic:
                  - generic:
                    - img
            - listitem [ref=e435]:
              - generic [ref=e436]:
                - link "Projects , (opens new window)" [ref=e437] [cursor=pointer]:
                  - /url: https://home.atlassian.com/o/217bc256-kddj-14b3-kkdk-jb6bk7692jbk/projects?cloudId=049de078-bffa-42d1-bbfb-ad8db9860adb&xpis=eyJicmlkZ2UiOiJnbG9iYWxTaG9ydGN1dHMiLCJpZCI6IjE3ODg3MDk5ODI3NzMiLCJzb3VyY2UiOiJqaXJhIn0%3D
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
            - generic [ref=f1e19]:
              - generic [ref=f1e20]:
                - generic [ref=f1e21]:
                  - generic [ref=f1e22]: Portfolio
                  - heading "Plans" [level=1] [ref=f1e23]
                  - paragraph [ref=f1e24]: Manage your project portfolio timelines
                - generic [ref=f1e25]:
                  - button "Import a Jira plan" [ref=f1e26] [cursor=pointer]
                  - button "+ New Plan" [ref=f1e27] [cursor=pointer]
              - generic [ref=f1e28]:
                - button "New plan Index issues from JQL, a board, or a project" [ref=f1e29] [cursor=pointer]:
                  - img [ref=f1e31]
                  - generic [ref=f1e33]: New plan
                  - generic [ref=f1e34]: Index issues from JQL, a board, or a project
                - 'button "Import a Jira plan Bring a Jira Premium plan in: its sources, exclusion rules and date fields" [ref=f1e35] [cursor=pointer]':
                  - img [ref=f1e37]
                  - generic [ref=f1e40]: Import a Jira plan
                  - generic [ref=f1e41]: "Bring a Jira Premium plan in: its sources, exclusion rules and date fields"
                - generic [ref=f1e42] [cursor=pointer]:
                  - generic [ref=f1e43]:
                    - heading "LZPT Scenarios" [level=3] [ref=f1e44]
                    - generic [ref=f1e45]:
                      - generic [ref=f1e47]: Ready
                      - button "More" [ref=f1e49]:
                        - img [ref=f1e50]
                  - generic [ref=f1e54]:
                    - generic [ref=f1e55]:
                      - generic [ref=f1e56]: "45"
                      - generic [ref=f1e57]: Issues
                    - generic [ref=f1e58]:
                      - generic [ref=f1e59]: "1"
                      - generic [ref=f1e60]: Sources
                    - generic [ref=f1e61]:
                      - generic [ref=f1e62]: "0"
                      - generic [ref=f1e63]: Drafts
                  - generic [ref=f1e65]:
                    - text: JQL
                    - generic [ref=f1e67]: "?"
                  - generic [ref=f1e68]:
                    - generic [ref=f1e69]: Updated 18h ago
                    - generic [ref=f1e70]: Indexed 18h ago
                  - button "Open plan →" [ref=f1e71]
                - generic [ref=f1e72] [cursor=pointer]:
                  - generic [ref=f1e73]:
                    - heading "test" [level=3] [ref=f1e74]
                    - generic [ref=f1e75]:
                      - generic [ref=f1e77]: Ready
                      - button "More" [ref=f1e79]:
                        - img [ref=f1e80]
                  - generic [ref=f1e84]:
                    - generic [ref=f1e85]:
                      - generic [ref=f1e86]: "54"
                      - generic [ref=f1e87]: Issues
                    - generic [ref=f1e88]:
                      - generic [ref=f1e89]: "1"
                      - generic [ref=f1e90]: Sources
                    - generic [ref=f1e91]:
                      - generic [ref=f1e92]: "0"
                      - generic [ref=f1e93]: Drafts
                  - generic [ref=f1e95]:
                    - text: JQL
                    - generic [ref=f1e97]: "?"
                  - generic [ref=f1e98]:
                    - generic [ref=f1e99]: Updated 21h ago
                    - generic [ref=f1e100]: Indexed 21h ago
                  - button "Open plan →" [ref=f1e101]
                - generic [ref=f1e102] [cursor=pointer]:
                  - generic [ref=f1e103]:
                    - heading "LZPP Perf" [level=3] [ref=f1e104]
                    - generic [ref=f1e105]:
                      - generic [ref=f1e107]: Ready
                      - button "More" [ref=f1e109]:
                        - img [ref=f1e110]
                  - generic [ref=f1e114]:
                    - generic [ref=f1e115]:
                      - generic [ref=f1e116]: 5,300
                      - generic [ref=f1e117]: Issues
                    - generic [ref=f1e118]:
                      - generic [ref=f1e119]: "1"
                      - generic [ref=f1e120]: Sources
                    - generic [ref=f1e121]:
                      - generic [ref=f1e122]: "0"
                      - generic [ref=f1e123]: Drafts
                  - generic [ref=f1e125]:
                    - text: JQL
                    - generic [ref=f1e127]: "?"
                  - generic [ref=f1e128]:
                    - generic [ref=f1e129]: Updated 21h ago
                    - generic [ref=f1e130]: Indexed 21h ago
                  - button "Open plan →" [ref=f1e131]
                - generic [ref=f1e132] [cursor=pointer]:
                  - generic [ref=f1e133]:
                    - heading "[harness-test] lz-norm-mtpzm0tl" [level=3] [ref=f1e134]
                    - generic [ref=f1e135]:
                      - generic [ref=f1e137]: Ready
                      - button "More" [ref=f1e139]:
                        - img [ref=f1e140]
                  - generic [ref=f1e144]:
                    - generic [ref=f1e145]:
                      - generic [ref=f1e146]: "1"
                      - generic [ref=f1e147]: Issues
                    - generic [ref=f1e148]:
                      - generic [ref=f1e149]: "1"
                      - generic [ref=f1e150]: Sources
                    - generic [ref=f1e151]:
                      - generic [ref=f1e152]: "0"
                      - generic [ref=f1e153]: Drafts
                  - generic [ref=f1e155]:
                    - text: JQL
                    - generic [ref=f1e157]: "?"
                  - generic [ref=f1e158]:
                    - generic [ref=f1e159]: Updated 3m ago
                    - generic [ref=f1e160]: Indexed 3m ago
                  - button "Open plan →" [ref=f1e161]
                - generic [ref=f1e162] [cursor=pointer]:
                  - generic [ref=f1e163]:
                    - heading "[harness-test] lz-norm-mtpzn01w" [level=3] [ref=f1e164]
                    - generic [ref=f1e165]:
                      - generic [ref=f1e167]: Ready
                      - button "More" [ref=f1e169]:
                        - img [ref=f1e170]
                  - generic [ref=f1e174]:
                    - generic [ref=f1e175]:
                      - generic [ref=f1e176]: "1"
                      - generic [ref=f1e177]: Issues
                    - generic [ref=f1e178]:
                      - generic [ref=f1e179]: "1"
                      - generic [ref=f1e180]: Sources
                    - generic [ref=f1e181]:
                      - generic [ref=f1e182]: "0"
                      - generic [ref=f1e183]: Drafts
                  - generic [ref=f1e185]:
                    - text: JQL
                    - generic [ref=f1e187]: "?"
                  - generic [ref=f1e188]:
                    - generic [ref=f1e189]: Updated 2m ago
                    - generic [ref=f1e190]: Indexed 2m ago
                  - button "Open plan →" [ref=f1e191]
                - generic [ref=f1e192] [cursor=pointer]:
                  - generic [ref=f1e193]:
                    - heading "[harness-test] lz-norm-mtpzo0q6" [level=3] [ref=f1e194]
                    - generic [ref=f1e195]:
                      - generic [ref=f1e197]: Ready
                      - button "More" [ref=f1e199]:
                        - img [ref=f1e200]
                  - generic [ref=f1e204]:
                    - generic [ref=f1e205]:
                      - generic [ref=f1e206]: "1"
                      - generic [ref=f1e207]: Issues
                    - generic [ref=f1e208]:
                      - generic [ref=f1e209]: "1"
                      - generic [ref=f1e210]: Sources
                    - generic [ref=f1e211]:
                      - generic [ref=f1e212]: "0"
                      - generic [ref=f1e213]: Drafts
                  - generic [ref=f1e215]:
                    - text: JQL
                    - generic [ref=f1e217]: "?"
                  - generic [ref=f1e218]:
                    - generic [ref=f1e219]: Updated 2m ago
                    - generic [ref=f1e220]: Indexed 2m ago
                  - button "Open plan →" [ref=f1e221]
```

# Test source

```ts
  1  | // Identity and source integrity guard for the resumable campaign runner. It has
  2  | // no writes; it refuses unowned drafts/fixtures rather than clearing them.
  3  | import fs from 'node:fs';
  4  | import path from 'node:path';
  5  | import crypto from 'node:crypto';
  6  | import {fileURLToPath} from 'node:url';
  7  | import { test, expect } from '../../fixtures/forge';
  8  | import { openPlans, scheduleFields, LZPT_PLAN } from './forecast-fixture';
  9  | import { getTestState } from '../../testhook/client';
  10 | import {retainedIdentityPolicy,retainedPlanNames} from './retained-identity-policy.mjs';
  11 | import {actualResponse,currentUserResolver} from './campaign-ui';
  12 | 
  13 | test.describe.configure({ retries: 0, timeout: 180_000 });
  14 | test('campaign: actual UI version and preserved LZPT source', async ({ page }) => {
  15 |   const dir = process.env.LZ_CAMPAIGN_UNIT_DIR;
  16 |   test.skip(!dir, 'Explicit campaign identity guard; run through scripts/lz-campaign.py');
  17 |   const expected = process.env.LZ_EXPECTED_UI_VERSION;
  18 |   const phase = process.env.LZ_CAMPAIGN_PHASE;
  19 |   const extension = JSON.parse(process.env.LZ_CAMPAIGN_SOURCE_EXTENSION || 'null');
  20 |   const foreignKeys: string[] = extension?.keys || [];
  21 |   expect(new Set(foreignKeys).size).toBe(foreignKeys.length);
  22 |   if (extension) { expect(extension.reason).toBeTruthy(); expect(extension.originalFingerprint).toMatch(/^[a-f0-9]{64}$/); }
  23 |   const expectedCount = 45 + foreignKeys.length;
  24 |   expect(expected, 'a concrete deployed UI version is required').toMatch(/^\d+\.\d+\.\d+$/);
  25 |   expect(['before', 'after']).toContain(phase);
  26 |   const frame = await openPlans(page);
  27 |   const body = await frame.locator('body').innerText();
  28 |   const actual = body.match(/REV\s+V(\d+\.\d+\.\d+)/i)?.[1];
  29 |   expect(actual, 'read the actual revision from the rendered app').toBe(expected);
  30 |   const card = frame.locator('.lz-card', { hasText: 'LZPT Scenarios' }).first();
  31 |   await expect(card).toContainText(new RegExp(`${expectedCount}\\s*ISSUES`, 'i'));
  32 |   await expect(card).toContainText(/0\s*DRAFTS/i);
  33 |   const detail = await getTestState('lz-ppm', { what: 'plan', planId: LZPT_PLAN });
  34 |   expect(detail.issues.length, 'the same protected bed is positively visible').toBe(expectedCount);
  35 |   expect(detail.meta.issueCount).toBe(expectedCount);
  36 |   expect(detail.meta.protectionEnabled).toBe(false);
  37 |   expect(new Set(detail.issues.map((i: any) => i.key)).size).toBe(expectedCount);
  38 |   for (const key of ['LZPT-209', 'LZPT-212', 'LZPT-214', 'LZPT-215']) expect(detail.issues.some((i: any) => i.key === key)).toBe(true);
  39 |   const source = { issues: scheduleFields(detail.issues), sources: detail.meta.sources, calendarKey: detail.meta.calendarKey,
  40 |     holidayYears: detail.meta.holidayYears, milestones: detail.meta.milestones, protectionEnabled: detail.meta.protectionEnabled };
  41 |   const ORIGINAL_FINGERPRINT='2d5c1ea0d3e742ff61ae47701ab6a391d0cbe6f0238e9415fb73b38e8f21f104';
  42 |   {
  43 |     const originalKeys = Array.from({length:45},(_,n)=>`LZPT-${186+n}`);
  44 |     expect(detail.issues.map((i:any)=>i.key).sort()).toEqual([...originalKeys,...foreignKeys].sort());
  45 |     const original = {...source, issues: source.issues.filter((i:any)=>originalKeys.includes(i.key))};
  46 |     expect(crypto.createHash('sha256').update(JSON.stringify(original)).digest('hex'), 'original 45 complete source schedule remains unchanged').toBe(ORIGINAL_FINGERPRINT);
  47 |     if(extension)expect(extension.originalFingerprint).toBe(ORIGINAL_FINGERPRINT);
  48 |   }
  49 |   const fingerprint = crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex');
  50 |   const plans = (await getTestState('lz-ppm', { what: 'plans' })).plans;
  51 |   const planIds = plans.map((p: any) => p.id).sort();
  52 |   const identity:any = { time: new Date().toISOString(), phase, uiVersion: actual, sourceFingerprint: fingerprint, issueCount: detail.issues.length, coordinatedSourceExtension: extension, drafts: 0, protectionEnabled: false, planIds };
  53 |   if (phase === 'after') {
  54 |     const before = JSON.parse(fs.readFileSync(path.join(dir!, 'before-identity.json'), 'utf8'));
  55 |     expect(fingerprint, 'the complete source schedule and plan settings are unchanged').toBe(before.sourceFingerprint);
  56 |     const ledgerPath=process.env.LZ_RETAINED_UAT_LEDGER;
> 57 |     if(!ledgerPath)expect(planIds, 'no temporary plan remains or original plan disappeared').toEqual(before.planIds);
     |                                                                                              ^ Error: no temporary plan remains or original plan disappeared
  58 |     else{
  59 |       expect(path.resolve(ledgerPath)).toBe(path.join(path.resolve(dir!),'retained-uat-ledger.json'));
  60 |       expect(fs.lstatSync(ledgerPath).isSymbolicLink()).toBe(false);const ledgerBytes=fs.readFileSync(ledgerPath),ledger=JSON.parse(ledgerBytes.toString('utf8'));
  61 |       const globalLedger=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../scratch/lz-retained-uat-20260906/ownership.json');
  62 |       expect(ledger.ledgerPath).toBe(globalLedger);expect(fs.realpathSync(globalLedger)).toBe(globalLedger);expect(fs.readFileSync(globalLedger).equals(ledgerBytes),'attempt mirror matches the fixed exclusive ownership claim').toBe(true);
  63 |       const retained=Object.values(retainedPlanNames).map(name=>{const found=plans.filter((p:any)=>p.name===name);expect(found).toHaveLength(1);return found[0];});
  64 |       for(const p of retained)await expect(frame.locator('.lz-card',{hasText:p.name})).toContainText(/0\s*DRAFTS/i);
  65 |       const details=await Promise.all(retained.map(p=>getTestState('lz-ppm',{what:'plan',planId:p.id})));
  66 |       const rpc=currentUserResolver(page,c=>c?.functionKey==='getCapacitySettings');
  67 |       try{
  68 |         const settingsResponse=actualResponse(page,'getCapacitySettings');await frame.getByRole('button',{name:'Capacity',exact:true}).click();const saved=await settingsResponse;
  69 |         const actualDrafts=[];for(const p of retained){const draft=await rpc.invoke('getDraft',{planId:p.id}),active=await rpc.invoke('getActiveDrafts',{planId:p.id});expect(draft.success).toBe(true);expect(active.success).toBe(true);actualDrafts.push({planId:p.id,draft:draft.draft,drafts:active.drafts});}
  70 |         identity.retention=retainedIdentityPolicy({ledger,beforeBytes:fs.readFileSync(path.join(dir!,'before-identity.json')),runId:process.env.LZ_CAMPAIGN_RUN_ID,unitDir:dir,ledgerPath,actualLedgerPath:fs.realpathSync(ledgerPath),plans,details,actualCapacitySettings:saved.settings,actualDrafts});
  71 |       }finally{rpc.stop();}
  72 |       await openPlans(page);
  73 |     }
  74 |   }
  75 |   fs.mkdirSync(dir!, { recursive: true });
  76 |   fs.writeFileSync(path.join(dir!, `${phase}-identity.json`), JSON.stringify(identity, null, 2) + '\n');
  77 |   await page.screenshot({ path: path.join(dir!, `${phase}-identity.png`), fullPage: true, animations: 'disabled' });
  78 |   console.log('CAMPAIGN_IDENTITY', JSON.stringify(identity));
  79 | });
  80 | 
```