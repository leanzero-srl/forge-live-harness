import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapacityWireLifecycle, assertCapacityWireFresh } from '../../scenarios/lz-ppm/capacity-wire-lifecycle.mjs';
import { createRollingReadBudget } from '../../scenarios/lz-ppm/rolling-read-budget.mjs';

const start = 1700000000000;
// Synthetic local token-shaped fixture only. It cannot authenticate anywhere.
const token = (iat, exp) => ['e30', Buffer.from(JSON.stringify({ iat, exp })).toString('base64url'), 'bG9jYWw'].join('.');
const pending = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function fixture(options = {}) {
  const state = { now: start, acquisitions: 0, events: [], ...options.state };
  const expected = { endpoint: 'https://test.invalid/gateway/api/graphql', identity: { app: 'app', env: 'dev', module: 'global' }, accountId: 'fixture-owner', preferences: { success: true, version: 65, settings: { selectedPlanIds: [], profiles: {}, issueChoices: {} } } };
  const identityOf = wire => wire.data.identity;
  const tokenOf = wire => wire.data.variables.input.contextToken;
  const candidate = () => ({ wire: { url: expected.endpoint, headers: { authorization: 'LOCAL-ONLY', 'x-generation': String(state.acquisitions) }, data: { identity: structuredClone(expected.identity), variables: { input: { contextToken: token(Math.floor(state.now / 1000), Math.floor(state.now / 1000) + 900), payload: { call: { functionKey: 'getCapacitySettings', payload: {} } } } } } }, accountId: expected.accountId, httpStatus: 200, outerSuccess: true, errors: [], body: structuredClone(expected.preferences), requestedAtMs: state.now, dispatchedAtMs: state.now, completedAtMs: state.now });
  const lifecycle = createCapacityWireLifecycle({ expected, identityOf, tokenOf, now: () => state.now,
    onEvent: event => state.events.push(event), ...options,
    acquire: async () => { state.acquisitions++; return options.acquire ? options.acquire(candidate, state) : candidate(); } });
  const budget = { run: async (_label, _cost, operation) => operation() };
  return { lifecycle, state, expected, identityOf, tokenOf, candidate, budget,
    run: dispatch => lifecycle.run({ budget, label: 'rpc:advance', cost: 10, dispatch }) };
}

test('only completed exact Capacity observation promotes a single atomic wire generation', async () => {
  let original;
  const f = fixture({ acquire: make => (original = make()) });
  const receipt = await f.lifecycle.ensureFresh();
  assert.equal(receipt.generation, 1);
  original.wire.headers.authorization = 'MUTATED';
  original.wire.data.variables.input.contextToken = 'MUTATED';
  await f.run((wire, actual) => {
    assert.equal(actual.generation, 1); assert.equal(wire.headers.authorization, 'LOCAL-ONLY');
    assert.equal(wire.data.variables.input.contextToken.split('.').length, 3);
    assert.throws(() => { wire.headers.authorization = 'MUTATED'; }, TypeError);
  });
  assert.equal(f.state.acquisitions, 1);
  const events = JSON.stringify(f.state.events);
  for (const secret of ['LOCAL-ONLY', 'contextToken', 'fixture-owner', original.wire.data.variables.input.contextToken]) assert.ok(!events.includes(secret));
});

test('request creation alone cannot promote; concurrent callers share one completed acquisition', async () => {
  const held = pending(); const f = fixture({ acquire: async make => { const value = make(); await held.promise; return value; } });
  let completed = 0;
  const calls = [f.lifecycle.ensureFresh(), f.lifecycle.ensureFresh()].map(p => p.then(v => { completed++; return v; }));
  await Promise.resolve(); assert.equal(f.state.acquisitions, 1); assert.equal(completed, 0); assert.deepEqual(f.state.events, []);
  held.resolve(); const [a, b] = await Promise.all(calls); assert.deepEqual(a, b); assert.equal(completed, 2);
});

test('mismatched principal, endpoint, identity, preferences or unsuccessful response fail closed', async () => {
  const mutations = [c => { c.accountId = 'other'; }, c => { c.wire.url = 'https://other.invalid/graphql'; },
    c => { c.wire.data.identity.env = 'prod'; }, c => { c.wire.data.identity.extra = true; }, c => { c.body.version++; },
    c => { c.httpStatus = 401; }, c => { c.outerSuccess = false; }, c => { c.errors = [{ message: 'LOCAL-ONLY' }]; },
    c => { c.wire.data.variables.input.payload.call.functionKey = 'advanceSponsorReportCapture'; },
    c => { c.requestedAtMs--; }, c => { c.completedAtMs++; }, c => { c.dispatchedAtMs--; },
    c => { c.wire.headers = Promise.resolve({}); }];
  for (const mutate of mutations) {
    const f = fixture({ acquire: make => { const c = make(); mutate(c); return c; } });
    await assert.rejects(f.run(() => assert.fail('not dispatched')), /CAPACITY_WIRE_/);
    assert.equal(f.state.events.length, 0);
  }
});

test('expiry and claim errors never fabricate or adopt a returned replacement token', async () => {
  const bad = ['invalid', 'e30.Zg==.abc', token(1700000000, 1700000119), token(1700000001, 1700000000),
    token(1700000040, 1700000940), token(1700000000, '1700000900'), token(1700000000, Infinity)];
  for (const value of bad) {
    const f = fixture({ acquire: make => { const c = make(); c.wire.data.variables.input.contextToken = value; c.contextToken = token(1700000000, 1700000900); return c; } });
    await assert.rejects(f.lifecycle.ensureFresh(), /CAPACITY_WIRE_(TOKEN|STALE)/);
  }
});

test('queued RPC aging refreshes outside budget and preserves the charged unsent reservation', async () => {
  let first = true, depth = 0, posts = 0; const events = [];
  const f = fixture({ acquire: async (make) => { assert.equal(depth, 0, 'acquisition cannot nest inside reservation'); return make(); } });
  const budget = createRollingReadBudget({ capacity: 10, windowMs: 61000, now: () => f.state.now - start,
    sleep: async ms => { f.state.now += ms; }, onEvent: e => {
      events.push(e);
      if (e.stage === 'budget-start' && first) { first = false; f.state.now += 781000; }
    } });
  const tracked = { run: (label, cost, operation) => budget.run(label, cost, async () => { depth++; try { return await operation(); } finally { depth--; } }) };
  const result = await f.lifecycle.run({ budget: tracked, label: 'rpc:advance', cost: 10, dispatch: (_wire, receipt) => { posts++; assert.equal(receipt.generation, 2); return 'ack'; } });
  assert.equal(result, 'ack'); assert.equal(posts, 1); assert.equal(f.state.acquisitions, 2);
  assert.equal(events.filter(e => e.stage === 'budget-start').length, 2);
  assert.equal(events.filter(e => e.stage === 'budget-return').length, 2);
  assert.ok(events.some(e => e.stage === 'budget-wait' && e.used === 10));
  assert.equal(f.state.events.filter(e => e.stage === 'wire-unsent-after-queue').length, 1);
});

test('actual UI route freshness check rejects a request aged while its own route was queued', () => {
  const f = fixture(); const wire = f.candidate().wire;
  assert.equal(assertCapacityWireFresh(wire, { tokenOf: f.tokenOf, now: start + 780000 }).remainingMs, 120000);
  assert.throws(() => assertCapacityWireFresh(wire, { tokenOf: f.tokenOf, now: start + 780001 }), /STALE_UNSENT/);
});

test('no retry of any actual dispatched rejection, unknown response, or outer token refusal', async () => {
  const error = new Error('unknown transport');
  for (const result of [error, { outerSuccess: false, errors: ['FCT_VALIDATION_TOKEN_EXPIRED'] }, { body: { success: false } }, undefined]) {
    const f = fixture(); let posts = 0;
    const call = f.run(() => { posts++; if (result === error) throw error; return result; });
    if (result === error) await assert.rejects(call, e => e === error); else assert.equal(await call, result);
    assert.equal(posts, 1); assert.equal(f.state.acquisitions, 1);
  }
});

test('repeated local queue aging is bounded with zero dispatches', async () => {
  const f = fixture(); let reservations = 0;
  const budget = { run: async (_l, _c, operation) => { reservations++; f.state.now += 781000; return operation(); } };
  await assert.rejects(f.lifecycle.run({ budget, label: 'advance', cost: 10, dispatch: () => assert.fail('never sent') }), /QUEUE_AGED_REPEATEDLY/);
  assert.equal(reservations, 3); assert.equal(f.state.acquisitions, 3);
});

test('forced refresh rejects a nonextending expired captured token even if the UI response carries a new one', async () => {
  let original;
  const f = fixture({ acquire: make => { const c = make(); original ??= c.wire.data.variables.input.contextToken; c.wire.data.variables.input.contextToken = original; return c; } });
  await f.lifecycle.ensureFresh(); f.state.now += 781000;
  await assert.rejects(f.lifecycle.ensureFresh(), /STALE_UNSENT/);
  assert.equal(f.state.acquisitions, 2);
});

test('export forces genuine acquisition first, forbids refresh/navigation and RPC until settled', async () => {
  const f = fixture(); await f.lifecycle.ensureFresh();
  const held = pending(), entered = pending(); let complete = false;
  const operation = f.lifecycle.withExport(async receipt => { assert.equal(receipt.generation, 2); entered.resolve(); await held.promise; complete = true; return 'HTML'; });
  await entered.promise;
  f.state.now += 500000;
  await assert.rejects(f.lifecycle.ensureFresh(), /EXPORT_ACTIVE/);
  await assert.rejects(f.run(() => assert.fail()), /EXPORT_ACTIVE/);
  assert.equal(f.state.acquisitions, 2); assert.equal(complete, false);
  held.resolve(); assert.equal(await operation, 'HTML');
  f.state.now += 300000;
  await f.run((_wire, receipt) => assert.equal(receipt.generation, 3));
});

test('active dispatch prevents export or stale refresh; failed export releases exclusion without swallowing original error', async () => {
  const f = fixture(), held = pending(), entered = pending();
  const actual = f.run(async () => { entered.resolve(); await held.promise; });
  await entered.promise;
  await assert.rejects(f.lifecycle.withExport(() => assert.fail()), /EXPORT_BUSY/);
  f.state.now += 781000;
  await assert.rejects(f.lifecycle.ensureFresh(), /REFRESH_DURING_DISPATCH/);
  held.resolve(); await actual;
  const error = new Error('export failed');
  await assert.rejects(f.lifecycle.withExport(() => { throw error; }), e => e === error);
  await f.run(() => 'audit');
});

test('final audits acquire fresh wire using the same lifecycle, without resetting budget', async () => {
  const f = fixture(); const labels = [];
  const budget = { run: async (label, _cost, operation) => { labels.push(label); return operation(); } };
  await f.lifecycle.run({ budget, label: 'advance', cost: 10, dispatch: () => 'ack' });
  f.state.now += 800000;
  await f.lifecycle.run({ budget, label: 'final-status', cost: 10, dispatch: (_w, r) => assert.equal(r.generation, 2) });
  await f.lifecycle.run({ budget, label: 'final-prefs', cost: 10, dispatch: (_w, r) => assert.equal(r.generation, 2) });
  assert.deepEqual(labels, ['advance', 'final-status', 'final-prefs']);
});

test('clock regressions and malformed time fail closed before further dispatch', async () => {
  for (const time of [start - 1, NaN, Infinity, -1]) {
    const f = fixture(); await f.lifecycle.ensureFresh(); f.state.now = time;
    await assert.rejects(f.run(() => assert.fail()), /CLOCK_INVALID/);
    f.state.now = start + 1;
    await assert.rejects(f.lifecycle.ensureFresh(), /CLOCK_INVALID/);
  }
});

test('a slow promotion journal cannot make an aged wire eligible for dispatch', async () => {
  const f = fixture({ onEvent: () => { f.state.now += 781000; } });
  await assert.rejects(f.run(() => assert.fail()), /STALE_UNSENT/);
});

test('export requires its full declared duration plus dispatch margin before UI work starts', async () => {
  const f = fixture({ acquire: make => { const c = make(); c.wire.data.variables.input.contextToken = token(1700000000, 1700000600); return c; } });
  await assert.rejects(f.lifecycle.withExport(() => assert.fail('export cannot start with only600s')), /STALE_UNSENT/);
  const g = fixture();
  await assert.rejects(g.lifecycle.withExport(() => { g.state.now += 600001; }), /EXPORT_BOUND_EXCEEDED/);
  await g.run(() => 'final audit still possible after settled export');
});
