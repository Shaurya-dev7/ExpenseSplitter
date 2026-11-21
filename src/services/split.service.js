const { isValidExpenseAmount } = require("../utils/money");

/**
 * Structured validation error matching the PRD specification:
 * statusCode = 400 with { errors: { [fieldName]: "errorMessage" } }
 */
class ValidationError extends Error {
  constructor(errors) {
    super("Validation failed");
    this.name = "ValidationError";
    this.statusCode = 400;
    this.errors = errors;
  }
}

/**
 * Calculate deterministic splits for an expense.
 * Supports "equal", "shares", and "exact" split types.
 *
 * Deterministic rounding for "equal" and "shares":
 * 1. Calculate each member's base share = floor(amount * weight / totalWeight).
 * 2. Calculate remainder = (amount * weight) % totalWeight.
 * 3. Sort participants by remainder descending, tie-breaking by lowest memberId ascending.
 * 4. Distribute leftover paise one by one to highest-ranked participants.
 * 5. Invariant: sum of computed splits strictly equals amount.
 *
 * @param {object} params
 * @param {number} params.amount - Expense amount in integer paise (1 to 1,000,000,000).
 * @param {number} params.paidBy - Member ID of payer (must belong to memberIds).
 * @param {object} params.split - Split definition object.
 * @param {number[]|Set<number>} params.memberIds - Valid member IDs in the group.
 * @returns {object} Map of { [memberIdStr]: splitAmountPaiseInt }
 */
function calculateSplits({ amount, paidBy, split, memberIds }) {
  const errors = {};

  // 1. Validate memberIds
  if (!Array.isArray(memberIds) && !(memberIds instanceof Set)) {
    throw new Error("memberIds must be an array or Set");
  }
  const validMemberSet = new Set(Array.from(memberIds).map((id) => Number(id)));

  // 2. Validate amount
  if (!isValidExpenseAmount(amount)) {
    errors.amount = "Amount must be a whole-number integer between 1 and 1,000,000,000 paise";
  }

  // 3. Validate paidBy
  if (
    typeof paidBy !== "number" ||
    !Number.isSafeInteger(paidBy) ||
    !validMemberSet.has(paidBy)
  ) {
    errors.paidBy = "paidBy must identify a valid member of the group";
  }

  // 4. Validate split object
  if (!split || typeof split !== "object" || Array.isArray(split)) {
    errors.split = "Split specification must be an object";
    throw new ValidationError(errors);
  }

  const { type } = split;
  if (!type || typeof type !== "string" || !["equal", "shares", "exact"].includes(type)) {
    errors["split.type"] = "Split type must be one of: equal, shares, exact";
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError(errors);
  }

  // -------------------------------------------------------------------------
  // EQUAL SPLIT
  // -------------------------------------------------------------------------
  if (type === "equal") {
    let participants = split.participants;

    if (participants === undefined || participants === null) {
      // Optional: defaults to all group members sorted ascending
      participants = Array.from(validMemberSet).sort((a, b) => a - b);
    } else {
      if (!Array.isArray(participants)) {
        throw new ValidationError({
          "split.participants": "participants must be an array of member IDs",
        });
      }
      if (participants.length === 0) {
        throw new ValidationError({
          "split.participants": "At least one split participant is required",
        });
      }

      const seen = new Set();
      for (const p of participants) {
        if (typeof p !== "number" || !Number.isSafeInteger(p) || !validMemberSet.has(p)) {
          throw new ValidationError({
            "split.participants": `Participant ID ${p} is not a valid member of this group`,
          });
        }
        if (seen.has(p)) {
          throw new ValidationError({
            "split.participants": `Duplicate participant ID ${p} is not allowed`,
          });
        }
        seen.add(p);
      }
    }

    const items = participants.map((id) => ({
      memberId: id,
      weight: 1,
    }));

    return distributeWeightedPaise(amount, items);
  }

  // -------------------------------------------------------------------------
  // SHARES SPLIT
  // -------------------------------------------------------------------------
  if (type === "shares") {
    const { shares } = split;
    if (!shares || typeof shares !== "object" || Array.isArray(shares)) {
      throw new ValidationError({
        "split.shares": "shares must be an object mapping member IDs to positive integer weights",
      });
    }

    const keys = Object.keys(shares);
    if (keys.length === 0) {
      throw new ValidationError({
        "split.shares": "At least one split participant with weight is required",
      });
    }

    const items = [];
    for (const key of keys) {
      if (!/^[1-9]\d*$/.test(key)) {
        throw new ValidationError({
          "split.shares": `Invalid member ID key '${key}' in shares`,
        });
      }
      const memberId = parseInt(key, 10);
      if (!validMemberSet.has(memberId)) {
        throw new ValidationError({
          "split.shares": `Member ID ${memberId} does not belong to this group`,
        });
      }

      const weight = shares[key];
      if (
        typeof weight !== "number" ||
        !Number.isSafeInteger(weight) ||
        weight < 1 ||
        weight > 1000
      ) {
        throw new ValidationError({
          "split.shares": `Share weight for member ${memberId} must be a positive integer between 1 and 1000`,
        });
      }

      items.push({ memberId, weight });
    }

    return distributeWeightedPaise(amount, items);
  }

  // -------------------------------------------------------------------------
  // EXACT SPLIT
  // -------------------------------------------------------------------------
  if (type === "exact") {
    const { amounts } = split;
    if (!amounts || typeof amounts !== "object" || Array.isArray(amounts)) {
      throw new ValidationError({
        "split.amounts": "amounts must be an object mapping member IDs to integer paise",
      });
    }

    const keys = Object.keys(amounts);
    if (keys.length === 0) {
      throw new ValidationError({
        "split.amounts": "At least one split participant with an amount is required",
      });
    }

    let sum = 0n;
    const result = {};

    for (const key of keys) {
      if (!/^[1-9]\d*$/.test(key)) {
        throw new ValidationError({
          "split.amounts": `Invalid member ID key '${key}' in amounts`,
        });
      }
      const memberId = parseInt(key, 10);
      if (!validMemberSet.has(memberId)) {
        throw new ValidationError({
          "split.amounts": `Member ID ${memberId} does not belong to this group`,
        });
      }

      const val = amounts[key];
      if (typeof val !== "number" || !Number.isSafeInteger(val) || val < 0) {
        throw new ValidationError({
          "split.amounts": `Amount for member ${memberId} must be a non-negative integer paise`,
        });
      }

      sum += BigInt(val);
      result[String(memberId)] = val;
    }

    if (sum !== BigInt(amount)) {
      throw new ValidationError({
        "split.amounts": `Exact split amounts sum to ${sum} paise, which does not equal the expense amount of ${amount} paise`,
      });
    }

    return result;
  }

  throw new ValidationError({ "split.type": "Unsupported split type" });
}

/**
 * Deterministic paise distribution using BigInt integer math.
 * Distributes floor(amount * weight / totalWeight), calculates remainders,
 * and awards leftover paise to highest remainder, breaking ties by lowest memberId.
 * @param {number} amount
 * @param {Array<{memberId: number, weight: number}>} items
 * @returns {object}
 */
function distributeWeightedPaise(amount, items) {
  const amtBig = BigInt(amount);
  const totalWeight = items.reduce((acc, item) => acc + BigInt(item.weight), 0n);

  let sumBase = 0n;
  const computed = items.map((item) => {
    const w = BigInt(item.weight);
    const base = (amtBig * w) / totalWeight;
    const remainder = (amtBig * w) % totalWeight;
    sumBase += base;
    return {
      memberId: item.memberId,
      base,
      remainder,
    };
  });

  const leftover = Number(amtBig - sumBase);

  // Sort by remainder descending, then memberId ascending (lowest ID first on tie)
  computed.sort((a, b) => {
    if (b.remainder !== a.remainder) {
      return b.remainder > a.remainder ? 1 : -1;
    }
    return a.memberId - b.memberId;
  });

  // Distribute leftover paise
  for (let i = 0; i < leftover; i++) {
    computed[i].base += 1n;
  }

  // Build final splits map with keys as string member IDs
  const splits = {};
  for (const item of computed) {
    splits[String(item.memberId)] = Number(item.base);
  }

  return splits;
}

module.exports = {
  calculateSplits,
  ValidationError,
};
