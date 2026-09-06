import test from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURES, expectedAfterEdit, expectedForFixture } from './lz-ppm-cascade';

test('typed oracle preserves known chain dates and exact source input', () => {
  const fixture = FIXTURES.find(f => f.name === 'simple chain A->B, push A due');
  const original = structuredClone(fixture);
  const result = expectedForFixture(fixture);
  assert.deepEqual(result.A, { startDate: '2026-06-01', dueDate: '2026-06-10', duration: 8, buffer: 'No' });
  assert.deepEqual(result.B, { startDate: '2026-06-11', dueDate: '2026-06-12', duration: 2, buffer: 'No' });
  assert.deepEqual(fixture, original);
});

test('missing fixture or edit key cannot produce a false empty expected schedule', () => {
  assert.throws(() => expectedForFixture(undefined), /fixture is unavailable/);
  assert.throws(() => expectedAfterEdit([], 'MISSING', { duration: 0 }), /edit issue "MISSING" is not in the fixture/);
});
