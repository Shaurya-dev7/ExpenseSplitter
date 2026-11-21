const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateSettlements } = require("../src/services/settlement.service");

// ===================================================================
// Settlement Tests (PRD Section 6.8 & 13.3)
// ===================================================================

test("settlement: already settled group returns empty transfers list", () => {
  const balances = [
    { memberId: 1, name: "Asha", balance: 0 },
    { memberId: 2, name: "Ben", balance: 0 },
  ];

  const result = calculateSettlements(balances);
  assert.deepEqual(result, { transfers: [] });
});

test("settlement: two members settle with a single direct transfer", () => {
  // Asha is owed 35000 paise (Rs 350), Ben owes 35000 paise
  const balances = [
    { memberId: 1, name: "Asha", balance: 35000 },
    { memberId: 2, name: "Ben", balance: -35000 },
  ];

  const result = calculateSettlements(balances);
  assert.deepEqual(result, {
    transfers: [{ from: 2, to: 1, amount: 35000 }],
  });
});

test("settlement: greedy matching pairs biggest debtor with biggest creditor", () => {
  // Debtor 2: -5000
  // Debtor 3: -3000
  // Creditor 1: +8000
  // Biggest debtor (2, 5000) matches with biggest creditor (1, 8000) -> 2 pays 1 5000
  // Next debtor (3, 3000) matches with remaining creditor (1, 3000) -> 3 pays 1 3000
  const balances = [
    { memberId: 1, balance: 8000 },
    { memberId: 2, balance: -5000 },
    { memberId: 3, balance: -3000 },
  ];

  const result = calculateSettlements(balances);
  assert.deepEqual(result.transfers, [
    { from: 2, to: 1, amount: 5000 },
    { from: 3, to: 1, amount: 3000 },
  ]);
});

test("settlement: breaks ties deterministically by lowest member ID", () => {
  // Creditor 1: +5000
  // Debtor 2: -2500
  // Debtor 3: -2500
  // Debtor 2 and 3 tie in magnitude. Lowest ID (2) is processed first.
  const balances = [
    { memberId: 1, balance: 5000 },
    { memberId: 2, balance: -2500 },
    { memberId: 3, balance: -2500 },
  ];

  const result = calculateSettlements(balances);
  assert.deepEqual(result.transfers, [
    { from: 2, to: 1, amount: 2500 },
    { from: 3, to: 1, amount: 2500 },
  ]);
});

test("settlement: guarantees all required properties on complex multi-party group", () => {
  // 5 members:
  // 1: +7000
  // 2: +3000
  // 3: -4000
  // 4: -4000
  // 5: -2000
  // Sum = 0
  const balances = [
    { memberId: 1, balance: 7000 },
    { memberId: 2, balance: 3000 },
    { memberId: 3, balance: -4000 },
    { memberId: 4, balance: -4000 },
    { memberId: 5, balance: -2000 },
  ];

  const { transfers } = calculateSettlements(balances);

  // Property 1: Every transfer amount is positive integer paise
  for (const t of transfers) {
    assert.ok(Number.isSafeInteger(t.amount) && t.amount > 0);
  }

  // Property 2: Applying every suggested transfer makes all balances exactly zero
  const net = new Map(balances.map((b) => [b.memberId, BigInt(b.balance)]));
  for (const t of transfers) {
    net.set(t.from, net.get(t.from) + BigInt(t.amount));
    net.set(t.to, net.get(t.to) - BigInt(t.amount));
  }
  for (const [id, val] of net.entries()) {
    assert.equal(val, 0n, `Member ${id} should be settled to 0`);
  }

  // Property 3: No member both pays and receives
  const payers = new Set(transfers.map((t) => t.from));
  const receivers = new Set(transfers.map((t) => t.to));
  for (const p of payers) {
    assert.ok(!receivers.has(p), `Member ${p} must not both pay and receive`);
  }

  // Property 4: Number of transfers is at most k - 1
  const k = balances.filter((b) => b.balance !== 0).length; // 5
  assert.ok(transfers.length <= k - 1, `Transfer count ${transfers.length} must be <= ${k - 1}`);
});
