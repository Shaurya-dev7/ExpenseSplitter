/**
 * Exact Integer Money Utilities for Client-Side Operations.
 * ZERO floating-point arithmetic. All monetary values stored and calculated in integer paise.
 */

const MAX_EXPENSE_PAISE = 1_000_000_000;
const MIN_EXPENSE_PAISE = 1;

/**
 * Checks if a value is a valid whole-number integer in paise.
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
 * Parses a rupee string into integer paise.
 * Strictly uses string splitting and integer arithmetic.
 * Examples: "10" -> 1000, "10.5" -> 1050, "10.50" -> 1050.
 * Rejects negative numbers, empty strings, and more than 2 decimal places.
 */
function parseRupeesToPaise(input) {
  if (input === null || input === undefined) {
    throw new Error("Amount is required");
  }

  const str = String(input).trim();
  if (str === "") {
    throw new Error("Amount cannot be empty");
  }

  if (!/^\d+(?:\.\d{1,2})?$/.test(str)) {
    throw new Error("Enter a valid rupee amount (up to 2 decimal places, e.g. 150.50)");
  }

  const parts = str.split(".");
  const wholePart = parts[0];
  const fracPart = parts[1] || "";
  const paddedFrac = fracPart.padEnd(2, "0");

  const paiseBig = BigInt(wholePart) * 100n + BigInt(paddedFrac);

  if (paiseBig > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Amount exceeds maximum supported limit");
  }

  return Number(paiseBig);
}

/**
 * Formats an integer paise value into standard rupee string format with exactly 2 decimal places.
 * Examples: 0 -> "₹0.00", 3500 -> "₹35.00", -1250 -> "-₹12.50".
 */
function formatPaiseToRupees(paise, { withSymbol = true } = {}) {
  if (typeof paise !== "number" || !Number.isSafeInteger(paise)) {
    return withSymbol ? "₹0.00" : "0.00";
  }

  const isNegative = paise < 0;
  const absPaise = Math.abs(paise);

  const whole = Math.floor(absPaise / 100);
  const frac = absPaise % 100;
  const fracStr = String(frac).padStart(2, "0");

  // Format integer part with Indian number grouping (e.g., 1,00,000) or standard comma grouping
  const formattedWhole = whole.toLocaleString("en-IN");
  const sign = isNegative ? "-" : "";
  const symbol = withSymbol ? "₹" : "";

  return `${sign}${symbol}${formattedWhole}.${fracStr}`;
}

/**
 * Client-side deterministic preview calculation matching the backend split service.
 * Used for instant, zero-latency feedback in the Add Expense modal.
 */
function calculatePreviewSplits(amountPaise, splitType, splitConfig, members) {
  if (!amountPaise || amountPaise <= 0) {
    return { splits: {}, isValid: false, message: "Enter an amount to see split" };
  }

  if (splitType === "equal") {
    const participants = splitConfig.participants || [];
    if (participants.length === 0) {
      return { splits: {}, isValid: false, message: "Select at least one participant" };
    }

    const amtBig = BigInt(amountPaise);
    const countBig = BigInt(participants.length);
    const baseShare = amtBig / countBig;
    const remainder = Number(amtBig % countBig);

    // Sort participants by memberId ascending
    const sorted = [...participants].sort((a, b) => a - b);
    const splits = {};

    for (let i = 0; i < sorted.length; i++) {
      const extra = i < remainder ? 1n : 0n;
      splits[sorted[i]] = Number(baseShare + extra);
    }

    return {
      splits,
      isValid: true,
      remainder,
      message: remainder > 0 ? `${remainder} paise remainder distributed to first ${remainder} member(s)` : "Split equally",
    };
  }

  if (splitType === "shares") {
    const shares = splitConfig.shares || {};
    const memberIds = Object.keys(shares).map(Number).filter((id) => (shares[id] || 0) > 0);

    if (memberIds.length === 0) {
      return { splits: {}, isValid: false, message: "Specify at least one share weight > 0" };
    }

    const items = memberIds.map((id) => ({
      memberId: id,
      weight: Number(shares[id]),
    }));

    const amtBig = BigInt(amountPaise);
    const totalWeight = items.reduce((acc, it) => acc + BigInt(it.weight), 0n);

    if (totalWeight <= 0n) {
      return { splits: {}, isValid: false, message: "Total shares must be greater than 0" };
    }

    let sumBase = 0n;
    const computed = items.map((item) => {
      const w = BigInt(item.weight);
      const base = (amtBig * w) / totalWeight;
      const rem = (amtBig * w) % totalWeight;
      sumBase += base;
      return { memberId: item.memberId, base, remainder: rem };
    });

    const leftover = Number(amtBig - sumBase);

    computed.sort((a, b) => {
      if (b.remainder !== a.remainder) {
        return b.remainder > a.remainder ? 1 : -1;
      }
      return a.memberId - b.memberId;
    });

    for (let i = 0; i < leftover; i++) {
      computed[i].base += 1n;
    }

    const splits = {};
    for (const it of computed) {
      splits[it.memberId] = Number(it.base);
    }

    return {
      splits,
      isValid: true,
      remainder: leftover,
      message: `Distributed proportionally across ${totalWeight} total shares`,
    };
  }

  if (splitType === "exact") {
    const amounts = splitConfig.amounts || {};
    const keys = Object.keys(amounts);
    let sumPaise = 0;
    const splits = {};

    for (const k of keys) {
      const p = amounts[k] || 0;
      if (p > 0) {
        splits[k] = p;
        sumPaise += p;
      }
    }

    const diff = amountPaise - sumPaise;
    const isValid = diff === 0 && Object.keys(splits).length > 0;

    let message = "";
    if (diff === 0) {
      message = "Exact amounts match total!";
    } else if (diff > 0) {
      message = `${formatPaiseToRupees(diff)} left to allocate`;
    } else {
      message = `${formatPaiseToRupees(-diff)} over total`;
    }

    return {
      splits,
      isValid,
      diff,
      message,
    };
  }

  return { splits: {}, isValid: false, message: "Unsupported split type" };
}

window.MoneyUtils = {
  MAX_EXPENSE_PAISE,
  MIN_EXPENSE_PAISE,
  isValidPaise,
  parseRupeesToPaise,
  formatPaiseToRupees,
  calculatePreviewSplits,
};
