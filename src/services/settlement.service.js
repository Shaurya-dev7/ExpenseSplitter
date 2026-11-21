/**
 * Settlement service using greedy debt simplification (PRD Section 6.8).
 *
 * Algorithm:
 * 1. Filter out members with zero balance.
 * 2. Separate into debtors (balance < 0) and creditors (balance > 0).
 * 3. In a loop, match the biggest debtor with the biggest creditor.
 * 4. Transfer the smaller of the debtor's debt and creditor's credit.
 * 5. Break ties by choosing the lowest member ID.
 * 6. Repeat until all balances are zero.
 *
 * Required properties guaranteed:
 * 1. Applying every suggested transfer makes every balance exactly zero.
 * 2. Every transfer amount is a positive integer in paise.
 * 3. No member both pays and receives in the same settlement result.
 * 4. Transfer count is at most k - 1 (where k is number of non-zero members).
 * 5. If group is already settled, returns { transfers: [] }.
 *
 * @param {Array<{memberId: number, balance: number}>|{balances: Array<{memberId: number, balance: number}>}} input
 * @returns {{ transfers: Array<{from: number, to: number, amount: number}> }}
 */
function calculateSettlements(input) {
  const balanceList = Array.isArray(input) ? input : input && input.balances ? input.balances : [];

  const debtors = [];
  const creditors = [];

  for (const b of balanceList) {
    const memberId = Number(b.memberId);
    const balance = BigInt(b.balance);

    if (balance < 0n) {
      debtors.push({
        memberId,
        amount: -balance, // positive magnitude of debt
      });
    } else if (balance > 0n) {
      creditors.push({
        memberId,
        amount: balance, // positive magnitude of credit
      });
    }
  }

  const transfers = [];

  // Deterministic comparator:
  // 1. Largest amount descending
  // 2. Lowest memberId ascending (tie-breaker)
  const compareNodes = (a, b) => {
    if (b.amount !== a.amount) {
      return b.amount > a.amount ? 1 : -1;
    }
    return a.memberId - b.memberId;
  };

  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort(compareNodes);
    creditors.sort(compareNodes);

    const maxDebtor = debtors[0];
    const maxCreditor = creditors[0];

    const transferAmt =
      maxDebtor.amount < maxCreditor.amount
        ? maxDebtor.amount
        : maxCreditor.amount;

    transfers.push({
      from: maxDebtor.memberId,
      to: maxCreditor.memberId,
      amount: Number(transferAmt),
    });

    maxDebtor.amount -= transferAmt;
    maxCreditor.amount -= transferAmt;

    if (maxDebtor.amount === 0n) {
      debtors.shift();
    }
    if (maxCreditor.amount === 0n) {
      creditors.shift();
    }
  }

  return { transfers };
}

module.exports = {
  calculateSettlements,
};
