const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateBalances } = require("../src/services/balance.service");

const MEMBERS = [
  { id: 1, name: "Asha" },
  { id: 2, name: "Ben" },
  { id: 3, name: "Charlie" },
];

test("balance: single expense paid by one member and split equally", () => {
  // Asha paid 9000 paise (Rs 90), split equally 3000 each
  // Asha net: +9000 - 3000 = +6000 (owed 6000)
  // Ben net: -3000 (owes 3000)
  // Charlie net: -3000 (owes 3000)
  const result = calculateBalances({
    members: MEMBERS,
    expenses: [
      {
        paidBy: 1,
        amount: 9000,
        splits: { "1": 3000, "2": 3000, "3": 3000 },
      },
    ],
  });

  assert.deepEqual(result.balances, [
    { memberId: 1, name: "Asha", balance: 6000 },
    { memberId: 2, name: "Ben", balance: -3000 },
    { memberId: 3, name: "Charlie", balance: -3000 },
  ]);

  const sum = result.balances.reduce((acc, b) => acc + b.balance, 0);
  assert.equal(sum, 0);
});

test("balance: expense payer is NOT a participant in the split", () => {
  // Asha (1) paid 4000 for Ben (2) and Charlie (3) equally (2000 each)
  // Asha: +4000
  // Ben: -2000
  // Charlie: -2000
  const result = calculateBalances({
    members: MEMBERS,
    expenses: [
      {
        paidBy: 1,
        amount: 4000,
        splits: { "2": 2000, "3": 2000 },
      },
    ],
  });

  assert.deepEqual(result.balances, [
    { memberId: 1, name: "Asha", balance: 4000 },
    { memberId: 2, name: "Ben", balance: -2000 },
    { memberId: 3, name: "Charlie", balance: -2000 },
  ]);
});

test("balance: multiple expenses and payments update balances correctly", () => {
  // Expense 1: Asha pays 9000, split 3000 each -> Asha: +6000, Ben: -3000, Charlie: -3000
  // Payment: Ben pays Asha 3000 -> Ben: -3000 + 3000 = 0. Asha: +6000 - 3000 = +3000
  const result = calculateBalances({
    members: MEMBERS,
    expenses: [
      {
        paidBy: 1,
        amount: 9000,
        splits: { "1": 3000, "2": 3000, "3": 3000 },
      },
    ],
    payments: [
      { from: 2, to: 1, amount: 3000 },
    ],
  });

  assert.deepEqual(result.balances, [
    { memberId: 1, name: "Asha", balance: 3000 },
    { memberId: 2, name: "Ben", balance: 0 },
    { memberId: 3, name: "Charlie", balance: -3000 },
  ]);
});

test("balance: members with no activity have 0 balance and appear ordered by ID", () => {
  const result = calculateBalances({
    members: [
      { id: 1, name: "Asha" },
      { id: 2, name: "Ben" },
      { id: 3, name: "Charlie" },
      { id: 4, name: "Dave" },
    ],
    expenses: [
      { paidBy: 2, amount: 1000, splits: { "1": 500, "2": 500 } },
    ],
  });

  assert.deepEqual(result.balances, [
    { memberId: 1, name: "Asha", balance: -500 },
    { memberId: 2, name: "Ben", balance: 500 },
    { memberId: 3, name: "Charlie", balance: 0 },
    { memberId: 4, name: "Dave", balance: 0 },
  ]);

  // Strictly ordered by memberId
  assert.equal(result.balances[0].memberId, 1);
  assert.equal(result.balances[1].memberId, 2);
  assert.equal(result.balances[2].memberId, 3);
  assert.equal(result.balances[3].memberId, 4);
});
