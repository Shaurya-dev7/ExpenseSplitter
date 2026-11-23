import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBalances as balances } from '../src/services/balance.service.js';
const members = [{ id: 3, name: 'C' }, { id: 1, name: 'A' }, { id: 2, name: 'B' }];
const e = { paidBy: 1, amount: 900, splits: { 1: 300, 2: 300, 3: 300 } };
test('paid minus owed, ordered by ID, zero sum', () => {
  const result = balances(members, [e], []);
  assert.deepEqual(result.map(b => b.balance), [600, -300, -300]);
  assert.equal(result.reduce((s, b) => s + b.balance, 0), 0);
});
test('payer need not participate', () => assert.deepEqual(balances(members, [{ ...e, splits: { 2: 450, 3: 450 } }], []).map(b => b.balance), [900, -450, -450]));
test('payments settle debt; deletion recomputes', () => {
  assert.deepEqual(balances(members, [e], [{ from: 2, to: 1, amount: 300 }, { from: 3, to: 1, amount: 300 }]).map(b => b.balance), [0, 0, 0]);
  assert.deepEqual(balances(members, [], []).map(b => b.balance), [0, 0, 0]);
});
test('multiple expenses remain balanced', () => {
  const result = balances(members, [e, { paidBy: 2, amount: 101, splits: { 1: 51, 3: 50 } }], [{ from: 3, to: 1, amount: 20 }]);
  assert.deepEqual(result.map(b => b.balance), [529, -199, -330]);
});
test('safe integer limit is checked without losing precision', () => {
  const max = Number.MAX_SAFE_INTEGER;
  assert.deepEqual(balances(members, [], [{ from: 1, to: 2, amount: max }]).map(b => b.balance), [max, -max, 0]);
  assert.throws(() => balances(members, [], [{ from: 1, to: 2, amount: max }, { from: 1, to: 2, amount: 1 }]), error => error.status === 400);
});
