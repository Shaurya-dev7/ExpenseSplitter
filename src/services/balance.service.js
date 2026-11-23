import { invalid } from '../utils/errors.js';
export function calculateBalances(members, expenses, payments) {
  const balances = new Map(members.map(m => [m.id, { memberId: m.id, name: m.name, balance: 0n }]));
  for (const expense of expenses) {
    balances.get(expense.paidBy).balance += BigInt(expense.amount);
    for (const [id, amount] of Object.entries(expense.splits)) balances.get(Number(id)).balance -= BigInt(amount);
  }
  for (const payment of payments) {
    balances.get(payment.from).balance += BigInt(payment.amount);
    balances.get(payment.to).balance -= BigInt(payment.amount);
  }
  const exact = [...balances.values()].sort((a, b) => a.memberId - b.memberId);
  if (exact.reduce((s, b) => s + b.balance, 0n) !== 0n) throw new Error('Balance invariant violated');
  const limit = BigInt(Number.MAX_SAFE_INTEGER);
  if (exact.some(b => b.balance > limit || b.balance < -limit)) invalid('amount', 'This entry would exceed the safe group balance limit.');
  return exact.map(b => ({ ...b, balance: Number(b.balance) }));
}
