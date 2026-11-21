const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateSplits, ValidationError } = require("../src/services/split.service");

const MEMBERS_1_TO_3 = [1, 2, 3];
const MEMBERS_1_TO_4 = [1, 2, 3, 4];

// ===================================================================
// Equal Splits (PRD Section 6.4, 6.5, 13.1)
// ===================================================================

test("split.equal: divides with no remainder evenly", () => {
  const result = calculateSplits({
    amount: 9000,
    paidBy: 1,
    split: { type: "equal", participants: [1, 2, 3] },
    memberIds: MEMBERS_1_TO_3,
  });

  assert.deepEqual(result, {
    "1": 3000,
    "2": 3000,
    "3": 3000,
  });
  assert.equal(result["1"] + result["2"] + result["3"], 9000);
});

test("split.equal: divides with leftover paise deterministically by lowest ID", () => {
  // 100 paise split 3 ways:
  // Base share: floor(100 / 3) = 33
  // Remainder: 100 % 3 = 1
  // Tie-breaker: lowest member ID (1) gets the 1 leftover paise
  const result = calculateSplits({
    amount: 100,
    paidBy: 1,
    split: { type: "equal", participants: [1, 2, 3] },
    memberIds: MEMBERS_1_TO_3,
  });

  assert.deepEqual(result, {
    "1": 34,
    "2": 33,
    "3": 33,
  });
  assert.equal(result["1"] + result["2"] + result["3"], 100);
});

test("split.equal: distributes multiple leftover paise to lowest IDs on tie", () => {
  // 101 paise split 3 ways:
  // Base share: 33, remainder: 2
  // Member 1 and Member 2 receive 1 extra paise each
  const result = calculateSplits({
    amount: 101,
    paidBy: 2,
    split: { type: "equal", participants: [1, 2, 3] },
    memberIds: MEMBERS_1_TO_3,
  });

  assert.deepEqual(result, {
    "1": 34,
    "2": 34,
    "3": 33,
  });
  assert.equal(result["1"] + result["2"] + result["3"], 101);
});

test("split.equal: participants parameter is optional (defaults to all group members)", () => {
  const result = calculateSplits({
    amount: 1000,
    paidBy: 1,
    split: { type: "equal" }, // participants omitted
    memberIds: MEMBERS_1_TO_4,
  });

  assert.deepEqual(result, {
    "1": 250,
    "2": 250,
    "3": 250,
    "4": 250,
  });
});

test("split.equal: payer does NOT need to be in participants", () => {
  // Member 1 pays for Member 2 and 3
  const result = calculateSplits({
    amount: 5000,
    paidBy: 1,
    split: { type: "equal", participants: [2, 3] },
    memberIds: MEMBERS_1_TO_3,
  });

  assert.deepEqual(result, {
    "2": 2500,
    "3": 2500,
  });
  assert.equal(result["1"], undefined);
});

// ===================================================================
// Shares Splits (PRD Section 6.4, 6.5, 13.1)
// ===================================================================

test("split.shares: calculates with unequal integer weights", () => {
  // 10000 paise with weights 2 : 1 : 1 (total weight 4)
  const result = calculateSplits({
    amount: 10000,
    paidBy: 1,
    split: {
      type: "shares",
      shares: { "1": 2, "2": 1, "3": 1 },
    },
    memberIds: MEMBERS_1_TO_3,
  });

  assert.deepEqual(result, {
    "1": 5000,
    "2": 2500,
    "3": 2500,
  });
  assert.equal(result["1"] + result["2"] + result["3"], 10000);
});

test("split.shares: distributes remainder by largest remainder, then lowest ID", () => {
  // Amount = 100 paise, weights = { 1: 2, 2: 2, 3: 3 } -> totalWeight = 7
  // Base & Remainder:
  // Member 1 (weight 2): floor(200 / 7) = 28, remainder = 4
  // Member 2 (weight 2): floor(200 / 7) = 28, remainder = 4
  // Member 3 (weight 3): floor(300 / 7) = 42, remainder = 6
  // Sum of base = 28 + 28 + 42 = 98. Leftover = 2 paise.
  // 1st extra paise goes to Member 3 (remainder 6).
  // 2nd extra paise goes to Member 1 (tie between 1 & 2 on rem 4; lowest ID wins).
  const result = calculateSplits({
    amount: 100,
    paidBy: 1,
    split: {
      type: "shares",
      shares: { "1": 2, "2": 2, "3": 3 },
    },
    memberIds: MEMBERS_1_TO_3,
  });

  assert.deepEqual(result, {
    "1": 29,
    "2": 28,
    "3": 43,
  });
  assert.equal(result["1"] + result["2"] + result["3"], 100);
});

// ===================================================================
// Exact Splits (PRD Section 6.4, 13.1)
// ===================================================================

test("split.exact: accepts exact amounts summing to total amount", () => {
  const result = calculateSplits({
    amount: 2000,
    paidBy: 1,
    split: {
      type: "exact",
      amounts: { "1": 500, "2": 1500 },
    },
    memberIds: MEMBERS_1_TO_3,
  });

  assert.deepEqual(result, {
    "1": 500,
    "2": 1500,
  });
});

test("split.exact: allows 0 paise for a participant", () => {
  const result = calculateSplits({
    amount: 1000,
    paidBy: 1,
    split: {
      type: "exact",
      amounts: { "1": 1000, "2": 0 },
    },
    memberIds: MEMBERS_1_TO_3,
  });

  assert.deepEqual(result, {
    "1": 1000,
    "2": 0,
  });
});

// ===================================================================
// Validation Errors & Edge Cases
// ===================================================================

test("split: rejects unknown split type with 400 ValidationError", () => {
  assert.throws(
    () =>
      calculateSplits({
        amount: 1000,
        paidBy: 1,
        split: { type: "percentage", percentages: { "1": 100 } },
        memberIds: MEMBERS_1_TO_3,
      }),
    (err) => err instanceof ValidationError && "split.type" in err.errors
  );
});

test("split: rejects invalid amount", () => {
  assert.throws(
    () =>
      calculateSplits({
        amount: 0,
        paidBy: 1,
        split: { type: "equal" },
        memberIds: MEMBERS_1_TO_3,
      }),
    (err) => err instanceof ValidationError && "amount" in err.errors
  );

  assert.throws(
    () =>
      calculateSplits({
        amount: 10.5,
        paidBy: 1,
        split: { type: "equal" },
        memberIds: MEMBERS_1_TO_3,
      }),
    (err) => err instanceof ValidationError && "amount" in err.errors
  );
});

test("split: rejects paidBy not in memberIds", () => {
  assert.throws(
    () =>
      calculateSplits({
        amount: 1000,
        paidBy: 99,
        split: { type: "equal" },
        memberIds: MEMBERS_1_TO_3,
      }),
    (err) => err instanceof ValidationError && "paidBy" in err.errors
  );
});

test("split.equal: rejects duplicate participant ID", () => {
  assert.throws(
    () =>
      calculateSplits({
        amount: 1000,
        paidBy: 1,
        split: { type: "equal", participants: [1, 2, 2] },
        memberIds: MEMBERS_1_TO_3,
      }),
    (err) => err instanceof ValidationError && "split.participants" in err.errors
  );
});

test("split.equal: rejects participant ID not in group", () => {
  assert.throws(
    () =>
      calculateSplits({
        amount: 1000,
        paidBy: 1,
        split: { type: "equal", participants: [1, 99] },
        memberIds: MEMBERS_1_TO_3,
      }),
    (err) => err instanceof ValidationError && "split.participants" in err.errors
  );
});

test("split.shares: rejects weight > 1000 or < 1", () => {
  assert.throws(
    () =>
      calculateSplits({
        amount: 1000,
        paidBy: 1,
        split: { type: "shares", shares: { "1": 1001, "2": 1 } },
        memberIds: MEMBERS_1_TO_3,
      }),
    (err) => err instanceof ValidationError && "split.shares" in err.errors
  );

  assert.throws(
    () =>
      calculateSplits({
        amount: 1000,
        paidBy: 1,
        split: { type: "shares", shares: { "1": 0 } },
        memberIds: MEMBERS_1_TO_3,
      }),
    (err) => err instanceof ValidationError && "split.shares" in err.errors
  );
});

test("split.exact: rejects sum mismatch", () => {
  assert.throws(
    () =>
      calculateSplits({
        amount: 2000,
        paidBy: 1,
        split: { type: "exact", amounts: { "1": 500, "2": 1400 } }, // sum = 1900 != 2000
        memberIds: MEMBERS_1_TO_3,
      }),
    (err) => err instanceof ValidationError && "split.amounts" in err.errors
  );
});

test("split.exact: rejects negative amounts", () => {
  assert.throws(
    () =>
      calculateSplits({
        amount: 1000,
        paidBy: 1,
        split: { type: "exact", amounts: { "1": -200, "2": 1200 } },
        memberIds: MEMBERS_1_TO_3,
      }),
    (err) => err instanceof ValidationError && "split.amounts" in err.errors
  );
});
