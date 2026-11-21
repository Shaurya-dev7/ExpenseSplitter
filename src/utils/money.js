const MAX_EXPENSE_PAISE = 1_000_000_000;
const MIN_EXPENSE_PAISE = 1;

/**
 * Check if a value is a valid whole-number integer in paise.
 * Strictly rejects floats, NaN, Infinity, and values outside safe range.
 * @param {any} value
 * @param {object} [options]
 * @param {number} [options.min=1]
 * @param {number} [options.max=Number.MAX_SAFE_INTEGER]
 * @returns {boolean}
 */
function isValidPaise(value, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= min &&
    value <= max
  );
}

/**
 * Validates expense amounts: whole-number integer paise between 1 and 1,000,000,000.
 * @param {any} value
 * @returns {boolean}
 */
function isValidExpenseAmount(value) {
  return isValidPaise(value, { min: MIN_EXPENSE_PAISE, max: MAX_EXPENSE_PAISE });
}

/**
 * Validates payment amounts: whole-number integer paise >= 1.
 * @param {any} value
 * @returns {boolean}
 */
function isValidPaymentAmount(value) {
  return isValidPaise(value, { min: 1, max: Number.MAX_SAFE_INTEGER });
}

/**
 * Parse a rupee representation (e.g. "10", "10.5", "10.50") into exact integer paise.
 * Strictly uses string splitting and integer arithmetic. Zero floating-point math.
 * Rejects negative values, empty strings, scientific notation, and more than 2 decimal places.
 * @param {string|number} input
 * @returns {number} Integer paise
 */
function parseRupeesToPaise(input) {
  if (input === null || input === undefined) {
    throw new Error("Amount is required");
  }

  const str = String(input).trim();
  if (str === "") {
    throw new Error("Amount cannot be empty");
  }

  // Strict regex: integer or up to two decimal places. Rejects signs, commas, scientific notation.
  if (!/^\d+(?:\.\d{1,2})?$/.test(str)) {
    throw new Error("Invalid rupee amount format. Must be a positive number with at most 2 decimal places");
  }

  const parts = str.split(".");
  const wholePart = parts[0];
  const fracPart = parts[1] || "";
  const paddedFrac = fracPart.padEnd(2, "0");

  const paiseBig = BigInt(wholePart) * 100n + BigInt(paddedFrac);

  if (paiseBig > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Amount exceeds maximum supported value");
  }

  return Number(paiseBig);
}

/**
 * Formats an integer paise value into standard rupee string format with exactly 2 decimal places.
 * Safe for positive, negative, and zero values.
 * Strictly uses integer division and modulo (no floating-point division).
 * Examples: 0 -> "0.00", 5 -> "0.05", 35000 -> "350.00", -125 -> "-1.25".
 * @param {number} paise
 * @returns {string}
 */
function formatPaiseToRupees(paise) {
  if (typeof paise !== "number" || !Number.isSafeInteger(paise)) {
    throw new Error("Paise must be a safe integer");
  }

  const isNegative = paise < 0;
  const absPaise = Math.abs(paise);

  const whole = Math.floor(absPaise / 100);
  const frac = absPaise % 100;
  const fracStr = String(frac).padStart(2, "0");

  return `${isNegative ? "-" : ""}${whole}.${fracStr}`;
}

module.exports = {
  MAX_EXPENSE_PAISE,
  MIN_EXPENSE_PAISE,
  isValidPaise,
  isValidExpenseAmount,
  isValidPaymentAmount,
  parseRupeesToPaise,
  formatPaiseToRupees,
};
