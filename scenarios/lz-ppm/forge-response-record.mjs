import { createHash } from 'node:crypto';

export const FORGE_RESPONSE_ENCODING = 'forge-response-context-token-redacted-v1';
const hash = text => createHash('sha256').update(text).digest('hex');
const bytes = text => Buffer.byteLength(text, 'utf8');
const credentialKeys = new Set(['contexttoken', 'authorization', 'proxyauthorization', 'cookie', 'setcookie', 'xapikey', 'accesstoken', 'refreshtoken', 'idtoken']);
const keyName = key => key.toLowerCase().replace(/[-_]/g, '');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export class ForgeResponseRecordError extends Error {
  constructor(reason, receipt) {
    super(`FORGE_RESPONSE_RECORD_${reason.toUpperCase().replaceAll('-', '_')}`);
    this.name = 'ForgeResponseRecordError';
    this.receipt = Object.freeze({ ...receipt, refusal: reason });
  }
}

/**
 * The original response exists only in memory. Stored raw is explicitly encoded
 * sanitized JSON, with separate original and retained digests. Business content
 * is never rewritten: a credential echo outside the known transport field fails.
 * @param {string} raw
 * @param {{requestToken?:string,requestHeaders?:Record<string,string>}} options
 */
export function serializeForgeResponse(raw, { requestToken, requestHeaders = {} } = {}) {
  if (typeof raw !== 'string') throw new ForgeResponseRecordError('input-type', {});
  const receipt = { rawEncoding: FORGE_RESPONSE_ENCODING, responseSha256: hash(raw), responseBytes: bytes(raw) };
  const refuse = reason => { throw new ForgeResponseRecordError(reason, receipt); };
  if (!raw.length || receipt.responseBytes > 8388608) refuse('response-size');
  let data;
  try { data = JSON.parse(raw); } catch { refuse('malformed-json'); }
  if (!object(data)) refuse('envelope-shape');
  const secrets = new Set();
  function secret(value) { if (typeof value === 'string' && value.length) secrets.add(value); }
  secret(requestToken);
  if (!object(requestHeaders)) refuse('headers-shape');
  for (const [key, value] of Object.entries(requestHeaders)) {
    if (!credentialKeys.has(keyName(key))) continue;
    if (typeof value !== 'string') refuse('headers-shape');
    secret(value);
    if (/^(?:proxy-)?authorization$/i.test(key)) secret(value.replace(/^(?:Bearer|Basic)\s+/i, ''));
    if (key.toLowerCase() === 'cookie') for (const entry of value.split(';')) {
      const separator = entry.indexOf('=');
      const name = separator >= 0 ? entry.slice(0, separator).trim() : '';
      // Preference/analytics cookies may be "1" or an ordinary user ID. The
      // complete Cookie header remains protected; individual auth values are
      // selected by credential purpose rather than every incidental substring.
      if (separator >= 0 && /session|token|auth|jwt|(?:^|[._-])sid(?:$|[._-])/i.test(name)) secret(entry.slice(separator + 1).trim());
    }
  }
  const extension = data.data?.invokeExtension;
  if (object(extension) && Object.hasOwn(extension, 'contextToken')) {
    const context = extension.contextToken;
    if (object(context)) {
      if (Object.keys(context).sort().join(',') !== 'expiresAt,jwt' || typeof context.jwt !== 'string'
        || !context.jwt.length || typeof context.expiresAt !== 'string') refuse('context-token-shape');
      secret(context.jwt);
    } else {
      if (typeof context !== 'string' && context !== null) refuse('context-token-shape');
      secret(context);
    }
    delete extension.contextToken;
  }
  // Inspect values, not just encoded raw text: JSON escaping cannot hide an echo.
  const pending = [data];
  while (pending.length) {
    const value = pending.pop();
    if (typeof value === 'string') {
      for (const known of secrets) if (value.includes(known)) refuse('credential-echo');
      // Unknown JWT-shaped content is also withheld rather than silently edited.
      if (/(?:^|[^A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:$|[^A-Za-z0-9_-])/.test(value)) refuse('credential-echo');
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (credentialKeys.has(keyName(key))) refuse('credential-location');
        for (const known of secrets) if (key.includes(known)) refuse('credential-echo');
        pending.push(child);
      }
    }
  }
  let retained;
  try { retained = JSON.stringify(data); } catch { refuse('retained-encoding'); }
  return { ...receipt, raw: retained, retainedResponseSha256: hash(retained), retainedResponseBytes: bytes(retained), data };
}
