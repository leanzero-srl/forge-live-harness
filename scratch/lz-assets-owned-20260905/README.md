# Dedicated native Assets fixture — retained for live acceptance

Created through REST on wolfaenpak only, 2026-09-05. This is fixture verification, **not** evidence that LeanZero filtering, grouping, rename refresh or hidden-successor behavior passes. No browser, app source, deployment, existing harness instrument or existing Jira issue mutation was used.

## Exact owned identities

Ownership marker `lz-assets-owned-20260905`; name prefix `[harness-test] LZ Assets owned 20260905`. Workspace `be9cca2f-5f41-446f-8f5c-76cda0be8417`, schema35/CRT, type43/Laptop, Name attribute156. Existing schema/type configuration was read only.

| Role | Identity | Retained configuration |
| --- | --- | --- |
| A | 411 / CRT-411 | prefix + ` A` |
| B | 412 / CRT-412 | prefix + ` B` |
| C | 413 / CRT-413 | prefix + ` C` |
| Multiple field | customfield_11148 | context11758, multiple=true |
| Gate field | customfield_11149 | context11760, multiple=false |
| R1 | JT-74 | multiple=[411,412], gate=[411] |
| R2 | JT-75 | multiple=[412], gate=[413] |
| R3 | JT-76 | multiple=[], gate=[411] |

Both fields have native schema `com.atlassian.jira.plugins.cmdb:cmdb-object-cftype`, not an app-owned imitation. Configured contexts map exactly to JT/project10008, Task/type10005. Both filter AQLs are `objectTypeId = 43 AND objectId IN (411,412,413)`. Name is the search/display attribute. Only the two new fields were added to JT screen10038/tab10043; all pre-existing screen fields remain.

Jira automatically created global fallback contexts11757/11759. They remain **unconfigured**, verified by REST without schema/workspace. The configured contexts are JT Task only; do not describe the field definitions themselves as having no global context. Current Jira documentation prohibits removing/restricting a global context. No shared field/context was changed to work around this.

## Verified outcome and evidence

`ownership.json` records every write intent before HTTP, each acknowledged creation identity immediately before another request, status, exact configuration readback, context/type mappings, source guard and two separate later GETs for each owned issue. No credentials, avatar/media URLs or auth headers are retained. The final verifier checks field presence separately from an empty value, full workspace+object+composite identity, exact unordered values, owned object labels/keys/type, full config equality, context mapping completeness, unconfigured fallback contexts, screen retention, and shared fixture equality.

Every exact issue's edit-meta reports both native fields, `[set]`, `isInsightAvailable:true`, and multiple=true/false respectively. Due date is editable. Start date `customfield_10015`, Duration `customfield_10180`, and Buffer `customfield_10181` are absent from edit-meta for JT-74/75/76. No dates, durations, dependencies or hidden-successor schedule were created. The live scheduling journey must account for this measured applicability instead of assuming these fields can be written. It may use an independently authorized local plan edit or request coordinated dedicated configuration; this preparation makes neither claim.

Before every stage and after final verification, shared field11081/context11589, JT-56, JT-16, and objects71/72 match the retained sanitized preflight exactly. No LZPT requests or mutations were made. Protection covers the measured fields/attributes, not a claim that every unrelated tenant property was audited.

Three provisioning interruptions are preserved honestly: an initial local JSON undefined/missing comparison mismatch halted before creation; GET `/field` omitted the newly created contextless field so the script switched to exact admin `/field/search?id=...`; the first owned internal configuration PUT returned500 because GET-shaped data omitted `attributesDisplayedOnIssue`. A subsequent read showed both owned contexts still unconfigured. Adding `attributesDisplayedOnIssue:["Name"]` produced200, full config readback, correct edit-meta and actual persisted multi-object values. This is measured internal endpoint behavior, not a claim of public API stability.

## Live acceptance handoff

Use source JQL `key in (JT-74, JT-75, JT-76)` so unrelated JT fixtures are excluded. Use these local reference filters, not native Assets JQL: first-field ANY(A,B) => JT-74/JT-75; adding gate=A => JT-74; first-field empty plus gate=A => JT-76. Explicit selection A alone => JT-74. Grouping on the first field must handle JT-74's two values and the empty JT-76 honestly without duplicate issue scheduling. Rename **owned A only**, retain411/CRT-411, then verify refreshed labels and stable selections/results; restore its original recorded label after the journey. Preserve source fields unless a test explicitly journals and restores its own change.

The deployed app still must prove discovery, selection persistence/reopen, multi-object matching, cross-field AND, empty and no-match, grouping, rename refresh, and schedule independence. Fixture readiness is not feature acceptance.

## Resume and eventual reversal

Run from the harness root: `node scratch/lz-assets-owned-20260905/provision.mjs status` for the shared guard and journal summary, or `... verify` for fresh exact fixture reads. Mutating stages are separately named `objects`, `fields`, `config`, `issues`; completed resource IDs are reused, not recreated. A pending uncertain operation blocks a retry and requires reconciliation by its exact recorded name/identity. There are no automatic network retries on writes. Do not rerun the initial `preflight` once collaborators have changed unrelated tenant setup: it is an initial snapshot, not a restoration action.

Retain this successful fixture until parent/live-lane UAT finishes. Cleanup is deliberately not auto-executed. The ownership journal is sufficient to reverse only this fixture, in this order:

1. Coordinate with the live lane and remove any app plans that exclusively reference this fixture through the app's normal deletion flow. Read each JT issue by recorded id/key and verify project10008, type10005, marker and summary prefix before DELETE `/rest/api/3/issue/{JT-74|JT-75|JT-76}`. Record each response; verify each individual deletion. Never use a project-wide delete query.
2. Read screen10038/tab10043, then DELETE `/rest/api/3/screens/10038/tabs/10043/fields/{customfield_11148|customfield_11149}` only for these two attachments; verify every original screen field is retained. Read each exact field's admin inventory name/type before POST `/rest/api/3/field/{customfield_11148|customfield_11149}/trash`. This reversible trash operation owns the fields and their contexts; do not try to delete shared/global context11589. Do not permanently delete trash without a separate reason.
3. Read each owned object411/412/413 through Assets `/object/{id}`. Verify recorded key, type43 and owned label (restore a journaled rename first if necessary), then DELETE only those object IDs at the same endpoint. Verify exact individual responses/readbacks. Never delete schema35, type43, attribute156, or objects71/72.
4. Recheck the shared guard against `sharedBefore` and record the cleanup journal. No cleanup step is claimed executed by this preparation.

References: [Atlassian object API](https://developer.atlassian.com/cloud/assets/rest/api-group-object/), [Jira field contexts](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-custom-field-contexts/), [documented Assets update payload](https://support.atlassian.com/jira/kb/format-the-payload-to-update-assets-custom-fields-via-rest-api/). The API-token source is ignored harness `.env`, loaded by `data/env.mjs`; never copy it into evidence.

## WFH schedule-capable extension (separate retained ownership)

`wfh.mjs` and `wfh-ownership.json` add two **new contexts on the same owned fields**, preserving JT contexts11758/11760 and unconfigured global contexts11757/11759. New WFH/project10001, Work package/type10004 contexts are11761 on11148 and11762 on11149. Their complete native configs equal the owned JT configs, including object411/412/413 AQL and multiple=true/false. Public context mappings verify exactly one project/type each.

Actual mapping is WFH issue-type-screen-scheme10001 → default type mapping to screen-scheme10004 (`WFH: Kanban Default Screen Scheme`): create10004/tab10007, edit10014/tab10017, view/default10009/tab10012. Each sole General tab was read before writes, and only11148/11149 were added to these three screens. All original tab fields remain. No scheme, schedule-field configuration, JT screen or existing issue was modified. Current create-meta then includes both native Assets fields.

Retained positive-control issue **WFH-2820**, exact id in `wfh-ownership.json`, summary `[harness-test] LZ Assets owned 20260905 WFH positive control`, ADF description contains ownership marker `lz-assets-owned-20260905-wfh`. Labels are not on this project's create/edit screen, so marker-in-description plus exact id/summary/project/type is the ownership guard. Exact newly created issue edit-meta proves Start10015, custom Due Date10042, PPM Duration10180 and Buffer10181 all support `[set]`, together with native11148 multiple=true and11149 multiple=false. This is edit-meta visibility, not the app mapping or a writability whitelist. The deployed app maps Due date to system `duedate` (verified below).

One owned PUT set Start2026-10-05, custom Due2026-10-09, duration5, Assets11148=[411,412], Assets11149=[411]. Two later same-issue GETs assert every date/number/reference exactly and retain sanitized values/timestamps. Buffer writability is proven by metadata but no buffer value was written. This demonstrates schedule and Assets field applicability on the **same new WFH issue**, not cascade or Apply acceptance. The live lane may create additional owned WFH10004 rows for its hidden-successor test using these contexts; it owns and restores those rows independently. This positive control remains retained, not mutated by a browser test unless separately journaled.

`node scratch/lz-assets-owned-20260905/wfh.mjs verify` repeats the exact WFH outcome, context/config/screen checks and protected shared/JT/global-config checks. Mutating stages `contexts`, `config`, `issue` reuse recorded identities and refuse retries over uncertain writes. `discover` was the initial read-only capture; do not repeat it to overwrite pre-change screen evidence. No retry or error occurred on WFH writes. `wfh-verify.txt` and `jt-after-wfh-verify.txt` retain final console outcomes; the JSON journals carry exact assertions' values. Original JT verification was repeated after WFH configuration, including unchanged existing guarded sources.

**Cleanup extension:** coordinate with live lane before any reversal. Delete WFH-2820 only after the exact ownership checks above, and any additional live-lane rows only through their own cleanup journals. Remove only11148/11149 from WFH screens10004/10014/10009 and their recorded tabs, preserving all original fields. If retaining JT fixture, delete **only new restricted contexts11761/11762** through Jira context API after its WFH rows are gone; leave fields, JT contexts and global fallbacks intact. If deleting the entire fixture, perform this WFH cleanup before the original README's field-trash/object-delete sequence. No reversal was executed.

### Mapped due correction

The first WFH preparation incorrectly inferred app mapping from edit-meta. Actual deployed `fieldConfig` returns start10015, dueDate=`duedate`, duration10180, buffer10181. The `mapped-due` stage records that sanitized configuration and writes system `duedate`2026-10-09 on WFH-2820 only. HTTP204 and two later exact GETs prove the system date persisted while custom10042 remains2026-10-09 and Start/Duration/Assets remain unchanged. Absence from edit-meta is not evidence of forbidden writes. The fixture now includes the actual app-mapped schedule fields; the custom date is a retained additional field, not the app due mapping.
