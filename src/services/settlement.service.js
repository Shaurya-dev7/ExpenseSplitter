export function calculateSettlements(balances) {
  const debtors = balances.filter(b => b.balance < 0).map(b => ({ id: b.memberId, amount: -b.balance }));
  const creditors = balances.filter(b => b.balance > 0).map(b => ({ id: b.memberId, amount: b.balance }));
  const sort = (a, b) => b.amount - a.amount || a.id - b.id;
  const transfers = [];
  while (debtors.length && creditors.length) {
    debtors.sort(sort); creditors.sort(sort);
    const debtor = debtors[0], creditor = creditors[0], amount = Math.min(debtor.amount, creditor.amount);
    transfers.push({ from: debtor.id, to: creditor.id, amount });
    debtor.amount -= amount; creditor.amount -= amount;
    if (!debtor.amount) debtors.shift();
    if (!creditor.amount) creditors.shift();
  }
  return transfers;
}
