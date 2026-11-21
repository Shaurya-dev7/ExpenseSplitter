const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseRupeesToPaise,
  formatPaiseToRupees,
  isValidExpenseAmount,
  isValidPaymentAmount,
  isValidPaise,
  MAX_EXPENSE_PAISE,
  MIN_EXPENSE_PAISE,
} = require("../src/utils/money");
const { generateGroupId, isValidGroupId } = require("../src/utils/group-id");

// ===================================================================
// Group ID Generator & Validator
// ===================================================================

test("group-id: generates 16-character cryptographically secure URL-safe strings", () => {
  const ids = new Set();
  for (let i = 0; i < 50; i++) {
    const id = generateGroupId();
    assert.equal(typeof id, "string");
    assert.ok(id.length >= 10, "Group ID must be >= 10 chars");
    assert.equal(id.length, 16, "Base64url 12 bytes must be 16 chars");
    assert.ok(isValidGroupId(id), "Generated ID must pass validation");
    ids.add(id);
  }
  // Ensure uniqueness across 50 generations
  assert.equal(ids.size, 50);
});

test("group-id: isValidGroupId validates properly", () => {
  assert.equal(isValidGroupId("abcdef1234"), true);
  assert.equal(isValidGroupId("a-b_c1234567"), true);
  assert.equal(isValidGroupId("short"), false); // < 10 chars
  assert.equal(isValidGroupId("abc def 1234"), false); // spaces
  assert.equal(isValidGroupId("abc!@#$1234"), false); // non-url-safe chars
  assert.equal(isValidGroupId(null), false);
  assert.equal(isValidGroupId(1234567890), false);
});

// ===================================================================
// parseRupeesToPaise (Zero Floats)
// ===================================================================

test("money: parseRupeesToPaise parses whole rupees accurately", () => {
  assert.equal(parseRupeesToPaise("0"), 0);
  assert.equal(parseRupeesToPaise("1"), 100);
  assert.equal(parseRupeesToPaise("10"), 1000);
  assert.equal(parseRupeesToPaise("999"), 99900);
  assert.equal(parseRupeesToPaise(100), 10000);
});

test("money: parseRupeesToPaise parses two decimal places accurately", () => {
  assert.equal(parseRupeesToPaise("0.01"), 1);
  assert.equal(parseRupeesToPaise("0.05"), 5);
  assert.equal(parseRupeesToPaise("0.50"), 50);
  assert.equal(parseRupeesToPaise("10.50"), 1050);
  assert.equal(parseRupeesToPaise("10.05"), 1005);
  assert.equal(parseRupeesToPaise("350.00"), 35000);
  assert.equal(parseRupeesToPaise("99.99"), 9999);
});

test("money: parseRupeesToPaise parses single decimal place by padding to 2 digits", () => {
  assert.equal(parseRupeesToPaise("0.5"), 50);
  assert.equal(parseRupeesToPaise("10.5"), 1050);
  assert.equal(parseRupeesToPaise("1.0"), 100);
});

test("money: parseRupeesToPaise strictly rejects invalid formats and >2 decimals", () => {
  assert.throws(() => parseRupeesToPaise("10.123"), /at most 2 decimal places/);
  assert.throws(() => parseRupeesToPaise("10.999"), /at most 2 decimal places/);
  assert.throws(() => parseRupeesToPaise("-10"), /positive number/);
  assert.throws(() => parseRupeesToPaise("-10.50"), /positive number/);
  assert.throws(() => parseRupeesToPaise(""), /cannot be empty/);
  assert.throws(() => parseRupeesToPaise("   "), /cannot be empty/);
  assert.throws(() => parseRupeesToPaise("abc"), /Invalid rupee amount format/);
  assert.throws(() => parseRupeesToPaise("10.50.20"), /Invalid rupee amount format/);
  assert.throws(() => parseRupeesToPaise("1e5"), /Invalid rupee amount format/);
  assert.throws(() => parseRupeesToPaise(".50"), /Invalid rupee amount format/);
  assert.throws(() => parseRupeesToPaise("50."), /Invalid rupee amount format/);
  assert.throws(() => parseRupeesToPaise(null), /Amount is required/);
  assert.throws(() => parseRupeesToPaise(undefined), /Amount is required/);
});

// ===================================================================
// formatPaiseToRupees (Zero Floats)
// ===================================================================

test("money: formatPaiseToRupees formats integers to two-decimal rupees", () => {
  assert.equal(formatPaiseToRupees(0), "0.00");
  assert.equal(formatPaiseToRupees(1), "0.01");
  assert.equal(formatPaiseToRupees(5), "0.05");
  assert.equal(formatPaiseToRupees(50), "0.50");
  assert.equal(formatPaiseToRupees(100), "1.00");
  assert.equal(formatPaiseToRupees(1005), "10.05");
  assert.equal(formatPaiseToRupees(1050), "10.50");
  assert.equal(formatPaiseToRupees(35000), "350.00");
  assert.equal(formatPaiseToRupees(1000000000), "10000000.00");
});

test("money: formatPaiseToRupees handles negative balances accurately", () => {
  assert.equal(formatPaiseToRupees(-1), "-0.01");
  assert.equal(formatPaiseToRupees(-5), "-0.05");
  assert.equal(formatPaiseToRupees(-50), "-0.50");
  assert.equal(formatPaiseToRupees(-100), "-1.00");
  assert.equal(formatPaiseToRupees(-125), "-1.25");
  assert.equal(formatPaiseToRupees(-35000), "-350.00");
});

test("money: formatPaiseToRupees rejects non-safe-integer", () => {
  assert.throws(() => formatPaiseToRupees(10.5), /must be a safe integer/);
  assert.throws(() => formatPaiseToRupees("35000"), /must be a safe integer/);
  assert.throws(() => formatPaiseToRupees(NaN), /must be a safe integer/);
});

// ===================================================================
// Amount Boundary Validators
// ===================================================================

test("money: boundary validations for expenses and payments", () => {
  assert.equal(isValidExpenseAmount(1), true);
  assert.equal(isValidExpenseAmount(1_000_000_000), true);
  assert.equal(isValidExpenseAmount(0), false);
  assert.equal(isValidExpenseAmount(-1), false);
  assert.equal(isValidExpenseAmount(1_000_000_001), false);
  assert.equal(isValidExpenseAmount(10.5), false);

  assert.equal(isValidPaymentAmount(1), true);
  assert.equal(isValidPaymentAmount(50000), true);
  assert.equal(isValidPaymentAmount(0), false);
  assert.equal(isValidPaymentAmount(-50), false);
});
