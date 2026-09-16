import { createHash } from 'node:crypto';
import { prepareApplyChanges, applyCanonical } from '/Users/mihaiperdum/Projects/lz-ppm-forge/static/ppm-ui/src/utils/apply-protocol.mjs';
const URL = process.env.LZM_URL, T = process.env.LZM_TOKEN; let KEY = process.env.PROBE_KEY;
const h = v => createHash('sha256').update(applyCanonical(v)).digest('hex');
const api = async (q, method = 'GET', body) => { const r = await fetch(`${URL}?${q}`, { method, headers: { Authorization: `Bearer ${T}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) }); return { status: r.status, ...(await r.json()) }; };
const call = (name, payload) => api(`resource=call&name=${name}`, 'POST', payload);
const created = await api('resource=plans', 'POST', { name: 'zz-abandoned-probe (delete me)', jql: process.env.PROBE_JQL || `key = ${KEY}`, index: true, wait: 20, protectionEnabled: false });
const planId = created.plan.id; console.log('plan', planId, created.progress?.status);
for (let n = 0; n < 30; n++) { const p = await api(`resource=plans&id=${planId}&action=progress`, 'POST'); if (p.status === 'indexed') break; await new Promise(r => setTimeout(r, 3000)); }
try {
  const all = (await api(`resource=issues&planId=${planId}`)).issues || []; const pick = all.find(i => i._original?.startDate && i._original?.dueDate && !i.children?.length) || all[0]; if (!pick) throw new Error('plan has no issues: ' + JSON.stringify(all).slice(0, 200)); KEY = pick.key; const before = pick; const o = before._original; console.log('issue', KEY, o.startDate, o.dueDate);
  // 1. An abandoned attempt: start + upload one page, then walk away (what the stale tab left behind).
  const changes = [{ issueKey: KEY, startDate: '2026-11-24', dueDate: '2026-11-27' }], pages = prepareApplyChanges(changes), pageHashes = pages.map(h);
  const st = await call('startWrite', { protocol: 'bounded-apply-v1', planId, requestId: `aband-${Date.now()}`, expectedDraftRevision: 'none', total: 1, pageCount: 1, inputHash: h({ total: 1, pageHashes }) });
  const s = st.session; await call('writeChunk', { protocol: 'bounded-apply-v1', planId, sessionId: s.sessionId, lockToken: s.lockToken, expectedCheckpoint: s.checkpoint, action: 'upload', page: 0, pageHash: pageHashes[0], changes: pages[0] });
  console.log('abandoned session', s.sessionId, (await api(`resource=apply&planId=${planId}`)).session?.stage);
  // 2. Seconds later: a resume must still be offered (a live tab could be driving it).
  const soon = await api(`resource=apply&planId=${planId}`, 'POST', { changes: [{ issueKey: KEY, startDate: '2026-11-25', dueDate: '2026-11-30' }] });
  console.log('right away →', soon.status, soon.done, (soon.error || '').slice(0, 90));
  // 3. A minute of silence: the attempt is abandoned and a fresh apply proceeds without a prompt.
  await new Promise(r => setTimeout(r, 62000));
  let r = await api(`resource=apply&planId=${planId}`, 'POST', { changes: [{ issueKey: KEY, startDate: '2026-11-25', dueDate: '2026-11-30' }] });
  console.log('after 62 s →', r.status, 'done', r.done, r.stopped || r.error || '', r.session?.sessionId !== s.sessionId ? 'NEW session' : 'SAME session');
  for (let n = 0; !r.done && r.stopped === 'time-budget' && n < 10; n++) { r = await api(`resource=apply&planId=${planId}&action=run`, 'POST'); console.log('  run →', r.status, r.done, r.session && `${r.session.stage} w${r.session.written}`); }
  const mid = (await api(`resource=issues&planId=${planId}&key=${KEY}`)).issue; console.log('written baseline', mid._original.startDate, mid._original.dueDate);
  // 4. Restore through the same door.
  r = await api(`resource=apply&planId=${planId}`, 'POST', { changes: [{ issueKey: KEY, startDate: o.startDate, dueDate: o.dueDate }] });
  for (let n = 0; !r.done && r.stopped === 'time-budget' && n < 10; n++) r = await api(`resource=apply&planId=${planId}&action=run`, 'POST');
  const back = (await api(`resource=issues&planId=${planId}&key=${KEY}`)).issue; console.log('restored', back._original.startDate, back._original.dueDate, '| done', r.done);
} finally { console.log('delete', (await api(`resource=plans&id=${planId}`, 'DELETE')).status); }
