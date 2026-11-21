/**
 * Lightweight domain errors for the database layer.
 * Maps low-level SQLite constraint failures to predictable codes
 * that controllers can translate into HTTP responses.
 */

class DatabaseError extends Error {
  /**
   * @param {string} message  - Human-readable description.
   * @param {string} code     - Machine-readable error code.
   * @param {number} statusCode - Suggested HTTP status code.
   */
  constructor(message, code, statusCode) {
    super(message);
    this.name = "DatabaseError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

/** Group does not exist. */
function groupNotFound(groupId) {
  return new DatabaseError(
    `Group '${groupId}' not found`,
    "GROUP_NOT_FOUND",
    404
  );
}

/** Expense does not exist (or does not belong to the group). */
function expenseNotFound(expenseId) {
  return new DatabaseError(
    `Expense '${expenseId}' not found`,
    "EXPENSE_NOT_FOUND",
    404
  );
}

/** Case-insensitive duplicate member name within a group. */
function duplicateMember(name) {
  return new DatabaseError(
    `Member '${name}' already exists in this group`,
    "DUPLICATE_MEMBER",
    409
  );
}

/** Group already has 20 members. */
function memberLimitExceeded() {
  return new DatabaseError(
    "Group cannot have more than 20 members",
    "MEMBER_LIMIT_EXCEEDED",
    400
  );
}

/** Foreign key or reference constraint violation. */
function invalidReference(detail) {
  return new DatabaseError(
    detail || "Invalid reference",
    "INVALID_REFERENCE",
    400
  );
}

/**
 * Inspect a raw better-sqlite3 / SQLite error and return
 * the appropriate DatabaseError, or re-throw if unrecognised.
 */
function translateSqliteError(err) {
  const msg = err.message || "";

  // UNIQUE constraint on members(group_id, name)
  if (msg.includes("UNIQUE constraint failed: members.group_id, members.name")) {
    return duplicateMember("");
  }
  if (msg.includes("UNIQUE constraint failed")) {
    return duplicateMember("");
  }

  // FOREIGN KEY constraint
  if (msg.includes("FOREIGN KEY constraint failed")) {
    return invalidReference("Referenced record does not exist");
  }

  // CHECK constraint — could be many things; re-throw as-is
  return null;
}

module.exports = {
  DatabaseError,
  groupNotFound,
  expenseNotFound,
  duplicateMember,
  memberLimitExceeded,
  invalidReference,
  translateSqliteError,
};
