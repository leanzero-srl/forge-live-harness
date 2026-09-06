import { isDeepStrictEqual } from 'node:util';

export const CAPACITY_WIRE_MARGIN_MS = 120000;
const fail = (code) => { throw new Error(`CAPACITY_WIRE_${code}`); };
const requireValue = (condition, code) => { if (!condition) fail(code); };
const finiteTime = value => Number.isSafeInteger(value) && value >= 0;
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

/** Claims are an untrusted scheduling hint, never authentication or token renewal. */
function lifetime(wire, tokenOf, now) {
  let token, claims;
  try {
    token = tokenOf(wire);
    requireValue(typeof token === 'string' && token.length <= 32768, 'TOKEN_INVALID');
    const parts = token.split('.');
    requireValue(parts.length === 3 && parts.every(part => /^[A-Za-z0-9_-]+$/.test(part)), 'TOKEN_INVALID');
    const bytes = Buffer.from(parts[1], 'base64url');
    requireValue(bytes.toString('base64url') === parts[1], 'TOKEN_INVALID');
    claims = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { fail('TOKEN_INVALID'); }
  requireValue(claims && finiteTime(claims.iat) && finiteTime(claims.exp)
    && claims.exp > claims.iat && Number.isSafeInteger(claims.exp * 1000)
    && claims.iat * 1000 <= now + 30000, 'TOKEN_TIME_INVALID');
  return { issuedAtMs: claims.iat * 1000, expiresAtMs: claims.exp * 1000 };
}

/** Invoke at actual route.continue / POST time, after any budget queue. */
export function assertCapacityWireFresh(wire, { tokenOf, now = Date.now(), marginMs = CAPACITY_WIRE_MARGIN_MS }) {
  requireValue(finiteTime(now) && finiteTime(marginMs) && marginMs >= CAPACITY_WIRE_MARGIN_MS, 'CLOCK_OR_MARGIN_INVALID');
  const times = lifetime(wire, tokenOf, now);
  requireValue(times.expiresAtMs - now >= marginMs, 'STALE_UNSENT');
  return Object.freeze({ ...times, checkedAtMs: now, remainingMs: times.expiresAtMs - now });
}

/**
 * acquire performs ONE genuine Capacity UI navigation/read in the same browser.
 * It must observe request dispatch and terminal response through the existing
 * budget, and obtain the current principal from same-context page.request
 * /myself (never the separate API-token REST client).
 * No response contextToken is used. No request credential is ever synthesized.
 */
export function createCapacityWireLifecycle({ acquire, expected, identityOf, tokenOf, now = Date.now,
  marginMs = CAPACITY_WIRE_MARGIN_MS, maxUnsentRequeues = 2, onEvent = (_event) => {} }) {
  requireValue(typeof acquire === 'function' && typeof identityOf === 'function' && typeof tokenOf === 'function', 'OPTIONS_INVALID');
  requireValue(expected && typeof expected.accountId === 'string' && expected.accountId.length > 0
    && expected.identity && expected.preferences && typeof expected.endpoint === 'string', 'EXPECTED_INVALID');
  let endpoint;
  try { endpoint = new URL(expected.endpoint); } catch { fail('EXPECTED_ENDPOINT_INVALID'); }
  requireValue(endpoint.protocol === 'https:' && !endpoint.username && !endpoint.password && !endpoint.hash, 'EXPECTED_ENDPOINT_INVALID');
  requireValue(finiteTime(marginMs) && marginMs >= CAPACITY_WIRE_MARGIN_MS
    && Number.isSafeInteger(maxUnsentRequeues) && maxUnsentRequeues >= 0 && maxUnsentRequeues <= 2, 'OPTIONS_INVALID');
  const binding = freeze(structuredClone(expected));
  let accepted = null, generation = 0, refreshing = null, active = 0, exclusive = false, closed = false, lastTime = -1;
  function time() {
    const value = now();
    if (closed || !finiteTime(value) || value < lastTime) { closed = true; fail('CLOCK_INVALID'); }
    lastTime = value; return value;
  }
  function check(wire) { return assertCapacityWireFresh(wire, { tokenOf, now: time(), marginMs }); }
  function isFresh() {
    if (!accepted) return false;
    const at = time();
    return accepted.receipt.expiresAtMs - at >= marginMs;
  }
  async function fresh(force = false) {
    time();
    if (refreshing) return refreshing;
    if (!force && isFresh()) return accepted.receipt;
    requireValue(active === 0, 'REFRESH_DURING_DISPATCH');
    const startedAtMs = time();
    refreshing = Promise.resolve().then(async () => {
      const candidate = await acquire();
      const at = time();
      // Use fixed errors: comparison failures must never print credentials.
      requireValue(candidate && candidate.wire && candidate.httpStatus === 200 && candidate.outerSuccess === true
        && (candidate.errors == null || (Array.isArray(candidate.errors) && candidate.errors.length === 0)), 'RESPONSE_REJECTED');
      requireValue(candidate.accountId === binding.accountId, 'PRINCIPAL_MISMATCH');
      requireValue(isDeepStrictEqual(candidate.body, binding.preferences), 'PREFERENCES_MISMATCH');
      requireValue(candidate.wire.url === binding.endpoint, 'ENDPOINT_MISMATCH');
      let identity;
      try { identity = identityOf(candidate.wire); } catch { fail('IDENTITY_INVALID'); }
      requireValue(isDeepStrictEqual(identity, binding.identity), 'IDENTITY_MISMATCH');
      requireValue(candidate.wire.data?.variables?.input?.payload?.call?.functionKey === 'getCapacitySettings', 'CALL_MISMATCH');
      requireValue(candidate.wire.headers && typeof candidate.wire.headers === 'object'
        && Object.getPrototypeOf(candidate.wire.headers) === Object.prototype
        && Object.values(candidate.wire.headers).every(value => typeof value === 'string'), 'HEADERS_INVALID');
      const { requestedAtMs, dispatchedAtMs, completedAtMs } = candidate;
      requireValue([requestedAtMs, dispatchedAtMs, completedAtMs].every(finiteTime)
        && startedAtMs <= requestedAtMs && requestedAtMs <= dispatchedAtMs && dispatchedAtMs <= completedAtMs
        && completedAtMs <= at, 'OBSERVATION_TIME_INVALID');
      let wire;
      try { wire = freeze(structuredClone(candidate.wire)); } catch { fail('WIRE_INVALID'); }
      const tokenTimes = check(wire);
      // Also prove the captured UI request itself had the dispatch margin.
      assertCapacityWireFresh(wire, { tokenOf, now: dispatchedAtMs, marginMs });
      const receipt = Object.freeze({ generation: ++generation, requestedAtMs, dispatchedAtMs, completedAtMs,
        ...tokenTimes });
      await onEvent({ stage: 'wire-promoted', ...receipt });
      check(wire);
      accepted = { wire, receipt };
      return receipt;
    });
    try { return await refreshing; } finally { refreshing = null; }
  }
  async function ensureFresh({ force = false } = {}) {
    requireValue(!exclusive, 'EXPORT_ACTIVE');
    return fresh(force);
  }
  async function run({ budget, label, cost, dispatch }) {
    requireValue(budget && typeof budget.run === 'function' && typeof dispatch === 'function', 'DISPATCH_OPTIONS_INVALID');
    for (let attempt = 0; attempt <= maxUnsentRequeues; attempt++) {
      await ensureFresh();
      const unsent = Symbol('local-not-dispatched');
      const result = await budget.run(label, cost, async () => {
        requireValue(!exclusive, 'EXPORT_ACTIVE');
        // The whole latest accepted generation is selected only AFTER queuing.
        if (refreshing || !isFresh()) return unsent;
        const current = accepted;
        const receipt = Object.freeze({ ...current.receipt, ...check(current.wire) });
        requireValue(active === 0, 'DISPATCH_ACTIVE');
        active++;
        try { return await dispatch(current.wire, receipt); } finally { active--; }
      });
      if (result !== unsent) return result; // Actual throws/refusals are NEVER retried.
      await onEvent({ stage: 'wire-unsent-after-queue', label, reservedUnits: cost, attempt: attempt + 1, atMs: time() });
      // The unchanged ledger retains the conservative charge for the unsent call.
    }
    fail('QUEUE_AGED_REPEATEDLY');
  }
  async function withExport(operation, { maxMs = 600000 } = {}) {
    requireValue(typeof operation === 'function' && !exclusive && active === 0 && !refreshing, 'EXPORT_BUSY');
    requireValue(finiteTime(maxMs) && maxMs > 0 && maxMs <= 600000, 'EXPORT_BOUND_INVALID');
    exclusive = true;
    try {
      await fresh(true);
      const receipt = Object.freeze({ ...accepted.receipt,
        ...assertCapacityWireFresh(accepted.wire, { tokenOf, now: time(), marginMs: maxMs + marginMs }) });
      const started = time();
      const result = await operation(receipt);
      requireValue(time() - started <= maxMs, 'EXPORT_BOUND_EXCEEDED');
      return result;
    } finally { exclusive = false; }
  }
  return Object.freeze({ ensureFresh, run, withExport });
}
