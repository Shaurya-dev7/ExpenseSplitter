import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSettlements as settle } from '../src/services/settlement.service.js';
function verify(values) {
  const balances = values.map((balance, i) => ({ memberId: i + 1, balance }));
  const transfers = settle(balances); const after = [...values];
  const senders = new Set(), receivers = new Set();
  for (const t of transfers) { assert.ok(Number.isInteger(t.amount) && t.amount > 0); after[t.from - 1] += t.amount; after[t.to - 1] -= t.amount; senders.add(t.from); receivers.add(t.to); }
  assert.ok(after.every(n => n === 0));
  assert.ok([...senders].every(id => !receivers.has(id)));
  assert.ok(transfers.length <= Math.max(0, values.filter(Boolean).length - 1));
  return transfers;
}
test('empty for settled', () => assert.deepEqual(verify([0, 0, 0]), []));
test('largest debtor and creditor; lowest ID tie break', () => {
  assert.deepEqual(verify([500, 500, -500, -500]), [{ from: 3, to: 1, amount: 500 }, { from: 4, to: 2, amount: 500 }]);
  assert.equal(verify([-100, -500, 200, 400])[0].from, 2);
});
test('settlement properties over 1000 deterministic varied groups', () => {
  for (let i = 1; i <= 1000; i++) { const values = Array.from({ length: 19 }, (_, j) => ((i * 7919 + j * 167) % 10001) - 5000); values.push(-values.reduce((a, b) => a + b, 0)); verify(values); }
});
