/**
 * Balance calculation service.
 *
 * Balance formula (PRD Section 6.6):
 * balance = amount paid − amount owed from expense splits + payments made − payments received
 *
 * - Positive balance: member is owed money (creditor).
 * - Negative balance: member owes money (debtor).
 * - Zero balance: settled.
 * - Invariant: Sum of all group balances strictly equals zero.
 * - Result ordered strictly by member ID ascending.
 *
 * @param {object} params
 * @param {Array<{id: number, name: string}>} params.members - All members of the group.
 * @param {Array<{paidBy: number, amount: number, splits: object}>} [params.expenses=[]] - Group expenses.
 * @param {Array<{from?: number, from_member?: number, to?: number, to_member?: number, amount: number}>} [params.payments=[]] - Group payments.
 * @returns {{ balances: Array<{memberId: number, name: string, balance: number}> }}
 */
function calculateBalances({ members, expenses = [], payments = [] }) {
  if (!Array.isArray(members)) {
    throw new Error("members must be an array");
  }

  // Initialize balance map with BigInt for all members (default 0)
  const balanceMap = new Map();
  for (const member of members) {
    const id = Number(member.id);
    balanceMap.set(id, {
      memberId: id,
      name: member.name,
      balance: 0n,
    });
  }

  // 1. Process expenses
  for (const expense of expenses) {
    const payerId = Number(expense.paidBy !== undefined ? expense.paidBy : expense.paid_by);
    const amount = BigInt(expense.amount);

    // Payer paid total expense amount: credits payer
    if (balanceMap.has(payerId)) {
      balanceMap.get(payerId).balance += amount;
    }

    // Participants owe their allocated split shares: debits each participant
    const splits = typeof expense.splits === "string" ? JSON.parse(expense.splits) : expense.splits;
    if (splits && typeof splits === "object") {
      for (const [memberIdStr, splitPaise] of Object.entries(splits)) {
        const participantId = Number(memberIdStr);
        if (balanceMap.has(participantId)) {
          balanceMap.get(participantId).balance -= BigInt(splitPaise);
        }
      }
    }
  }

  // 2. Process payments
  for (const payment of payments) {
    const fromId = Number(payment.from !== undefined ? payment.from : payment.from_member);
    const toId = Number(payment.to !== undefined ? payment.to : payment.to_member);
    const amount = BigInt(payment.amount);

    // from paid money: debt reduced (credit balance)
    if (balanceMap.has(fromId)) {
      balanceMap.get(fromId).balance += amount;
    }

    // to received money: credit reduced (debit balance)
    if (balanceMap.has(toId)) {
      balanceMap.get(toId).balance -= amount;
    }
  }

  // 3. Verify balance conservation invariant: sum(balances) === 0
  let totalSum = 0n;
  for (const entry of balanceMap.values()) {
    totalSum += entry.balance;
  }

  if (totalSum !== 0n) {
    throw new Error(`Balance conservation invariant violated: sum of balances is ${totalSum} paise (must be 0)`);
  }

  // 4. Return array ordered by memberId ascending
  const balances = Array.from(balanceMap.values())
    .sort((a, b) => a.memberId - b.memberId)
    .map((entry) => ({
      memberId: entry.memberId,
      name: entry.name,
      balance: Number(entry.balance),
    }));

  return { balances };
}

module.exports = {
  calculateBalances,
};
