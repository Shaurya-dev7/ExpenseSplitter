import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSplit as split } from '../src/services/split.service.js';
import { parseRupees } from '../src/utils/money.js';
const members = [1, 2, 3];
test('equal default, remainder tie ordered by lowest ID', () => {
  assert.deepEqual(split(9000, { type: 'equal' }, members), { 1: 3000, 2: 3000, 3: 3000 });
  assert.deepEqual(split(100, { type: 'equal', participants: [3, 2, 1] }, members), { 1: 34, 2: 33, 3: 33 });
});
test('shares: largest remainders then lowest ID', () => {
  assert.deepEqual(split(101, { type: 'shares', shares: { 1: 2, 2: 1, 3: 1 } }, members), { 1: 51, 2: 25, 3: 25 });
  assert.deepEqual(split(2, { type: 'shares', shares: { 1: 1, 2: 2, 3: 3 } }, members), { 1: 0, 2: 1, 3: 1 });
});
test('exact with zero is preserved', () => assert.deepEqual(split(100, { type: 'exact', amounts: { 1: 0, 2: 100 } }, members), { 1: 0, 2: 100 }));
test('reject invalid participants, weights, exact totals, types, amount', () => {
  for (const s of [{ type: 'equal', participants: [] }, { type: 'equal', participants: [1, 1] }, { type: 'equal', participants: [99] }, { type: 'shares', shares: { 1: 0 } }, { type: 'shares', shares: { 1: 1001 } }, { type: 'shares', shares: { 1: 1.5 } }, { type: 'exact', amounts: { 1: 99 } }, { type: 'exact', amounts: { 1: -1, 2: 101 } }, { type: 'x' }]) assert.throws(() => split(100, s, members));
  for (const amount of [0, -1, 1.5, 1000000001]) assert.throws(() => split(amount, { type: 'equal' }, members));
});
test('safe rupee string conversion rejects fractional paise', () => {
  assert.equal(parseRupees('1234.56'), 123456); assert.equal(parseRupees('0.1'), 10);
  for (const value of ['1.001', '-2', '1e3', 'NaN', '']) assert.throws(() => parseRupees(value));
});
test('deterministic sum invariant over thousands of amounts', () => {
  for (let amount = 1; amount < 2000; amount++) {
    const result = split(amount, { type: 'shares', shares: { 1: 7, 2: 11, 3: 13 } }, members);
    assert.equal(Object.values(result).reduce((a, b) => a + b, 0), amount);
    assert.ok(Object.values(result).every(Number.isInteger));
  }
});
