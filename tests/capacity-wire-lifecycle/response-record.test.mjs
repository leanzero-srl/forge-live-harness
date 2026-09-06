import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { serializeForgeResponse, ForgeResponseRecordError, FORGE_RESPONSE_ENCODING } from '../../scenarios/lz-ppm/forge-response-record.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const token = 'LOCAL-RETURNED-CREDENTIAL';
const original = () => ({ data: { invokeExtension: { success: true, contextToken: token,
  response: { body: { success: true, job: { id: 'fixture', checkpoint: 156, state: 'active' }, report: null } }, errors: [] } } });
const refused = (raw, options, reason) => {
  let caught;
  assert.throws(() => serializeForgeResponse(raw, options), error => {
    caught = error; return error instanceof ForgeResponseRecordError && error.receipt.refusal === reason;
  });
  assert.deepEqual(caught.receipt, { rawEncoding: FORGE_RESPONSE_ENCODING, responseSha256: hash(raw), responseBytes: Buffer.byteLength(raw), refusal: reason });
  const retained = JSON.stringify(caught);
  for (const value of [token, 'REQUEST-CREDENTIAL', 'COOKIE-CREDENTIAL', 'AUTH-CREDENTIAL']) assert.ok(!retained.includes(value));
  assert.ok(!Object.hasOwn(caught.receipt, 'raw')); assert.ok(!Object.hasOwn(caught.receipt, 'data'));
};

test('stores sanitized JSON with separate exact original and retained hashes/bytes; full business body and errors unchanged', () => {
  const data = original(), raw = JSON.stringify(data, null, 2), before = structuredClone(data);
  const result = serializeForgeResponse(raw);
  assert.equal(result.rawEncoding, FORGE_RESPONSE_ENCODING);
  assert.equal(result.responseBytes, Buffer.byteLength(raw)); assert.equal(result.responseSha256, hash(raw));
  assert.equal(result.retainedResponseBytes, Buffer.byteLength(result.raw)); assert.equal(result.retainedResponseSha256, hash(result.raw));
  assert.notEqual(result.responseSha256, result.retainedResponseSha256);
  assert.deepEqual(result.data.data.invokeExtension.response, before.data.invokeExtension.response);
  assert.deepEqual(result.data.data.invokeExtension.errors, before.data.invokeExtension.errors);
  delete before.data.invokeExtension.contextToken;
  assert.deepEqual(JSON.parse(result.raw), before); assert.deepEqual(result.data, before);
  assert.ok(!JSON.stringify(result).includes(token));
});

test('outer refusal and app refusal retain exact safe error evidence without implying success', () => {
  for (const data of [{ data: { invokeExtension: { success: false, contextToken: token, errors: [{ message: 'FCT_VALIDATION_TOKEN_EXPIRED', errorType: 'AUTH' }] } } },
    { data: { invokeExtension: { success: true, response: { body: { success: false, error: 'Reload before continuing.' } } } } },
    { errors: [{ message: 'Request failed' }] }]) {
    const before = structuredClone(data); if (before.data?.invokeExtension) delete before.data.invokeExtension.contextToken;
    assert.deepEqual(serializeForgeResponse(JSON.stringify(data)).data, before);
  }
});

test('malformed JSON records only original digest/bytes and refuses without raw echo', () => {
  for (const raw of [`<html>${token}</html>`, `{"contextToken":"${token}"`, 'null', '[]'])
    refused(raw, {}, raw === 'null' || raw === '[]' ? 'envelope-shape' : 'malformed-json');
});

test('known response/request token echoes in business data/errors/keys fail rather than changing the business result', () => {
  for (const place of ['body', 'error', 'key', 'escaped']) {
    const data = original();
    if (place === 'body') data.data.invokeExtension.response.body.note = token;
    if (place === 'error') data.data.invokeExtension.errors = [{ message: `Server echoed REQUEST-CREDENTIAL` }];
    if (place === 'key') data.data.invokeExtension.response.body[`echo-${token}`] = true;
    let raw = JSON.stringify(data);
    if (place === 'escaped') { data.data.invokeExtension.errors = [{ message: token }]; raw = JSON.stringify(data).replaceAll('LOCAL', '\\u004cOCAL'); }
    refused(raw, { requestToken: 'REQUEST-CREDENTIAL' }, 'credential-echo');
  }
});

test('credential headers, individual cookies and unknown credential locations never reach retained content', () => {
  for (const [value, options] of [['AUTH-CREDENTIAL', { requestHeaders: { Authorization: 'Bearer AUTH-CREDENTIAL' } }],
    ['COOKIE-CREDENTIAL', { requestHeaders: { Cookie: 'session=COOKIE-CREDENTIAL; b=SECOND-COOKIE' } }]]) {
    const data = original(); data.data.invokeExtension.errors = [{ message: value }];
    refused(JSON.stringify(data), options, 'credential-echo');
  }
  for (const key of ['contextToken', 'Authorization', 'Set-Cookie', 'access_token', 'refresh_token', 'x-api-key']) {
    const data = original(); data.data.invokeExtension.response.body[key] = 'other-private-value';
    refused(JSON.stringify(data), {}, 'credential-location');
  }
});

test('actual returned {jwt,expiresAt} transport object is removed; its echoed jwt still refuses', () => {
  const data = original();
  data.data.invokeExtension.contextToken = { jwt: token, expiresAt: '2026-09-06T13:20:35.000Z' };
  const before = structuredClone(data); delete before.data.invokeExtension.contextToken;
  assert.deepEqual(serializeForgeResponse(JSON.stringify(data)).data, before);
  data.data.invokeExtension.response.body.note = token;
  refused(JSON.stringify(data), {}, 'credential-echo');
  delete data.data.invokeExtension.response.body.note;
  data.data.invokeExtension.contextToken.extra = 'not-approved';
  refused(JSON.stringify(data), {}, 'context-token-shape');
});

test('trivial preference cookies do not censor ordinary issue fields; session and full-header echoes refuse', () => {
  const data = original(), options = { requestHeaders: { Cookie: 'feature=1; preference=true; session=long-secret-session-value' } };
  data.data.invokeExtension.response.body.rows = [{ key: 'LZPP-1', date: '2052-03-14', text: 'true', duration: 1 }];
  assert.deepEqual(serializeForgeResponse(JSON.stringify(data), options).data.data.invokeExtension.response.body, data.data.invokeExtension.response.body);
  for (const value of ['long-secret-session-value', options.requestHeaders.Cookie]) {
    data.data.invokeExtension.response.body.note = value;
    refused(JSON.stringify(data), options, 'credential-echo');
  }
});

test('unknown JWT-shaped echo and malformed transport token refuse, while body numeric/null/arrays retain exact values', () => {
  const data = original(); data.data.invokeExtension.response.body.note = 'eyJhbGciOiJub25lIn0.eyJleHAiOjEyM30.c2ln';
  refused(JSON.stringify(data), {}, 'credential-echo');
  data.data.invokeExtension.contextToken = { value: token };
  refused(JSON.stringify(data), {}, 'context-token-shape');
  const valid = original(); valid.data.invokeExtension.contextToken = null;
  valid.data.invokeExtension.response.body.rows = [null, false, 0, 1, { summary: 'ordinary Unicode π', values: ['a', 'b'] }];
  assert.deepEqual(serializeForgeResponse(JSON.stringify(valid)).data.data.invokeExtension.response.body, valid.data.invokeExtension.response.body);
});
